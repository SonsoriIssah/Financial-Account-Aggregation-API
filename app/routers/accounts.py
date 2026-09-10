from datetime import date, datetime, time, timedelta, timezone
from math import ceil
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.crypto import encrypt
from app.database import get_db
from app import kafka_client
from app.models import (
    Account,
    AccountType,
    LinkedAccount,
    LinkedAccountStatus,
    SyncJob,
    Transaction,
    User,
)
from app.provider import ProviderError
from app.providers import get_provider
from app.ratelimit import RateLimited, enforce_user_limit
from app.redis_client import get_redis
from app.routers.auth import get_current_user
from app.schemas import (
    AccountOut,
    BalanceOut,
    LinkCallbackRequest,
    LinkCallbackResponse,
    LinkStartRequest,
    LinkStartResponse,
    SyncActivityItem,
    SyncJobOut,
    SyncQueuedOut,
    SyncResultOut,
    SyncStatusOut,
    TransactionOut,
    TransactionPage,
)
from app.sync import sync_linked_account


def _too_many_requests(retry_after: float | None) -> HTTPException:
    seconds = ceil(retry_after) if retry_after else 60
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        detail="rate limit reached, retry later",
        headers={"Retry-After": str(seconds)},
    )

router = APIRouter(prefix="/accounts", tags=["accounts"])


async def _get_owned_account(
    account_id: UUID, current_user: User, db: AsyncSession
) -> Account:
    result = await db.execute(
        select(Account)
        .join(LinkedAccount, Account.linked_account_id == LinkedAccount.id)
        .where(Account.id == account_id, LinkedAccount.user_id == current_user.id)
    )
    account = result.scalars().first()
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Account not found")
    return account


@router.post("/link", response_model=LinkStartResponse)
async def start_link(
    body: LinkStartRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        token = await get_provider().create_link_token(current_user)
    except ProviderError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return LinkStartResponse(link_token=token.link_token, expires_in=token.expires_in)


@router.post("/link/callback", response_model=LinkCallbackResponse)
async def complete_link(
    body: LinkCallbackRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    provider = get_provider()

    # step 2 of the handshake: turn the client's callback into a stored token
    try:
        item = await provider.exchange(body, current_user)
    except RateLimited as exc:
        raise _too_many_requests(exc.retry_after)
    except ProviderError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    linked = (
        await db.execute(
            select(LinkedAccount).where(
                LinkedAccount.user_id == current_user.id,
                LinkedAccount.provider_item_id == item.provider_item_id,
            )
        )
    ).scalars().first()

    if linked is None:
        linked = LinkedAccount(
            user_id=current_user.id,
            provider_item_id=item.provider_item_id,
            institution_name=item.institution_name,
            access_token=encrypt(item.access_token),
            status=LinkedAccountStatus.ACTIVE,
        )
        db.add(linked)
        await db.flush()
    else:
        # re-linking an existing connection (e.g. after needs_reauth)
        linked.institution_name = item.institution_name
        linked.access_token = encrypt(item.access_token)
        linked.status = LinkedAccountStatus.ACTIVE

    try:
        provider_accounts = await provider.fetch_accounts(linked)
    except RateLimited as exc:
        await db.rollback()
        raise _too_many_requests(exc.retry_after)
    except ProviderError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    if not provider_accounts:
        await db.rollback()
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="provider returned no accounts for this connection",
        )

    existing_provider_ids = {
        a.provider_account_id
        for a in (
            await db.execute(
                select(Account).where(Account.linked_account_id == linked.id)
            )
        ).scalars()
    }
    for pa in provider_accounts:
        if pa.account_id in existing_provider_ids:
            continue
        db.add(
            Account(
                linked_account_id=linked.id,
                provider_account_id=pa.account_id,
                account_type=AccountType.CHECKING,
                account_name=f"{item.institution_name} ({pa.account_id})",
                current_balance=pa.balance,
                currency=pa.currency,
            )
        )
    await db.commit()
    await db.refresh(linked)

    job = await sync_linked_account(db, linked)
    await db.refresh(linked)  # sync may have changed status / rolled back

    accounts = (
        await db.execute(select(Account).where(Account.linked_account_id == linked.id))
    ).scalars().all()

    return LinkCallbackResponse(
        linked_account_id=linked.id,
        institution_name=linked.institution_name,
        status=linked.status,
        accounts=[AccountOut.from_row(a, linked) for a in accounts],
        sync=SyncResultOut.from_job(job, getattr(job, "transactions_synced", 0)),
    )


@router.get("", response_model=list[AccountOut])
async def list_accounts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Account, LinkedAccount)
        .join(LinkedAccount, Account.linked_account_id == LinkedAccount.id)
        .where(LinkedAccount.user_id == current_user.id)
        .order_by(LinkedAccount.institution_name, Account.account_name)
    )
    return [AccountOut.from_row(account, linked) for account, linked in result.all()]


