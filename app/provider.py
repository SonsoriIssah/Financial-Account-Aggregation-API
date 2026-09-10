import httpx
from datetime import datetime
from app.models import Transaction
from app.schemas import ProviderTransaction
MOCK_PROVIDER_BASE_URL = "http://127.0.0.1:9000"

async def fetch_transactions(bank_slug: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{MOCK_PROVIDER_BASE_URL}/{bank_slug}/transactions")
        response.raise_for_status()
        return response.json()

def normalize_transaction(raw: dict, account_id) -> Transaction:
    validated = ProviderTransaction(**raw)
    return Transaction(
        account_id=account_id,
        provider_transaction_id=validated.provider_transaction_id,
        amount=validated.amount,
        currency="GHS",
        description=validated.description,
        posted_at=datetime.fromisoformat(validated.posted_at),
    )