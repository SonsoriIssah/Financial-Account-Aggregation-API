from fastapi import Depends,HTTPException
from app.models import User
from app.schemas import UserRegister, UserLogin,RefreshRequest
from app.auth import hash_password, verify_password,create_access_token,create_refresh_token,decode_and_verify_type
from app.database import get_db
from sqlalchemy import select
from fastapi.security import OAuth2PasswordBearer
from jose import  JWTError
oauth2_scheme = OAuth2PasswordBearer(tokenUrl='login')
from app.main import app

@app.post('/auth/register')
async def register(user: UserRegister, db=Depends(get_db)):
    password = hash_password(user.password)
    db_user = User(email=user.email, hashed_password=password)
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return {
        'id': db_user.id,
        'email': db_user.email,
    }

@app.post('/auth/login')
async def login(user: UserLogin, db=Depends(get_db)):
    query = await db.execute(select(User).where(User.email==user.email))
    db_user = query.scalars().first()
    if not db_user:
        raise HTTPException(status_code=401,detail='Invalid email or password')
    password = verify_password(user.password,db_user.hashed_password)
    if not password:
        raise HTTPException(status_code=401,detail='Invalid email or password')
    return {
        'access_token': create_access_token({'sub': user.email}),
        'refresh_token': create_refresh_token({'sub': user.email}),
    }
async def get_current_user(token: str = Depends(oauth2_scheme), db=Depends(get_db)):
    try:
        payload = decode_and_verify_type(token,'access')
        email = payload.get('sub')
        token_type = payload.get('type')
    except JWTError:
        raise HTTPException(status_code=401, detail='Could not validate credentials')
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=401, detail='Could not validate credentials')
    return user

@app.post('/refresh')
async def refresh(token: RefreshRequest, db=Depends(get_db)):
    try:
        payload = decode_and_verify_type(token.refresh_token,'refresh')
        email = payload.get('sub')
    except JWTError:
        raise HTTPException(status_code=401, detail='Could not validate credentials')
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=401, detail='Could not validate credentials')
    return create_access_token({'sub': user.email})

