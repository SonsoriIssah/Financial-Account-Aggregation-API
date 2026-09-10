"""A tiny fake-bank service for demos.

Stands in for a Plaid-style aggregator so the whole system (link → sync worker
→ Kafka → dashboard) can be shown without real bank credentials. Each bank keeps
an in-memory ledger that a background task grows every ``MOCKBANK_TICK_SECONDS``,
so the aggregator's scheduler keeps pulling fresh transactions and the dashboard
moves during a demo.

Endpoints match what ``app.providers.mock`` expects:

    GET /banks                     -> [{slug, name, note}]
    GET /{slug}/accounts           -> [{account_id, balance, currency}]
    GET /{slug}/transactions       -> [{provider_transaction_id, amount,
                                        description, posted_at}]  (newest first)

Run:  uvicorn mockbank.app:app --port 9000
"""

import asyncio
import os
import random
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from itertools import count

from fastapi import FastAPI, HTTPException

TICK_SECONDS = int(os.environ.get("MOCKBANK_TICK_SECONDS", "1800"))  # 30 min default
SLOW_DELAY_SECONDS = float(os.environ.get("MOCKBANK_SLOW_DELAY", "5"))
FLAKY_FAILURE_RATE = float(os.environ.get("MOCKBANK_FLAKY_RATE", "0.15"))

_ids = count(1)

DEBITS = [
    ("MTN Mobile Money", "transfer", 20, 400),
    ("Shoprite Accra Mall", "groceries", 60, 700),
    ("ECG Prepaid Electricity", "utilities", 50, 300),
    ("TotalEnergies Fuel", "transport", 100, 600),
    ("Melcom", "shopping", 40, 500),
    ("Bolt trip", "transport", 15, 90),
    ("KFC Osu", "dining", 45, 220),
    ("DSTV subscription", "utilities", 90, 420),
    ("Vodafone data bundle", "utilities", 10, 120),
    ("Chop bar lunch", "dining", 15, 60),
    ("Jumia order", "shopping", 50, 900),
    ("Uber Eats", "dining", 40, 180),
]
CREDITS = [
    ("Mobile money received", "transfer", 50, 800),
    ("Refund", "refund", 20, 300),
    ("Interest", "income", 2, 40),
]


class Account:
    def __init__(self, account_id: str, balance: float, currency: str = "GHS"):
        self.account_id = account_id
        self.currency = currency
        self.opening = round(balance, 2)
        self.txns: list[dict] = []

    @property
    def balance(self) -> float:
        return round(self.opening + sum(t["amount"] for t in self.txns), 2)


class Bank:
    def __init__(self, name: str, quirk: str | None, accounts: list[Account]):
        self.name = name
        self.quirk = quirk
        self.accounts = accounts

    @property
    def note(self) -> str:
        return {
            "slow": "Slow responses (~5s)",
            "flaky": "Fails intermittently (503)",
        }.get(self.quirk or "", "Standard demo bank")


BANKS: dict[str, Bank] = {
    "gcb": Bank("GCB Bank", None, [Account("gcb-current-8842", 8_240.50)]),
    "ecobank": Bank("Ecobank Ghana", None, [Account("eco-savings-1044", 15_380.00)]),
    "stanbic": Bank("Stanbic Bank", None, [Account("stb-current-2291", 3_110.25)]),
    "absa": Bank("Absa Ghana", None, [Account("abs-current-5510", 940.00)]),
    "fidelity": Bank("Fidelity Bank", None, [Account("fid-current-3307", 6_720.75)]),
    "testbank-slow": Bank("Testbank (slow)", "slow", [Account("slow-acct-01", 1_200.00)]),
    "testbank-flaky": Bank("Testbank (flaky)", "flaky", [Account("flaky-acct-01", 800.00)]),
}


def _new_txn(kind: str) -> dict:
    table = CREDITS if kind == "credit" else DEBITS
    name, category, lo, hi = random.choice(table)
    amount = round(random.uniform(lo, hi), 2)
    return {
        "provider_transaction_id": f"mb-{next(_ids)}",
        "amount": amount if kind == "credit" else -amount,
        "description": name,
        "category": category,
        "posted_at": datetime.now(timezone.utc).isoformat(),
    }


def _seed() -> None:
    """Give every account a short history so the first sync isn't empty."""
    for bank in BANKS.values():
        for acct in bank.accounts:
            now = datetime.now(timezone.utc)
            history = [_new_txn("credit")] + [_new_txn("debit") for _ in range(random.randint(3, 6))]
            for i, t in enumerate(reversed(history)):
                t["posted_at"] = (now - timedelta(days=i + 1)).isoformat()
            acct.txns = list(reversed(history))


def _tick() -> None:
    for bank in BANKS.values():
        for acct in bank.accounts:
            for _ in range(random.randint(0, 3)):
                acct.txns.append(_new_txn("debit"))
            if random.random() < 0.15:
                acct.txns.append(_new_txn("credit"))


async def _ticker() -> None:
    while True:
        await asyncio.sleep(TICK_SECONDS)
        _tick()


@asynccontextmanager
async def lifespan(_: FastAPI):
    _seed()
    task = asyncio.create_task(_ticker())
    yield
    task.cancel()


app = FastAPI(title="Mock Bank", lifespan=lifespan)


def _bank(slug: str) -> Bank:
    bank = BANKS.get(slug)
    if bank is None:
        raise HTTPException(404, f"unknown bank {slug!r}")
    return bank


async def _apply_quirk(bank: Bank) -> None:
    if bank.quirk == "slow":
        await asyncio.sleep(SLOW_DELAY_SECONDS)
    elif bank.quirk == "flaky" and random.random() < FLAKY_FAILURE_RATE:
        raise HTTPException(503, f"{bank.name} is temporarily unavailable")


@app.get("/banks")
async def list_banks():
    return [{"slug": slug, "name": b.name, "note": b.note} for slug, b in BANKS.items()]


@app.get("/{slug}/accounts")
async def accounts(slug: str):
    bank = _bank(slug)
    await _apply_quirk(bank)
    return [
        {"account_id": a.account_id, "balance": a.balance, "currency": a.currency}
        for a in bank.accounts
    ]


@app.get("/{slug}/transactions")
async def transactions(slug: str):
    bank = _bank(slug)
    await _apply_quirk(bank)
    out: list[dict] = []
    for a in bank.accounts:
        for t in a.txns:
            out.append({k: t[k] for k in ("provider_transaction_id", "amount", "description", "posted_at")})
    out.sort(key=lambda t: t["posted_at"], reverse=True)
    return out
