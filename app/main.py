from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI

from app.routers import auth, accounts


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(accounts.sync_loop())
    yield
    task.cancel()


app = FastAPI(title='Financial Account Aggregation API', version='0.1.0', lifespan=lifespan)

app.include_router(auth.router, prefix='/auth', tags=['auth'])
app.include_router(accounts.router)


@app.get('/health')
async def health():
    return {'status': 'ok'}