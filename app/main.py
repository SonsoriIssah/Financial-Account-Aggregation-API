from fastapi import FastAPI

app = FastAPI(title='Financial Account Aggregation API', version='0.1.0')

from app.routers import auth
app.include_router(auth.router, prefix='/auth', tags=['auth'])


@app.get('/health')
async def health():
    return {'status': 'ok'}
