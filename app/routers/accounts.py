from fastapi import APIRouter, Depends
from app.provider import fetch_transactions, normalize_transaction
from app.database import get_db
from app.schemas import LinkAccountRequest
from app.routers.auth import get_current_user
from app.models import LinkedAccount, Account, LinkedAccountStatus, AccountType, User
import asyncio
from app.database import AsyncSessionLocal
from app.models import LinkedAccount, LinkedAccountStatus
from sqlalchemy import select
router = APIRouter()

@router.post('/dev/sync/{bank_slug}/{account_id}')
async def dev_sync(bank_slug: str, account_id: str, db=Depends(get_db)):
    raw_transactions = await fetch_transactions(bank_slug)
    saved = []
    for raw in raw_transactions:
        txn = normalize_transaction(raw, account_id)
        db.add(txn)
        saved.append(txn)
    await db.commit()
    return {"synced_count": len(saved)}

@router.post('/accounts/link')
async def link_account(
    body: LinkAccountRequest,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    linked_account = LinkedAccount(
        user_id=current_user.id,
        provider_item_id=f"mock-{body.bank_slug}",
        institution_name=body.institution_name,
        access_token="mock-token-not-real",
        status=LinkedAccountStatus.ACTIVE,
    )
    db.add(linked_account)
    await db.commit()
    await db.refresh(linked_account)

    account = Account(
        linked_account_id=linked_account.id,
        provider_account_id=f"acc-{body.bank_slug}-1",
        account_type=AccountType.CHECKING,
        account_name=f"{body.institution_name} Checking",
        current_balance=0,
        currency="GHS",
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)

    return {
        "linked_account_id": linked_account.id,
        "account_id": account.id,
        "status": linked_account.status,
    }


SYNC_INTERVAL_SECONDS = 10 #60 * 5  # 5 minutes, short for testing; longer in real use

async def sync_all_active_accounts():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(LinkedAccount).where(LinkedAccount.status == LinkedAccountStatus.ACTIVE)
        )
        linked_accounts = result.scalars().all()

        for linked_account in linked_accounts:
            accounts_result = await db.execute(
                select(Account).where(Account.linked_account_id == linked_account.id)
            )
            for account in accounts_result.scalars().all():
                bank_slug = linked_account.provider_item_id.replace("mock-", "")
                try:
                    raw_transactions = await fetch_transactions(bank_slug)
                    for raw in raw_transactions:
                        txn = normalize_transaction(raw, account.id)
                        db.add(txn)
                    await db.commit()
                except Exception as e:
                    print(f"Sync failed for linked_account {linked_account.id}: {e}")

async def sync_loop():
    while True:
        await sync_all_active_accounts()
        await asyncio.sleep(SYNC_INTERVAL_SECONDS)
