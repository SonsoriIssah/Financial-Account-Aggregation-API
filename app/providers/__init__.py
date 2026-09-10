from app.config import settings
from app.providers.base import ExchangedItem, LinkToken, Provider
from app.providers.mock import MockProvider
from app.providers.plaid import PlaidProvider

__all__ = ["ExchangedItem", "LinkToken", "Provider", "get_provider"]


def get_provider(name: str | None = None) -> Provider:
    """Resolve a provider by name; defaults to ``settings.provider`` (used at
    link-start when there is no linked account yet)."""
    if (name or settings.provider) == "plaid":
        return PlaidProvider()
    return MockProvider()
