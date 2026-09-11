from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# Hosted Postgres (Neon, Supabase, ...) requires TLS; asyncpg needs that passed
# as a connect arg rather than a `sslmode=` query param. Local/Docker Postgres
# doesn't want TLS at all, so this is opt-in via DB_SSL_REQUIRE.
_connect_args = {"ssl": "require"} if settings.db_ssl_require else {}

engine = create_async_engine(
    settings.database_url, echo=settings.sql_echo, connect_args=_connect_args
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
