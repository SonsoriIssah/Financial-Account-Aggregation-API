# This file handles passwords and login tokens (JWT).
# Other files use these functions to check who a user is.

import bcrypt
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone

from app.config import settings

# bcrypt hashes only the first 72 bytes of a password and raises on longer
# input, so truncate to that limit explicitly.
BCRYPT_MAX_BYTES = 72


# Turn a plain password into a hashed password, so we never store the real password.
def hash_password(password:str)->str:
    return bcrypt.hashpw(password.encode('utf-8')[:BCRYPT_MAX_BYTES], bcrypt.gensalt()).decode('utf-8')

# Check if a plain password matches a hashed password.
def verify_password(plain_password:str, hashed_password:str)->bool:
    return bcrypt.checkpw(plain_password.encode('utf-8')[:BCRYPT_MAX_BYTES], hashed_password.encode('utf-8'))

# Create a short-lived access token for a logged-in user.
def create_access_token(data:dict)->str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({'exp':expire,"type": "access"})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.algorithm)

# Create a long-lived refresh token, used to get a new access token later.
def create_refresh_token(data:dict)->str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    to_encode.update({'exp':expire,"type": "refresh"})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.algorithm)

# Read a token and return its contents. Raises an error if the token is invalid or expired.
def decode_token(token:str)->dict:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.algorithm])

def decode_and_verify_type(token: str, expected_type: str) -> dict:
    payload = decode_token(token)
    if payload.get('type') != expected_type:
        raise JWTError(f"Expected {expected_type} token")
    return payload
