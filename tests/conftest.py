"""Test fixtures.

Needs a running Postgres (a dedicated ``finaggapi_test`` database is created if
missing) and the Redis from docker-compose. Schema is built once per session
with a *sync* engine (no event loop); every test then gets its own async
engine + Redis client on its own loop, with all tables truncated and Redis
flushed beforehand.
"""

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.main
import app.redis_client as redis_client
from app.config import settings
from app.database import Base, get_db

_TEST_DB = "finaggapi_test"
ASYNC_URL = settings.database_url.rsplit("/", 1)[0] + f"/{_TEST_DB}"
SYNC_URL = ASYNC_URL.replace("+asyncpg", "+psycopg2")
_TABLES = "users, linked_accounts, accounts, transactions, sync_jobs"


@pytest.fixture(scope="session", autouse=True)
def _schema():
    admin = create_engine(
        SYNC_URL.rsplit("/", 1)[0] + "/postgres", isolation_level="AUTOCOMMIT"
    )
    with admin.connect() as conn:
        exists = conn.execute(
            text("select 1 from pg_database where datname = :n"), {"n": _TEST_DB}
        ).scalar()
        if not exists:
            conn.execute(text(f'create database "{_TEST_DB}"'))
    admin.dispose()

    eng = create_engine(SYNC_URL)
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    eng.dispose()
    yield


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(ASYNC_URL, poolclass=NullPool)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def sessionmaker_(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest_asyncio.fixture(autouse=True)
async def _clean(engine, monkeypatch):
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))
    monkeypatch.setattr(redis_client, "_client", None)  # rebind to this test's loop
    await redis_client.get_redis().flushdb()
    yield
    await redis_client.close_redis()


@pytest_asyncio.fixture
async def db(sessionmaker_):
    async with sessionmaker_() as session:
        yield session


@pytest_asyncio.fixture
async def client(sessionmaker_):
    async def _get_db():
        async with sessionmaker_() as session:
            yield session

    app.main.app.dependency_overrides[get_db] = _get_db
    transport = ASGITransport(app=app.main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        yield c
    app.main.app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def auth_client(client):
    """httpx client carrying a registered + logged-in user's bearer token."""
    creds = {"email": "tester@example.com", "password": "pw-123456"}
    await client.post("/auth/register", json=creds)
    token = (await client.post("/auth/login", json=creds)).json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client
