from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy import  ForeignKey,Enum
from sqlalchemy.dialects.postgresql import UUID
import uuid, enum
from .database import Base
from datetime import datetime, timedelta
from sqlalchemy import Numeric

class User(Base):
    __tablename__ = 'users'
    id:Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),primary_key=True,default=uuid.uuid4)
    email:Mapped[str] = mapped_column(nullable=False)
    hashed_password:Mapped[str] = mapped_column(nullable=False)
    created_at:Mapped[datetime] = mapped_column(default=datetime.now)

class LinkedAccountStatus(enum.Enum):
    ACTIVE = "active"
    NEEDS_REAUTH = "needs_reauth"
    ERROR = "error"
    DISABLED = "disabled"
class Linked_account(Base):
    __tablename__ = 'linked_accounts'
    id:Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),primary_key=True,default=uuid.uuid4)
    user_id:Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), nullable=False, index=True)
    provider_item_id:Mapped[str] = mapped_column(nullable=False)
    institution_name:Mapped[str] = mapped_column(nullable=False)
    access_token:Mapped[str] = mapped_column(nullable=False)
    status:Mapped[LinkedAccountStatus] = mapped_column(Enum(LinkedAccountStatus), nullable=False)
    last_synced_at:Mapped[datetime | None] = mapped_column(nullable=True)
    created_at:Mapped[datetime] = mapped_column(default=datetime.now)

class AccountType(enum.Enum):
    CHECKING = "checking"
    SAVINGS = "savings"
    CREDIT = 'credit'
class Account(Base):
    __tablename__ = 'accounts'
    id:Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True,default=uuid.uuid4)
    linked_account_id:Mapped[uuid.UUID]= mapped_column(ForeignKey('linked_accounts.id'),nullable=False, index=True)
    provider_account_id:Mapped[str] = mapped_column(nullable=False)
    account_type:Mapped[AccountType] = mapped_column(Enum(AccountType),nullable=False)
    account_name:Mapped[str] = mapped_column(nullable=False)
    current_balance:Mapped[float] = mapped_column(Numeric(12,2),nullable=False)
    available_balance:Mapped[float] = mapped_column(Numeric(12,2),nullable=True)
    currency:Mapped[str] = mapped_column(nullable=False)
    updated_at:Mapped[datetime] = mapped_column(default=datetime.now)


class Transaction(Base):
    __tablename__ = 'transactions'
    id:Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id:Mapped[uuid.UUID]= mapped_column(ForeignKey('accounts.id'),nullable=False, index=True)
    provider_transaction_id:Mapped[str] = mapped_column(nullable=False)
    amount:Mapped[float] = mapped_column(Numeric(12,2),nullable=False)
    currency:Mapped[str] = mapped_column(nullable=False)
    description:Mapped[str] = mapped_column(nullable=False)
    category:Mapped[str] = mapped_column(nullable=True)
    posted_at:Mapped[datetime] = mapped_column(default=datetime.now)
    created_at:Mapped[datetime] = mapped_column(default=datetime.now)
class SyncJobsStatus(enum.Enum):
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    SUCCESS = 'success'
    FAILED = 'failed'

class Sync_job(Base):
    __tablename__='sync_jobs'
    id:Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    linked_account_id:Mapped[uuid.UUID]= mapped_column(ForeignKey('linked_accounts.id'),nullable=False, index=True)
    status:Mapped[SyncJobsStatus] = mapped_column(Enum(SyncJobsStatus),nullable=False)
    error_message:Mapped[str] = mapped_column(nullable=True)
    started_at:Mapped[datetime] = mapped_column(default=datetime.now)
    finished_at:Mapped[datetime] = mapped_column(default=datetime.now)


