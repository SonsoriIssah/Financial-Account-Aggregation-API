"""Phase 4 — deliberately force each failure mode and check the response.

Covers: retry with backoff, retry exhaustion, no-retry + needs_reauth on auth
errors, re-link recovery, the provider token bucket, and the per-user API
limit. The provider's HTTP layer (``app.provider._request``) is replaced with a
scripted fake so failures are deterministic.
"""

import uuid

import pytest

from app import provider as provider_mod
from app.config import settings
from app.models import Account, LinkedAccount
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
    """Build a fake ``_request`` plus a dict tracking calls per endpoint."""
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
def _fast_backoff(monkeypatch):
    monkeypatch.setattr(settings, "provider_backoff_base_seconds", 0.001)
    monkeypatch.setattr(settings, "provider_backoff_max_seconds", 0.01)


async def _link(client, slug="bank-x"):
    token = (await client.post("/accounts/link", json={})).json()["link_token"]
    return await client.post(
        "/accounts/link/callback",
        json={"link_token": token, "bank_slug": slug, "institution_name": "Bank X"},
    )


async def _linked_account_id(client, monkeypatch):
    monkeypatch.setattr(provider_mod, "_request", make_request()[0])
    r = await _link(client)
    return r.json()["accounts"][0]["id"]


async def test_retry_then_success(auth_client, monkeypatch):
    acc_id = await _linked_account_id(auth_client, monkeypatch)

    flaky, calls = make_request(accounts_fails=2)  # fail twice, then succeed
    monkeypatch.setattr(provider_mod, "_request", flaky)

    r = await auth_client.post(f"/accounts/{acc_id}/sync")
    assert r.status_code == 200
    assert r.json()["status"] == "success"
    assert calls["accounts"] == 3  # 1 attempt + 2 retries


async def test_retry_exhausted_marks_failed_but_keeps_account_active(
    auth_client, monkeypatch, db
):
    acc_id = await _linked_account_id(auth_client, monkeypatch)

    hard, calls = make_request(always_fail=True)
    monkeypatch.setattr(provider_mod, "_request", hard)

    r = await auth_client.post(f"/accounts/{acc_id}/sync")
    assert r.status_code == 200
    assert r.json()["status"] == "failed"
    assert calls["accounts"] == settings.provider_max_attempts  # capped

    acc = await db.get(Account, uuid.UUID(acc_id))
    la = await db.get(LinkedAccount, acc.linked_account_id)
    assert la.status.value == "active"  # transient failure -> retry next time


async def test_auth_error_does_not_retry_and_flags_needs_reauth(
    auth_client, monkeypatch, db
):
    acc_id = await _linked_account_id(auth_client, monkeypatch)

    unauth, calls = make_request(
        always_fail=True, error=ProviderError("401 unauthorized", status_code=401)
    )
    monkeypatch.setattr(provider_mod, "_request", unauth)

    r = await auth_client.post(f"/accounts/{acc_id}/sync")
    assert r.json()["status"] == "failed"
    assert calls["accounts"] == 1  # auth errors are not retried

    acc = await db.get(Account, uuid.UUID(acc_id))
    la = await db.get(LinkedAccount, acc.linked_account_id)
    assert la.status.value == "needs_reauth"

    # further syncs are refused until re-link
    assert (await auth_client.post(f"/accounts/{acc_id}/sync")).status_code == 409


async def test_relink_recovers_from_needs_reauth(auth_client, monkeypatch):
    acc_id = await _linked_account_id(auth_client, monkeypatch)

    unauth, _ = make_request(
        always_fail=True, error=ProviderError("401", status_code=401)
    )
    monkeypatch.setattr(provider_mod, "_request", unauth)
    await auth_client.post(f"/accounts/{acc_id}/sync")
    assert (await auth_client.post(f"/accounts/{acc_id}/sync")).status_code == 409

    monkeypatch.setattr(provider_mod, "_request", make_request()[0])
    r = await _link(auth_client)  # same slug -> reactivates the link
    assert r.json()["status"] == "active"
    assert (await auth_client.post(f"/accounts/{acc_id}/sync")).status_code == 200


async def test_provider_token_bucket_returns_429(auth_client, monkeypatch):
    acc_id = await _linked_account_id(auth_client, monkeypatch)

    monkeypatch.setattr(settings, "provider_rate_capacity", 0)
    monkeypatch.setattr(settings, "provider_rate_refill_per_second", 0.0001)

    r = await auth_client.post(f"/accounts/{acc_id}/sync")
    assert r.status_code == 429
    assert "retry-after" in {k.lower() for k in r.headers}


async def test_per_user_api_rate_limit(auth_client, monkeypatch):
    acc_id = await _linked_account_id(auth_client, monkeypatch)
    monkeypatch.setattr(settings, "api_rate_limit_per_minute", 2)

    assert (await auth_client.post(f"/accounts/{acc_id}/sync")).status_code == 200
    assert (await auth_client.post(f"/accounts/{acc_id}/sync")).status_code == 200
    assert (await auth_client.post(f"/accounts/{acc_id}/sync")).status_code == 429