@router.get("/sync-activity", response_model=list[SyncActivityItem])
async def sync_activity(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
):
    result = await db.execute(
        select(SyncJob, LinkedAccount.institution_name)
        .join(LinkedAccount, SyncJob.linked_account_id == LinkedAccount.id)
        .where(LinkedAccount.user_id == current_user.id)
        .order_by(SyncJob.started_at.desc())
        .limit(limit)
    )
    return [
        SyncActivityItem(
            id=job.id,
            linked_account_id=job.linked_account_id,
            institution_name=name,
            status=job.status,
            error_message=job.error_message,
            started_at=job.started_at,
            finished_at=job.finished_at,
        )
        for job, name in result.all()
    ]


@router.get("/{account_id}/balance", response_model=BalanceOut)
async def get_balance(
    account_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_owned_account(account_id, current_user, db)
    return BalanceOut(
        account_id=account.id,
        current_balance=account.current_balance,
        available_balance=account.available_balance,
        currency=account.currency,
        updated_at=account.updated_at,
    )


@router.get("/{account_id}/transactions", response_model=TransactionPage)
async def list_transactions(
    account_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    start_date: date | None = None,
    end_date: date | None = None,
):
    await _get_owned_account(account_id, current_user, db)

    filters = [Transaction.account_id == account_id]
    if start_date is not None:
        filters.append(
            Transaction.posted_at >= datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        )
    if end_date is not None:
        filters.append(
            Transaction.posted_at
            < datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
        )

    total = await db.scalar(
        select(func.count()).select_from(Transaction).where(*filters)
    )
    rows = (
        await db.execute(
            select(Transaction)
            .where(*filters)
            .order_by(Transaction.posted_at.desc(), Transaction.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars()

    return TransactionPage(
        items=[TransactionOut.model_validate(t) for t in rows],
        total=total or 0,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/{account_id}/sync",
    response_model=SyncQueuedOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def sync_account(
    account_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Queue a sync. A worker picks it up off Kafka; poll GET .../sync-status
    for the outcome. Returns 202 even if Kafka is briefly down — the scheduler
    will catch the account on its next pass."""
    try:
        await enforce_user_limit(
            get_redis(), "sync", current_user.id, limit=settings.api_rate_limit_per_minute
        )
    except RateLimited as exc:
        raise _too_many_requests(exc.retry_after)

    account = await _get_owned_account(account_id, current_user, db)
    linked = await db.get(LinkedAccount, account.linked_account_id)
    if linked.status == LinkedAccountStatus.NEEDS_REAUTH:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="linked account needs re-authentication",
        )

    queued = await kafka_client.enqueue_sync(linked.id, reason="manual")
    return SyncQueuedOut(linked_account_id=linked.id, queued=queued)


@router.get("/{account_id}/sync-status", response_model=SyncStatusOut)
async def sync_status(
    account_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_owned_account(account_id, current_user, db)
    linked = await db.get(LinkedAccount, account.linked_account_id)
    latest = (
        await db.execute(
            select(SyncJob)
            .where(SyncJob.linked_account_id == linked.id)
            .order_by(SyncJob.started_at.desc())
            .limit(1)
        )
    ).scalars().first()
    return SyncStatusOut(
        linked_account_id=linked.id,
        account_status=linked.status,
        last_synced_at=linked.last_synced_at,
        latest_job=SyncJobOut.model_validate(latest) if latest else None,
    )


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_account(
    account_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_owned_account(account_id, current_user, db)
    # "Unlink" removes the whole provider connection; cascade drops its
    # accounts, transactions and sync jobs.
    linked = await db.get(LinkedAccount, account.linked_account_id)
    await db.delete(linked)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
