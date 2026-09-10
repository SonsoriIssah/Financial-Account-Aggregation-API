"""Phase 5 — sync happens off the request path.

The endpoint enqueues; the scheduler enqueues due links; the worker consumes.
Kafka is captured in memory (see the ``kafka_capture`` fixture).
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app import kafka_client
from app import provider as provider_mod
from app.config import settings
from app.models import LinkedAccount, LinkedAccountStatus
from app.scheduler import enqueue_due_syncs
from tests.test_resilience import make_request


@pytest.fixture(autouse=True)
def _working_provider(monkeypatch):
    monkeypatch.setattr(provider_mod, "_request", make_request()[0])


async def _link(client, slug="bank-x", institution="Bank X"):
    token = (await client.post("/accounts/link", json={})).json()["link_token"]
    body = (
        await client.post(
            "/accounts/link/callback",
            json={"link_token": token, "bank_slug": slug, "institution_name": institution},
        )
    ).json()
    return body["linked_account_id"], body["accounts"][0]["id"]


async def test_manual_sync_enqueues_and_returns_202(auth_client, kafka_capture):
    lid, acc_id = await _link(auth_client)
    kafka_capture.clear()

    r = await auth_client.post(f"/accounts/{acc_id}/sync")
    assert r.status_code == 202
    assert r.json() == {"linked_account_id": lid, "status": "queued", "queued": True}

    msgs = [m for m in kafka_capture if m["topic"] == settings.kafka_sync_requests_topic]
    assert len(msgs) == 1
    assert msgs[0]["key"] == lid
    assert msgs[0]["value"]["reason"] == "manual"


async def test_sync_endpoint_survives_kafka_down(auth_client, monkeypatch):
    _, acc_id = await _link(auth_client)

    async def _down(*a, **k):
        return False

    monkeypatch.setattr(kafka_client, "publish", _down)

    r = await auth_client.post(f"/accounts/{acc_id}/sync")
    assert r.status_code == 202
    assert r.json()["queued"] is False


async def test_scheduler_enqueues_due_active_links_only(auth_client, db, kafka_capture):
    lid_a, _ = await _link(auth_client, slug="bank-a", institution="A")
    lid_b, _ = await _link(auth_client, slug="bank-b", institution="B")
    kafka_capture.clear()

    # a was synced just now (link ran an initial sync); make b overdue and
    # push a into needs_reauth so it is skipped
    la = await db.get(LinkedAccount, uuid.UUID(lid_a))
    la.status = LinkedAccountStatus.NEEDS_REAUTH
    lb = await db.get(LinkedAccount, uuid.UUID(lid_b))
    lb.last_synced_at = datetime.now(timezone.utc) - timedelta(days=1)
    await db.commit()

    count = await enqueue_due_syncs(db)
    assert count == 1
    enqueued = [
        m["value"]["linked_account_id"]
        for m in kafka_capture
        if m["topic"] == settings.kafka_sync_requests_topic
    ]
    assert enqueued == [lid_b]
    assert all(
        m["value"]["reason"] == "scheduled"
        for m in kafka_capture
        if m["topic"] == settings.kafka_sync_requests_topic
    )


async def test_worker_skips_unknown_and_reauth_accounts(
    auth_client, db, run_sync, kafka_capture
):
    lid, _ = await _link(auth_client)
    la = await db.get(LinkedAccount, uuid.UUID(lid))
    la.status = LinkedAccountStatus.NEEDS_REAUTH
    await db.commit()
    kafka_capture.clear()

    assert await run_sync(uuid.uuid4()) is None
    assert await run_sync(lid) is None
    assert await run_sync("not-a-uuid") is None
    assert kafka_capture == []  # nothing synced, nothing emitted


async def test_worker_runs_sync_and_emits_result(auth_client, run_sync, kafka_capture):
    lid, acc_id = await _link(auth_client)
    kafka_capture.clear()

    job = await run_sync(lid)
    assert job.status.value == "success"

    results = [m for m in kafka_capture if m["topic"] == settings.kafka_sync_results_topic]
    assert len(results) == 1
    v = results[0]["value"]
    assert v["linked_account_id"] == lid
    assert v["sync_job_id"] == str(job.id)
    assert v["status"] == "success"


async def test_sync_status_reports_latest_job(auth_client):
    lid, acc_id = await _link(auth_client)  # link runs an initial sync

    r = await auth_client.get(f"/accounts/{acc_id}/sync-status")
    assert r.status_code == 200
    body = r.json()
    assert body["linked_account_id"] == lid
    assert body["account_status"] == "active"
    assert body["last_synced_at"] is not None
    assert body["latest_job"]["status"] == "success"

    # another user can't see it
    await auth_client.post(
        "/auth/register", json={"email": "other@example.com", "password": "pw-123456"}
    )
    other = (
        await auth_client.post(
            "/auth/login", json={"email": "other@example.com", "password": "pw-123456"}
        )
    ).json()["access_token"]
    r = await auth_client.get(
        f"/accounts/{acc_id}/sync-status", headers={"Authorization": f"Bearer {other}"}
    )
    assert r.status_code == 404
