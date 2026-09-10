from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models import AccountType, LinkedAccountStatus, SyncJobStatus

if TYPE_CHECKING:
    from app.models import SyncJob


# --- auth ---------------------------------------------------------------------

class UserRegister(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr


# --- shapes returned by the aggregator provider (mock) ----------------------

class ProviderAccount(BaseModel):
    account_id: str
    balance: Decimal
    currency: str


class ProviderTransaction(BaseModel):
    provider_transaction_id: str
    amount: Decimal
    description: str
    posted_at: str  # provider sends a date-only string; normalized on ingest


# --- linking ---------------------------------------------------------------

class LinkStartRequest(BaseModel):
    institution_name: str | None = None


class LinkStartResponse(BaseModel):
    link_token: str
    expires_in: int


class LinkCallbackRequest(BaseModel):
    institution_name: str | None = None
    # mock provider
    link_token: str | None = None
    bank_slug: str | None = None
    # plaid provider
    public_token: str | None = None


class ConfigOut(BaseModel):
    provider: str


# --- client-facing responses ---------------------------------------------------

class AccountOut(BaseModel):
    id: UUID
    linked_account_id: UUID
    provider_account_id: str
    account_type: AccountType
    account_name: str
    current_balance: Decimal
    available_balance: Decimal | None
    currency: str
    updated_at: datetime
    # denormalized from the parent linked account for the client
    institution_name: str
    status: LinkedAccountStatus
    last_synced_at: datetime | None

    @classmethod
    def from_row(cls, account, linked) -> "AccountOut":
        return cls(
            id=account.id,
            linked_account_id=account.linked_account_id,
            provider_account_id=account.provider_account_id,
            account_type=account.account_type,
            account_name=account.account_name,
            current_balance=account.current_balance,
            available_balance=account.available_balance,
            currency=account.currency,
            updated_at=account.updated_at,
            institution_name=linked.institution_name,
            status=linked.status,
            last_synced_at=linked.last_synced_at,
        )


class BalanceOut(BaseModel):
    account_id: UUID
    current_balance: Decimal
    available_balance: Decimal | None
    currency: str
    updated_at: datetime


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    account_id: UUID
    provider_transaction_id: str
    amount: Decimal
    currency: str
    description: str
    category: str | None
    posted_at: datetime
    created_at: datetime


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int
    limit: int
    offset: int


class SyncResultOut(BaseModel):
    sync_job_id: UUID
    linked_account_id: UUID
    status: SyncJobStatus
    transactions_synced: int = 0
    error_message: str | None = None

    @classmethod
    def from_job(cls, job: "SyncJob", transactions_synced: int = 0) -> "SyncResultOut":
        return cls(
            sync_job_id=job.id,
            linked_account_id=job.linked_account_id,
            status=job.status,
            transactions_synced=transactions_synced,
            error_message=job.error_message,
        )


class LinkCallbackResponse(BaseModel):
    linked_account_id: UUID
    institution_name: str
    status: LinkedAccountStatus
    accounts: list[AccountOut]
    sync: SyncResultOut


class SyncQueuedOut(BaseModel):
    linked_account_id: UUID
    status: str = "queued"
    # False when Kafka was unreachable; the scheduler will still pick it up
    queued: bool = True


class SyncJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: SyncJobStatus
    error_message: str | None
    started_at: datetime
    finished_at: datetime | None


class SyncStatusOut(BaseModel):
    linked_account_id: UUID
    account_status: LinkedAccountStatus
    last_synced_at: datetime | None
    latest_job: SyncJobOut | None
