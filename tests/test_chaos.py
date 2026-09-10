"""Phase 6 — the chaos test that produces the resume metric.

Links 20 accounts, then syncs all of them concurrently for several rounds
against a provider that fails ~10% of calls. Asserts the two things the design
doc asks for: **zero duplicate transactions** and **zero unhandled crashes**.
"""

import random
import time

import pytest
from sqlalchemy import func, select

from app import provider as provider_mod
from app.config import settings
from app.models import SyncJob, Transaction

N_ACCOUNTS = 20
TXNS_PER_BANK = 5
ROUNDS = 3
FAIL_RATE = 0.10


def _ok_request():
    async def _request(path: str):
        slug = path.strip("/").split("/")[0]
        if path.endswith("/accounts"):
            return [{"account_id": f"acc-{slug}", "balance": 100, "currency": "GHS"}]
        return [
            {
                "provider_transaction_id": f"{slug}-t{i}",
                "amount": i + 1,
                "description": "tx",
                "posted_at": "2026-01-01",
            }
            for i in range(TXNS_PER_BANK)
        ]

    return _request


def _chaos_request(seed: int = 1234):
    rng = random.Random(seed)
    stats = {"calls": 0, "injected_failures": 0}
    inner = _ok_request()

    async def _request(path: str):
        stats["calls"] += 1
        if rng.random() < FAIL_RATE:
            stats["injected_failures"] += 1
            raise provider_mod.ProviderError("chaos 503", status_code=503)
        return await inner(path)

    return _request, stats


@pytest.fixture(autouse=True)
def _fast_backoff(monkeypatch):
    monkeypatch.setattr(settings, "provider_backoff_base_seconds", 0.001)
    monkeypatch.setattr(settings, "provider_backoff_max_seconds", 0.01)


async def test_concurrent_sync_chaos(auth_client, sessionmaker_, run_sync, monkeypatch, capsys):
    import asyncio

    # --- link 20 accounts with a healthy provider
    monkeypatch.setattr(provider_mod, "_request", _ok_request())
    linked_ids = []
    for i in range(N_ACCOUNTS):
        token = (await auth_client.post("/accounts/link", json={})).json()["link_token"]
        body = (
            await auth_client.post(
                "/accounts/link/callback",
                json={
                    "link_token": token,
                    "bank_slug": f"chaos-{i}",
                    "institution_name": f"Chaos {i}",
                },
            )
        ).json()
        linked_ids.append(body["linked_account_id"])

    # --- now sync everything concurrently, several times, with a flaky provider
    chaos, stats = _chaos_request()
    monkeypatch.setattr(provider_mod, "_request", chaos)

    started = time.monotonic()
    outcomes = []
    for _ in range(ROUNDS):
        results = await asyncio.gather(
            *(run_sync(lid) for lid in linked_ids), return_exceptions=True
        )
        outcomes.extend(results)
    elapsed = time.monotonic() - started

    # --- zero unhandled crashes
    crashes = [r for r in outcomes if isinstance(r, BaseException)]
    assert not crashes, f"unhandled exceptions: {crashes!r}"

    # every attempt reached a terminal state
    jobs = [r for r in outcomes if r is not None]
    assert all(j.status.value in {"success", "failed"} for j in jobs)

    async with sessionmaker_() as s:
        # zero duplicate transactions
        dupes = (
            await s.execute(
                select(
                    Transaction.account_id,
                    Transaction.provider_transaction_id,
                    func.count().label("n"),
                )
                .group_by(Transaction.account_id, Transaction.provider_transaction_id)
                .having(func.count() > 1)
            )
        ).all()
        assert dupes == [], f"duplicate transactions: {dupes!r}"

        total_txns = await s.scalar(select(func.count()).select_from(Transaction))
        stuck = await s.scalar(
            select(func.count())
            .select_from(SyncJob)
            .where(SyncJob.status == "in_progress")
        )
        succeeded = sum(1 for j in jobs if j.status.value == "success")
        failed = sum(1 for j in jobs if j.status.value == "failed")

    assert stuck == 0
    # transactions can never exceed the unique universe, no matter how many syncs ran
    assert total_txns <= N_ACCOUNTS * TXNS_PER_BANK

    metric = (
        f"\nCHAOS METRIC: {N_ACCOUNTS} accounts x {ROUNDS} rounds = {len(outcomes)} "
        f"concurrent syncs in {elapsed:.2f}s | provider calls={stats['calls']} "
        f"injected 503s={stats['injected_failures']} "
        f"({stats['injected_failures'] / max(stats['calls'], 1):.0%}) | "
        f"jobs: {succeeded} success / {failed} failed | "
        f"transactions stored={total_txns} | duplicates=0 | unhandled crashes=0\n"
    )
    with capsys.disabled():
        print(metric)
