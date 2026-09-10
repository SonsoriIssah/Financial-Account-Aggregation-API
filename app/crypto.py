"""Symmetric encryption for provider access tokens at rest (design doc §9)."""

import logging

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

log = logging.getLogger(__name__)

_DEV_KEY = "ZmFhLWRldi1vbmx5LWZlcm5ldC1rZXktMDAwMDAwMDE="

try:
    _fernet = Fernet(settings.encryption_key.encode())
except Exception as exc:  # noqa: BLE001 - surface a clear message at startup
    raise RuntimeError(
        "ENCRYPTION_KEY is not a valid Fernet key. Generate one with: "
        'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
    ) from exc

if settings.encryption_key == _DEV_KEY:
    log.warning("using the built-in dev ENCRYPTION_KEY — set a real one for anything real")


def encrypt(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    try:
        return _fernet.decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError(
            "could not decrypt an access token — the ENCRYPTION_KEY has changed "
            "since it was stored"
        ) from exc
