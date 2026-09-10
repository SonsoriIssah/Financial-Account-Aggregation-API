# Financial Account Aggregation API

A backend service that links multiple bank accounts through a single aggregator
provider and serves a normalized view of accounts, balances and transactions —
regardless of which underlying bank the data came from. It handles the messy
parts (expired logins, slow or failing banks, duplicate data) so callers never
have to.

Read-only aggregation: no payments, no money movement. Real banks are not
integrated directly — a **mock provider** stands in for a Plaid/Mono/Okra-style
aggregator during development.

**Stack:** FastAPI · PostgreSQL (SQLAlchemy 2 async + Alembic) · Redis · Kafka

## Architecture

```
client ──REST──▶ FastAPI ──┬──▶ PostgreSQL      (system of record)
                           ├──▶ Redis           (rate-limit counters)
                           └──▶ Kafka topic     account-sync-requests
                                     │
                                     ▼
                             Sync Worker(s) ──▶ Aggregator / mock provider
                                     │
                                     └──▶ Kafka topic  account-sync-results
```

Reads are always served from Postgres/Redis and never call the provider inline,
so a slow bank never makes the API slow. A **scheduler** enqueues periodic
syncs; a **worker** consumes them and does the real work.

## Running it

```bash
docker compose up -d          # Postgres, Redis, Kafka
cp .env.example .env          # then edit if needed
uv sync
uv run alembic upgrade head

# the mock provider (separate repo/service) must be listening on :9000

uv run uvicorn app.main:app --reload      # API      → http://localhost:8000/docs
uv run python -m app.worker               # sync worker
uv run python -m app.scheduler            # periodic scheduler

cd frontend && npm install && npm run dev # web UI   → http://localhost:5173
```

A React + TypeScript client lives in [`frontend/`](frontend/) — dashboard, account
detail with transactions, the link flow, and settings. The API enables CORS for
`http://localhost:5173` by default (`CORS_ALLOW_ORIGINS`).

## API

All routes require a bearer token except `/auth/*` and `/health`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` · `/auth/login` · `/auth/refresh` | JWT auth (access + refresh) |
| POST | `/accounts/link` | Start linking — returns a link token |
| POST | `/accounts/link/callback` | Complete the link; creates accounts + runs an initial sync |
| GET | `/accounts` | List the caller's accounts |
| GET | `/accounts/{id}/balance` | Cached balance |
| GET | `/accounts/{id}/transactions` | Paginated (`limit`/`offset`), filterable by `start_date`/`end_date` |
| POST | `/accounts/{id}/sync` | Queue a sync (202); a worker runs it |
| GET | `/accounts/{id}/sync-status` | Status of the most recent sync job |
| DELETE | `/accounts/{id}` | Unlink (cascades accounts, transactions, jobs) |

## Resilience

| Failure | Handling |
|---|---|
| Transient provider error (timeout, 5xx) | Retry with exponential backoff (`app/provider.py`) |
| Provider rate limit | Redis token bucket throttles outbound calls; worker requeues with a delay |
| Expired / revoked token (401/403) | Not retried; link flipped to `needs_reauth`, syncing stops until re-link |
| Duplicate transactions | `INSERT ... ON CONFLICT DO NOTHING` on `(account_id, provider_transaction_id)` |
| One bank down among many | Each linked account syncs independently |
| Kafka briefly unreachable | `POST /sync` still returns 202; the scheduler catches the account next pass |
| Redis unreachable | Rate limiters fail open (logged) |

Access tokens are intended to be encrypted at rest (Fernet) — currently a
known gap, stored plaintext.

## Tests

```bash
uv run pytest        # needs Postgres + Redis + the mock provider on :9000
```

`tests/test_resilience.py` forces each failure mode; `tests/test_background.py`
covers the enqueue → worker → result path; `tests/test_chaos.py` is the
load/chaos test.

**Chaos result** — 20 linked accounts synced concurrently for 3 rounds against
a provider injecting ~10–15% `503`s:

```
60 concurrent syncs in ~4s | ~140 provider calls, ~15% injected 503s
59 success / 1 failed | 100 transactions stored | 0 duplicates | 0 unhandled crashes
```

Retry absorbed almost every injected failure; the one exhausted retry left a
recorded `failed` job with the account still active for the next pass; the
unique constraint held under concurrent re-sync.

## Known gaps

- Provider access tokens stored plaintext (Fernet encryption planned).
- Auto-created Kafka topics have one partition, so only one worker does work;
  pre-create with N partitions for real parallelism.
- No dead-letter topic; a poison message is logged and skipped.
- No CI; regulatory concerns (KYC, PCI-DSS) explicitly out of scope.
