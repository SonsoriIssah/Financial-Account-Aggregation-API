"""Phase 4 — force each failure mode and check the response.

Retry/backoff, retry exhaustion, no-retry + needs_reauth on auth errors,
re-link recovery, the provider token bucket, and the per-user API limit. The
provider's HTTP layer (``app.provider._request``) is replaced with a scripted
fake so failures are deterministic. Sync is driven through the worker's unit of
work via the ``run_sync`` fixture (fresh session per call, like the worker).
"""

import uuid

import pytest

from app import provider as provider_mod
from app.config import settings
from app.models import LinkedAccount
from app.provider import ProviderError

ACCOUNTS = [{"account_id": "acc-x-1", "balance": 100, "currency": "GHS"}]
TXNS = [
    {
        "provider_transaction_id": "t1",
        "amount": 10,
        "description": "coffee",
        "posted_at": "2026-01-01",
    }
]


def make_request(*, accounts_fails=0, txns_fails=0, error=None, always_fail=False):
    calls = {"accounts": 0, "transactions": 0}
    err = error or ProviderError("boom 503", status_code=503)

    async def _request(path: str):
        which = "accounts" if path.endswith("/accounts") else "transactions"
        calls[which] += 1
        budget = accounts_fails if which == "accounts" else txns_fails
        if always_fail or calls[which] <= budget:
            raise err
        return ACCOUNTS if which == "accounts" else TXNS

    return _request, calls


@pytest.fixture(autouse=True)
def _fast(monkeypatch):
    monkeypatch.setattr(settings, "provider_backoff_base_seconds", 0.001)
    monkeypatch.setattr(settings, "provider_backoff_max_seconds", 0.01)
    monkeypatch.setattr(settings, "worker_max_requeue_delay_seconds", 0.01)


async def _link(client, monkeypatch, slug="bank-x"):
    """Link a bank with a working provider; return (linked_account_id, account_id)."""
    monkeypatch.setattr(provider_mod, "_request", make_request()[0])
    token = (await client.post("/accounts/link", json={})).json()["link_token"]
    body = (
        await client.post(
            "/accounts/link/callback",
            json={"link_token": token, "bank_slug": slug, "institution_name": "Bank X"},
        )
    ).json()
    return body["linked_account_id"], body["accounts"][0]["id"]


async def _status(sessionmaker_, lid):
    async with sessionmaker_() as s:
        return (await s.get(LinkedAccount, uuid.UUID(lid))).status.value


async def test_retry_then_success(auth_client, run_sync, monkeypatch, kafka_capture):
    lid, _ = await _link(auth_client, monkeypatch)

    flaky, calls = make_request(accounts_fails=2)
    monkeypatch.setattr(provider_mod, "_request", flaky)

    job = await run_sync(lid)
    assert job.status.value == "success"
    assert calls["accounts"] == 3  # 1 attempt + 2 retries
    results = [m for m in kafka_capture if m["topic"] == settings.kafka_sync_results_topic]
    assert results[-1]["value"]["status"] == "success"


async def test_retry_exhausted_marks_failed_but_keeps_account_active(
    auth_client, run_sync, sessionmaker_, monkeypatch
):
    lid, _ = await _link(auth_client, monkeypatch)

    hard, calls = make_request(always_fail=True)
    monkeypatch.setattr(provider_mod, "_request", hard)

    job = await run_sync(lid)
    assert job.status.value == "failed"
    assert calls["accounts"] == settings.provider_max_attempts
    assert await _status(sessionmaker_, lid) == "active"  # transient -> retried later


async def test_auth_error_no_retry_and_needs_reauth(
    auth_client, run_sync, sessionmaker_, monkeypatch
):
    lid, acc_id = await _link(auth_client, monkeypatch)

    unauth, calls = make_request(
        always_fail=True, error=ProviderError("401", status_code=401)
    )
    monkeypatch.setattr(provider_mod, "_request", unauth)

    job = await run_sync(lid)
    assert job.status.value == "failed"
    assert calls["accounts"] == 1  # auth errors are not retried
    assert await _status(sessionmaker_, lid) == "needs_reauth"

    # the endpoint refuses to even queue a sync now
    assert (await auth_client.post(f"/accounts/{acc_id}/sync")).status_code == 409


async def test_relink_recovers_from_needs_reauth(
    auth_client, run_sync, sessionmaker_, monkeypatch
):
    lid, _ = await _link(auth_client, monkeypatch)

    unauth, _ = make_request(always_fail=True, error=ProviderError("401", status_code=401))
    monkeypatch.setattr(provider_mod, "_request", unauth)
    await run_sync(lid)
    assert await _status(sessionmaker_, lid) == "needs_reauth"

    await _link(auth_client, monkeypatch)  # re-link reactivates the connection
    assert await _status(sessionmaker_, lid) == "active"
    job = await run_sync(lid)
    assert job.status.value == "success"


async def test_provider_token_bucket_requeues(
    auth_client, run_sync, monkeypatch, kafka_capture
):
    lid, _ = await _link(auth_client, monkeypatch)
    kafka_capture.clear()

    monkeypatch.setattr(settings, "provider_rate_capacity", 0)
    monkeypatch.setattr(settings, "provider_rate_refill_per_second", 0.0001)

    job = await run_sync(lid)
    assert job.status.value == "failed"
    assert getattr(job, "rate_limited", False) is True
    requeues = [
        m
        for m in kafka_capture
        if m["topic"] == settings.kafka_sync_requests_topic
        and m["value"]["reason"] == "retry"
    ]
    assert len(requeues) == 1


async def test_per_user_api_rate_limit(auth_client, monkeypatch):
    _, acc_id = await _link(auth_client, monkeypatch)
    monkeypatch.setattr(settings, "api_rate_limit_per_minute", 2)

    assert (await auth_client.post(f"/accounts/{acc_id}/sync")).status_code == 202
    assert (await auth_client.post(f"/accounts/{acc_id}/sync")).status_code == 202
    assert (await auth_client.post(f"/accounts/{acc_id}/sync")).status_code == 429
