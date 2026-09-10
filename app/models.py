from datetime import datetime
from decimal import Decimal
import uuid, enum

from sqlalchemy import ForeignKey, Enum, UniqueConstraint, Numeric, DateTime, func
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy.dialects.postgresql import UUID

from .database import Base


def _enum(enum_cls):
    # Store the Enum *value* ("active") in the DB, not the member name ("ACTIVE").
    return Enum(enum_cls, values_callable=lambda e: [m.value for m in e])


class User(Base):
    __tablename__ = 'users'
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LinkedAccountStatus(enum.Enum):
    ACTIVE = "active"
    NEEDS_REAUTH = "needs_reauth"
    ERROR = "error"
    DISABLED = "disabled"


class LinkedAccount(Base):
    __tablename__ = 'linked_accounts'
    __table_args__ = (
        UniqueConstraint(
            'user_id', 'provider_item_id',
            name='uq_linked_accounts_user_id_provider_item_id',
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True
    )
    provider_item_id: Mapped[str] = mapped_column(nullable=False)
    institution_name: Mapped[str] = mapped_column(nullable=False)
    # Provider access token, stored encrypted at rest (Fernet). Never log this value.
    access_token: Mapped[str] = mapped_column(nullable=False)
    status: Mapped[LinkedAccountStatus] = mapped_column(
        _enum(LinkedAccountStatus), nullable=False, default=LinkedAccountStatus.ACTIVE
    )
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AccountType(enum.Enum):
    CHECKING = "checking"
    SAVINGS = "savings"
    CREDIT = "credit"


class Account(Base):
    __tablename__ = 'accounts'
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    linked_account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('linked_accounts.id', ondelete='CASCADE'), nullable=False, index=True
    )
    provider_account_id: Mapped[str] = mapped_column(nullable=False)
    account_type: Mapped[AccountType] = mapped_column(_enum(AccountType), nullable=False)
    account_name: Mapped[str] = mapped_column(nullable=False)
    current_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    available_balance: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str] = mapped_column(nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Transaction(Base):
    __tablename__ = 'transactions'
    __table_args__ = (
        UniqueConstraint(
            'account_id', 'provider_transaction_id',
            name='uq_transactions_account_id_provider_transaction_id',
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('accounts.id', ondelete='CASCADE'), nullable=False, index=True
    )
    provider_transaction_id: Mapped[str] = mapped_column(nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(nullable=False)
    description: Mapped[str] = mapped_column(nullable=False)
    category: Mapped[str | None] = mapped_column(nullable=True)
    # Time the bank posted the transaction — set from the provider payload, not defaulted.
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SyncJobStatus(enum.Enum):
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    SUCCESS = "success"
    FAILED = "failed"


class SyncJob(Base):
    __tablename__ = 'sync_jobs'
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    linked_account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('linked_accounts.id', ondelete='CASCADE'), nullable=False, index=True
    )
    status: Mapped[SyncJobStatus] = mapped_column(_enum(SyncJobStatus), nullable=False)
    error_message: Mapped[str | None] = mapped_column(nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

