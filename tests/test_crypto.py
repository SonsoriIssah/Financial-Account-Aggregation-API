import uuid

from app.crypto import decrypt, encrypt
from app.models import LinkedAccount


def test_encrypt_roundtrip():
    secret = "access-sandbox-abc123"
    token = encrypt(secret)
    assert token != secret
    assert decrypt(token) == secret


async def test_link_stores_an_encrypted_token(auth_client, db, monkeypatch):
    from app import provider as provider_mod
    from tests.test_resilience import make_request

    monkeypatch.setattr(provider_mod, "_request", make_request()[0])
    lt = (await auth_client.post("/accounts/link", json={})).json()["link_token"]
    body = (
        await auth_client.post(
            "/accounts/link/callback",
            json={"link_token": lt, "bank_slug": "bank-x", "institution_name": "Bank X"},
        )
    ).json()

    linked = await db.get(LinkedAccount, uuid.UUID(body["linked_account_id"]))
    assert linked.access_token != "mock-token-not-real"  # stored ciphertext
    assert decrypt(linked.access_token) == "mock-token-not-real"
