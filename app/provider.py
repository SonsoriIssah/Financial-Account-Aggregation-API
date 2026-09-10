"""Client for the aggregator provider.

During development this talks to the local mock provider (see
``settings.mock_provider_base_url``). The mock exposes, per fake bank:

    GET /{bank_slug}/accounts      -> [{account_id, balance, currency}]
    GET /{bank_slug}/transactions  -> [{provider_transaction_id, amount,
                                        description, posted_at}]

``posted_at`` is a date-only string and transactions carry no currency, so
both are fixed up in :func:`normalize_transaction`.
"""

from datetime import datetime, timezone
from uuid import UUID

import httpx

from app.config import settings
from app.schemas import ProviderAccount, ProviderTransaction


class ProviderError(RuntimeError):
    """Raised when the provider call fails (network, timeout, or HTTP error).

    ``status_code`` is set when the failure was an HTTP error response, so
    callers can tell an auth failure (401/403 -> needs re-auth) from a
    transient one (timeout, 5xx -> safe to retry).
    """

    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code

    @property
    def is_auth_error(self) -> bool:
        return self.status_code in (401, 403)


async def _get(path: str) -> list[dict]:
    url = f"{settings.mock_provider_base_url}{path}"
    try:
        async with httpx.AsyncClient(timeout=settings.provider_timeout_seconds) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        raise ProviderError(
            f"provider returned {exc.response.status_code} for {path}",
            status_code=exc.response.status_code,
        ) from exc
    except httpx.HTTPError as exc:  # timeouts, connection errors, ...
        raise ProviderError(f"provider request to {path} failed: {exc}") from exc


async def fetch_accounts(bank_slug: str) -> list[ProviderAccount]:
    return [ProviderAccount(**row) for row in await _get(f"/{bank_slug}/accounts")]


async def fetch_transactions(bank_slug: str) -> list[ProviderTransaction]:
    return [ProviderTransaction(**row) for row in await _get(f"/{bank_slug}/transactions")]


def _parse_posted_at(value: str) -> datetime:
    """Provider sends e.g. "2026-04-19" (or a full ISO timestamp). Return an
    aware UTC datetime so it lands correctly in a timestamptz column."""
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def normalize_transaction(
    raw: ProviderTransaction, *, account_id: UUID, currency: str
) -> dict:
    """Turn one provider transaction into a row dict for the transactions table.

    Returns a plain dict (not a Transaction instance) so it can be handed to a
    bulk ``INSERT ... ON CONFLICT DO NOTHING``.
    """
    return {
        "account_id": account_id,
        "provider_transaction_id": raw.provider_transaction_id,
        "amount": raw.amount,
        "currency": currency,
        "description": raw.description,
        "posted_at": _parse_posted_at(raw.posted_at),
    }
