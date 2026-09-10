"""Structured logging.

``configure_logging()`` is called once at the start of each entry point (API,
worker, scheduler). With ``LOG_JSON`` (the default) every line is a JSON object
with a timestamp, level, logger, message, and any ``extra=`` fields passed to
the logging call — so ``log.info("sync done", extra={"linked_account_id": ...,
"duration_ms": ...})`` is machine-parseable.
"""

import json
import logging
import sys
from datetime import datetime, timezone

from app.config import settings

_RESERVED = set(
    logging.LogRecord("", 0, "", 0, "", (), None).__dict__
) | {"message", "asctime", "taskName"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    if settings.log_json:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
        )
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(settings.log_level.upper())
    # third-party libraries are chatty at INFO
    for noisy in ("aiokafka", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel("WARNING")
