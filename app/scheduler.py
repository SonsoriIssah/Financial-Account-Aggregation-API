"""Periodic sync scheduler.

Every ``scheduler_poll_seconds`` it enqueues a sync request for each active
linked account that has never synced or hasn't synced within
``sync_interval_seconds``. Run it as its own process:

    python -m app.scheduler

Losing an enqueue is harmless — the account is simply picked up on the next
pass (design doc 6.4 / 7.6).
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select

from app import kafka_client
from app.config import settings
from app.database import AsyncSessionLocal
from app.models import LinkedAccount, LinkedAccountStatus

log = logging.getLogger(__name__)


async def enqueue_due_syncs(db) -> int:
    """Enqueue every active link that is due for a sync. Returns the count."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.sync_interval_seconds)
    result = await db.execute(
        select(LinkedAccount).where(
            LinkedAccount.status == LinkedAccountStatus.ACTIVE,
            or_(
                LinkedAccount.last_synced_at.is_(None),
                LinkedAccount.last_synced_at < cutoff,
            ),
        )
    )
    due = list(result.scalars())
    for linked in due:
        await kafka_client.enqueue_sync(linked.id, reason="scheduled")
    if due:
        log.info("enqueued %d due sync(s)", len(due))
    return len(due)


async def run_scheduler() -> None:
    log.info(
        "scheduler polling every %ds (sync interval %ds)",
        settings.scheduler_poll_seconds,
        settings.sync_interval_seconds,
    )
    try:
        while True:
            try:
                async with AsyncSessionLocal() as db:
                    await enqueue_due_syncs(db)
            except Exception:  # noqa: BLE001 - keep polling despite a bad pass
                log.exception("scheduler pass failed")
            await asyncio.sleep(settings.scheduler_poll_seconds)
    finally:
        await kafka_client.close_producer()


def main() -> None:
    from app.logging_config import configure_logging

    configure_logging()
    asyncio.run(run_scheduler())


if __name__ == "__main__":
    main()
