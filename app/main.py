from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.kafka_client import close_producer
from app.logging_config import configure_logging
from app.redis_client import close_redis
from app.routers import auth, accounts
from app.schemas import ConfigOut, DemoBank

configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # the API only produces to Kafka (queuing sync requests); tidy up on exit
    await close_producer()
    await close_redis()


app = FastAPI(title='Financial Account Aggregation API', version='0.1.0', lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(auth.router, prefix='/auth', tags=['auth'])
app.include_router(accounts.router)


@app.get('/health')
async def health():
    return {'status': 'ok'}


@app.get('/config', response_model=ConfigOut)
async def config():
    """Public — tells the frontend which link options to offer."""
    return ConfigOut(
        default_provider=settings.provider,
        plaid_enabled=bool(settings.plaid_client_id and settings.plaid_secret),
    )


@app.get('/providers/demo-banks', response_model=list[DemoBank])
async def demo_banks():
    """Public — the fake banks the mock service currently offers.

    30s timeout, not 5s: on a free-tier host the mock service can be asleep
    and take ~20s to cold-start on the first request after it idles out.
    """
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{settings.mock_provider_base_url}/banks")
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError:
        return []
