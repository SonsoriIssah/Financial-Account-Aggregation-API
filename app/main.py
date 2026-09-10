from fastapi import FastAPI

from app.routers import auth, accounts

app = FastAPI(title='Financial Account Aggregation API', version='0.1.0')

app.include_router(auth.router, prefix='/auth', tags=['auth'])
app.include_router(accounts.router)


@app.get('/health')
async def health():
    return {'status': 'ok'}
