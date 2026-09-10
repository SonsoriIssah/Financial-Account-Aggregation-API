import secrets

from fastapi import Depends,HTTPException,APIRouter
from app.models import User
from app.schemas import UserRegister, UserLogin,RefreshRequest, UserOut
from app.auth import hash_password, verify_password,create_access_token,create_refresh_token,decode_and_verify_type
from app.database import get_db
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from fastapi.security import OAuth2PasswordBearer
from jose import  JWTError

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl='auth/login')

# Verified against when an email isn't found, so login timing doesn't reveal
# whether an account exists.
_DUMMY_PASSWORD_HASH = hash_password('not-a-real-account')

@router.post('/register')
async def register(user: UserRegister, db=Depends(get_db)):
    password = hash_password(user.password)
    db_user = User(email=user.email, hashed_password=password)
    db.add(db_user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail='Email already registered')
    await db.refresh(db_user)
    return {
        'id': db_user.id,
        'email': db_user.email,
    }

@router.post('/login')
async def login(user: UserLogin, db=Depends(get_db)):
    query = await db.execute(select(User).where(User.email==user.email))
    db_user = query.scalars().first()
    if not db_user:
        verify_password(user.password, _DUMMY_PASSWORD_HASH)
        raise HTTPException(status_code=401,detail='Invalid email or password')
    if not verify_password(user.password,db_user.hashed_password):
        raise HTTPException(status_code=401,detail='Invalid email or password')
    return {
        'access_token': create_access_token({'sub': db_user.email}),
        'refresh_token': create_refresh_token({'sub': db_user.email}),
    }
async def get_current_user(token: str = Depends(oauth2_scheme), db=Depends(get_db)):
    try:
        payload = decode_and_verify_type(token,'access')
        email = payload.get('sub')
    except JWTError:
        raise HTTPException(status_code=401, detail='Could not validate credentials')
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=401, detail='Could not validate credentials')
    return user

@router.get('/me', response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


@router.post('/test-account')
async def test_account(db=Depends(get_db)):
    """One-click throwaway account — creates a fresh user and returns tokens.

    For recruiters / demos: no email or password to type. The account starts
    empty; link a demo bank from the dashboard.
    """
    email = f'guest-{secrets.token_hex(6)}@example.com'
    password = secrets.token_urlsafe(24)
    user = User(email=email, hashed_password=hash_password(password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {
        'access_token': create_access_token({'sub': email}),
        'refresh_token': create_refresh_token({'sub': email}),
        'email': email,
    }


@router.post('/refresh')
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
    return {'access_token': create_access_token({'sub': user.email})}

