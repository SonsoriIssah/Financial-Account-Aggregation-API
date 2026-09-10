"""Standalone sync worker.

Consumes ``account-sync-requests``, runs the same
:func:`app.sync.sync_linked_account` the API used to call inline, and emits an
``account-sync-results`` event per attempt. Run it as its own process:

    python -m app.worker

Offsets are committed after each message. The sync itself is idempotent (the
transactions unique constraint + ``ON CONFLICT DO NOTHING``), so an
at-least-once redelivery can't double-count; a message that raises is logged
and skipped rather than looping forever.
"""

import asyncio
import json
import logging
from uuid import UUID

from aiokafka import AIOKafkaConsumer

from app import kafka_client
from app.config import settings
from app.database import AsyncSessionLocal
from app.models import LinkedAccount, LinkedAccountStatus, SyncJob
from app.sync import sync_linked_account

log = logging.getLogger(__name__)


async def process_sync_request(db, payload: dict) -> SyncJob | None:
    """Handle one decoded request message. Returns the SyncJob, or None if the
    message was skipped (unknown / deleted / needs-reauth account)."""
    raw_id = payload.get("linked_account_id")
    try:
        linked_account_id = UUID(str(raw_id))
    except (TypeError, ValueError):
        log.warning("bad linked_account_id in message, skipping: %r", raw_id)
        return None

    linked = await db.get(LinkedAccount, linked_account_id)
    if linked is None:
        log.info("linked account %s no longer exists, skipping", linked_account_id)
        return None
    if linked.status == LinkedAccountStatus.NEEDS_REAUTH:
        log.info("linked account %s needs re-auth, not syncing", linked_account_id)
        return None

    job = await sync_linked_account(db, linked)

    await kafka_client.publish(
        settings.kafka_sync_results_topic,
        str(linked_account_id),
        {
            "linked_account_id": str(linked_account_id),
            "sync_job_id": str(job.id),
            "status": job.status.value,
            "transactions_synced": getattr(job, "transactions_synced", 0),
            "error_message": job.error_message,
            "finished_at": (
                job.finished_at.isoformat()
                if job.finished_at
                else kafka_client.now_iso()
            ),
        },
    )

    if getattr(job, "rate_limited", False):
        delay = min(
            getattr(job, "retry_after", None) or 30.0,
            settings.worker_max_requeue_delay_seconds,
        )
        log.info("rate limited on %s, requeueing in %.0fs", linked_account_id, delay)
        await asyncio.sleep(delay)
        await kafka_client.enqueue_sync(linked_account_id, reason="retry")

    return job


async def run_worker() -> None:
    consumer = AIOKafkaConsumer(
        settings.kafka_sync_requests_topic,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.kafka_consumer_group,
        enable_auto_commit=False,
        auto_offset_reset="earliest",
    )
    await consumer.start()
    log.info("worker consuming %s", settings.kafka_sync_requests_topic)
    try:
        async for msg in consumer:
            try:
                payload = json.loads(msg.value)
            except (ValueError, TypeError):
                log.warning("undecodable message at offset %s, skipping", msg.offset)
                await consumer.commit()
                continue
            try:
                async with AsyncSessionLocal() as db:
                    await process_sync_request(db, payload)
            except Exception:  # noqa: BLE001 - never let one message kill the worker
                log.exception("failed to process %s", payload)
            await consumer.commit()
    finally:
        await consumer.stop()
        await kafka_client.close_producer()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
