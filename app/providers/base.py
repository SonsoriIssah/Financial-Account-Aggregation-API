"""Provider interface shared by the mock and Plaid implementations."""

from dataclasses import dataclass
from typing import Protocol

from app.models import LinkedAccount, User
from app.schemas import LinkCallbackRequest, ProviderAccount, ProviderTransaction


@dataclass
class LinkToken:
    link_token: str
    expires_in: int


@dataclass
class ExchangedItem:
    provider_item_id: str
    access_token: str  # plaintext; the caller encrypts before storing
    institution_name: str


class Provider(Protocol):
    name: str

    async def create_link_token(self, user: User) -> LinkToken:
        """Step 1 of linking: a token the client uses to open the bank widget."""

    async def exchange(self, req: LinkCallbackRequest, user: User) -> ExchangedItem:
        """Step 2: turn the client's callback into a stored access token + item id."""

    async def fetch_accounts(self, linked: LinkedAccount) -> list[ProviderAccount]:
        ...

    async def fetch_transactions(self, linked: LinkedAccount) -> list[ProviderTransaction]:
        ...
