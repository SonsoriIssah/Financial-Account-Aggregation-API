from pydantic import BaseModel, EmailStr

class UserRegister(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str


class ProviderTransaction(BaseModel):
    amount: float
    description: str
    posted_at: str
    provider_transaction_id: str


class LinkAccountRequest(BaseModel):
    bank_slug: str
    institution_name: str