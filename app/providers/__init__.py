from app.config import settings
from app.providers.base import ExchangedItem, LinkToken, Provider
from app.providers.mock import MockProvider
from app.providers.plaid import PlaidProvider

__all__ = ["ExchangedItem", "LinkToken", "Provider", "get_provider"]


def get_provider() -> Provider:
    if settings.provider == "plaid":
        return PlaidProvider()
    return MockProvider()
