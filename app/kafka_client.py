"""Kafka producer + message helpers.

The API process only ever *produces* (a sync request onto
``account-sync-requests``); the worker consumes. Producing is best-effort: if
the broker is briefly unreachable :func:`publish` logs and returns ``False``
rather than failing the request — the scheduler's next pass will pick the
account up anyway (design doc 7.6).

Messages are JSON. Keys are the ``linked_account_id`` string, so every message
for one account lands on the same partition and is processed in order
(design doc 8).
"""

import json
import logging
from datetime import datetime, timezone

from aiokafka import AIOKafkaProducer
from aiokafka.errors import KafkaError

from app.config import settings

log = logging.getLogger(__name__)

_producer: AIOKafkaProducer | None = None


async def get_producer() -> AIOKafkaProducer:
    global _producer
    if _producer is None:
        _producer = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_bootstrap_servers,
            acks="all",
            enable_idempotence=True,
        )
        await _producer.start()
    return _producer


async def close_producer() -> None:
    global _producer
    if _producer is not None:
        await _producer.stop()
        _producer = None


async def publish(topic: str, key: str, value: dict) -> bool:
    """Send one JSON message. Returns True on success, False on any Kafka error."""
    try:
        producer = await get_producer()
        await producer.send_and_wait(
            topic,
            key=key.encode(),
            value=json.dumps(value).encode(),
        )
        return True
    except (KafkaError, OSError) as exc:
        log.warning("kafka publish to %s failed (key=%s): %s", topic, key, exc)
        return False


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def enqueue_sync(linked_account_id, *, reason: str) -> bool:
    """Put a 'please sync this linked account' message on the requests topic."""
    return await publish(
        settings.kafka_sync_requests_topic,
        str(linked_account_id),
        {
            "linked_account_id": str(linked_account_id),
            "reason": reason,
            "requested_at": now_iso(),
        },
    )
