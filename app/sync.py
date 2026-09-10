"""Synchronous account sync (Phase 3 — no queue yet).

One entry point, :func:`sync_linked_account`, does the whole job for a single
linked account:

    1. open a sync_jobs row (in_progress)
    2. pull accounts + transactions from the provider
    3. refresh cached balances
    4. insert new transactions, skipping duplicates at the DB layer
    5. stamp last_synced_at and close the job (success)

A provider failure closes the job as failed (and, for an auth error, flips the
linked account to needs_reauth so it stops being synced). A failure while
committing rolls the work back and still records a failed job. Later phases
move this behind Kafka; the logic stays the same.

The returned SyncJob carries a transient ``transactions_synced`` attribute for
the caller's response — it is not a stored column.
"""

import logging
import time
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Account,
    LinkedAccount,
    LinkedAccountStatus,
    SyncJob,
    SyncJobStatus,
    Transaction,
)
from app.provider import ProviderError, normalize_transaction
from app.providers import get_provider
from app.ratelimit import RateLimited


log = logging.getLogger("app.sync")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _emit(job: SyncJob, linked_account_id, started: float, synced: int) -> SyncJob:
    job.transactions_synced = synced
    log.info(
        "sync finished",
        extra={
            "linked_account_id": str(linked_account_id),
            "sync_job_id": str(job.id),
            "status": job.status.value,
            "transactions_synced": synced,
            "rate_limited": getattr(job, "rate_limited", False),
            "duration_ms": round((time.monotonic() - started) * 1000),
        },
    )
    return job


async def sync_linked_account(db: AsyncSession, linked_account: LinkedAccount) -> SyncJob:
    linked_account_id = linked_account.id
    started = time.monotonic()

    job = SyncJob(linked_account_id=linked_account_id, status=SyncJobStatus.IN_PROGRESS)
    db.add(job)
    await db.flush()

    # 1. pull from the provider (retry/backoff and the outbound token bucket
    #    live in app.provider for the mock)
    provider = get_provider()
    try:
        provider_accounts = await provider.fetch_accounts(linked_account)
        provider_txns = await provider.fetch_transactions(linked_account)
    except (ProviderError, RateLimited) as exc:
        job.status = SyncJobStatus.FAILED
        job.error_message = str(exc)[:1000]
        job.finished_at = _now()
        rate_limited = isinstance(exc, RateLimited)
        if isinstance(exc, ProviderError) and exc.is_auth_error:
            # permanent until the user re-links; stop syncing this account
            linked_account.status = LinkedAccountStatus.NEEDS_REAUTH
        await db.commit()
        await db.refresh(job)
        job.rate_limited = rate_limited
        job.retry_after = getattr(exc, "retry_after", None)
        return _emit(job, linked_account_id, started, 0)

    # 2. refresh cached balances
    result = await db.execute(
        select(Account).where(Account.linked_account_id == linked_account_id)
    )
    accounts = list(result.scalars())
    by_provider_id = {a.provider_account_id: a for a in accounts}
    for pa in provider_accounts:
        acc = by_provider_id.get(pa.account_id)
        if acc is not None:
            acc.current_balance = pa.balance
            acc.currency = pa.currency

    # 3. insert new transactions; duplicates are dropped by the DB constraint.
    # The mock's /transactions feed isn't per-account, so attach to the link's
    # sole account.
    inserted = 0
    target = accounts[0] if accounts else None
    if target is not None and provider_txns:
        rows = [
            normalize_transaction(t, account_id=target.id, currency=target.currency)
            for t in provider_txns
        ]
        res = await db.execute(
            pg_insert(Transaction)
            .values(rows)
            .on_conflict_do_nothing(
                index_elements=["account_id", "provider_transaction_id"]
            )
        )
        inserted = res.rowcount or 0

    # 4. close out
    linked_account.last_synced_at = _now()
    job.status = SyncJobStatus.SUCCESS
    job.finished_at = _now()

    try:
        await db.commit()
    except Exception as exc:  # noqa: BLE001 - record a failed job regardless
        await db.rollback()
        failed = SyncJob(
            linked_account_id=linked_account_id,
            status=SyncJobStatus.FAILED,
            error_message=f"commit failed: {exc}"[:1000],
            finished_at=_now(),
        )
        db.add(failed)
        await db.commit()
        await db.refresh(failed)
        return _emit(failed, linked_account_id, started, 0)

    await db.refresh(job)
    return _emit(job, linked_account_id, started, inserted)
