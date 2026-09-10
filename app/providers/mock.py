"""Mock provider — talks to the local fake bank service on :9000.

The retry/backoff and outbound token bucket live in ``app.provider``; this
class just adapts that HTTP layer to the Provider interface.
"""

from uuid import uuid4

from fastapi import HTTPException

from app import provider as mock_http
from app.models import LinkedAccount, User
from app.providers.base import ExchangedItem, LinkToken
from app.schemas import LinkCallbackRequest, ProviderAccount, ProviderTransaction

_LINK_TOKEN_TTL = 900


class MockProvider:
    name = "mock"

    async def create_link_token(self, user: User) -> LinkToken:
        # the mock has no real handshake; this only mirrors the two-step shape
        return LinkToken(link_token=str(uuid4()), expires_in=_LINK_TOKEN_TTL)

    async def exchange(self, req: LinkCallbackRequest, user: User) -> ExchangedItem:
        if not req.bank_slug:
            raise HTTPException(422, "bank_slug is required for the mock provider")
        return ExchangedItem(
            provider_item_id=f"mock-{req.bank_slug}",
            access_token="mock-token-not-real",
            institution_name=req.institution_name or req.bank_slug,
        )

    async def fetch_accounts(self, linked: LinkedAccount) -> list[ProviderAccount]:
        return await mock_http.fetch_accounts(self._slug(linked))

    async def fetch_transactions(self, linked: LinkedAccount) -> list[ProviderTransaction]:
        return await mock_http.fetch_transactions(self._slug(linked))

    @staticmethod
    def _slug(linked: LinkedAccount) -> str:
        return linked.provider_item_id.removeprefix("mock-")
