"""Plaid provider (sandbox or production).

Talks to Plaid's REST API directly with httpx so it stays async. Plaid's amount
sign is inverted relative to ours (Plaid: positive = money leaving the
account), so transaction amounts are negated on the way in.
"""

import httpx
from fastapi import HTTPException

from app.config import settings
from app.crypto import decrypt
from app.models import LinkedAccount, User
from app.provider import ProviderError
from app.providers.base import ExchangedItem, LinkToken
from app.schemas import LinkCallbackRequest, ProviderAccount, ProviderTransaction

# error codes that mean "the user must re-link" rather than "retry later"
_AUTH_ERROR_CODES = {
    "ITEM_LOGIN_REQUIRED",
    "INVALID_ACCESS_TOKEN",
    "INVALID_CREDENTIALS",
    "ACCESS_NOT_GRANTED",
}


async def _plaid(path: str, payload: dict) -> dict:
    body = {
        "client_id": settings.plaid_client_id,
        "secret": settings.plaid_secret,
        **payload,
    }
    try:
        async with httpx.AsyncClient(timeout=settings.provider_timeout_seconds) as client:
            resp = await client.post(f"{settings.plaid_host}{path}", json=body)
    except httpx.HTTPError as exc:
        raise ProviderError(f"plaid request to {path} failed: {exc}") from exc

    if resp.status_code >= 400:
        try:
            err = resp.json()
            code = err.get("error_code", "")
            message = err.get("error_message", "")
        except ValueError:
            code, message = "", resp.text[:200]
        status = 401 if code in _AUTH_ERROR_CODES else resp.status_code
        raise ProviderError(f"plaid {path}: {code or resp.status_code} {message}", status_code=status)
    return resp.json()


class PlaidProvider:
    name = "plaid"

    async def create_link_token(self, user: User) -> LinkToken:
        if not settings.plaid_client_id or not settings.plaid_secret:
            raise HTTPException(500, "PLAID_CLIENT_ID / PLAID_SECRET are not configured")
        data = await _plaid(
            "/link/token/create",
            {
                "user": {"client_user_id": str(user.id)},
                "client_name": "KudiVault",
                "language": "en",
                "products": [p.strip() for p in settings.plaid_products.split(",") if p.strip()],
                "country_codes": [
                    c.strip() for c in settings.plaid_country_codes.split(",") if c.strip()
                ],
            },
        )
        return LinkToken(link_token=data["link_token"], expires_in=1800)

    async def exchange(self, req: LinkCallbackRequest, user: User) -> ExchangedItem:
        if not req.public_token:
            raise HTTPException(422, "public_token is required for the Plaid provider")
        exchanged = await _plaid(
            "/item/public_token/exchange", {"public_token": req.public_token}
        )
        access_token = exchanged["access_token"]
        item_id = exchanged["item_id"]

        institution_name = req.institution_name
        if not institution_name:
            item = await _plaid("/item/get", {"access_token": access_token})
            inst_id = item.get("item", {}).get("institution_id")
            if inst_id:
                inst = await _plaid(
                    "/institutions/get_by_id",
                    {
                        "institution_id": inst_id,
                        "country_codes": [
                            c.strip()
                            for c in settings.plaid_country_codes.split(",")
                            if c.strip()
                        ],
                    },
                )
                institution_name = inst.get("institution", {}).get("name")

        return ExchangedItem(
            provider_item_id=item_id,
            access_token=access_token,
            institution_name=institution_name or "Linked bank",
        )

    async def fetch_accounts(self, linked: LinkedAccount) -> list[ProviderAccount]:
        token = decrypt(linked.access_token)
        data = await _plaid("/accounts/balance/get", {"access_token": token})
        accounts: list[ProviderAccount] = []
        for a in data.get("accounts", []):
            bal = a.get("balances", {})
            accounts.append(
                ProviderAccount(
                    account_id=a["account_id"],
                    balance=bal.get("current") if bal.get("current") is not None else 0,
                    currency=bal.get("iso_currency_code") or "USD",
                )
            )
        return accounts

    async def fetch_transactions(self, linked: LinkedAccount) -> list[ProviderTransaction]:
        token = decrypt(linked.access_token)
        cursor: str | None = None
        added: list[dict] = []
        for _ in range(20):  # safety bound on pagination
            payload = {"access_token": token}
            if cursor:
                payload["cursor"] = cursor
            try:
                data = await _plaid("/transactions/sync", payload)
            except ProviderError as exc:
                # sandbox often needs a beat before transactions are ready
                if "PRODUCT_NOT_READY" in str(exc):
                    return []
                raise
            added.extend(data.get("added", []))
            cursor = data.get("next_cursor")
            if not data.get("has_more"):
                break

        out: list[ProviderTransaction] = []
        for t in added:
            out.append(
                ProviderTransaction(
                    provider_transaction_id=t["transaction_id"],
                    # Plaid: positive = money out. Flip to our "inflow is positive".
                    amount=-1 * (t.get("amount") or 0),
                    description=t.get("name") or t.get("merchant_name") or "Transaction",
                    posted_at=t.get("authorized_date") or t["date"],
                )
            )
        return out
