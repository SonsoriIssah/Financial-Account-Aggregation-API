# Financial Account Aggregation API

Backend service that links multiple bank accounts through one aggregator provider
(Plaid/Mono/Okra-style, or a mock during development) and serves a normalized view
of accounts, balances, and transactions. Read-only aggregation — no money movement.

Stack: FastAPI · PostgreSQL (SQLAlchemy 2.0 async + Alembic) · Redis · Kafka.
Full spec: `Financial_Account_Aggregation_API_Design_Doc`. Second portfolio project
after LedgerCore; the owner is deliberately using it to learn backend engineering.

## How Claude works on this project

The owner writes the code that teaches backend engineering. Claude reviews, explains,
and scaffolds. This is a firm working agreement, not a preference to weigh case by case.

**Claude does NOT write the first draft of:**
database models & relationships, Pydantic schemas, CRUD logic, auth flow, the linking
flow, provider-response normalization, deduplication logic, sync logic, retry /
exponential backoff, rate limiting, `needs_reauth` handling, Redis caching, the Kafka
producer / consumer / worker, the scheduler, failure-case tests, and any architecture
decision. If asked to, push back and offer to review a plan instead.

**Claude's role on those parts:**
1. Review the owner's written step-by-step plan *before* they code ("what's missing or
   wrong — don't write the code").
2. Review the owner's implementation *after*: bugs, edge cases, security, design.
3. Answer narrow syntax / single-concept questions without building the feature around them.

**Claude MAY generate freely** (still show the output for review): Docker / Compose,
`.gitignore`, dependency/config boilerplate, env var setup, logging config, mock-bank
response JSON / fixtures, test data, Alembic migration scaffolding, Postman collections,
API docs, README, formatting, obvious syntax-error fixes.

When in doubt: if the owner could explain the implementation steps without looking at
code, they write it themselves.

## Build phases (owner-paced)

1. Foundations — FastAPI structure, Postgres, core tables, JWT auth. *(done)*
2. Mock provider — fake banks with quirks (bank-a normal, bank-b flaky 503, bank-c slow). *(done)*
3. Linking + synchronous sync (no Kafka yet) — normalize-and-store, dedup, account endpoints. *(done)*
4. Resilience — retry/backoff, Redis token-bucket rate limiter, `needs_reauth`, failure tests. *(done)*
5. Background processing — Kafka `account-sync-requests`/`-results`, `app/worker.py`, `app/scheduler.py`. *(done)*
6. Polish + metrics — sync-status endpoint, structured logging, load/chaos test. *(next)*

## Conventions

- Alembic migrations are the only way schema changes reach the DB. Every model change
  gets a migration; never edit the database directly.
- Access tokens from the provider are encrypted at rest (Fernet, key from env). *(still a TODO — stored plaintext)*
- `.env` holds real secrets and must never be committed — keep `.env.example` current instead.
- All async: async SQLAlchemy engine/sessions, async route handlers.
- Infra via `docker compose up -d` (Postgres + Redis + Kafka). Redis backs the rate
  limiters (fail open if down); Kafka carries sync work. Tests need all three plus the
  mock provider on :9000, and use a separate `finaggapi_test` database (`uv run pytest`).
- Provider calls go through `app.provider._get`: per-provider token bucket + retry with
  exponential backoff. Auth errors (401/403) are never retried and flip the link to
  `needs_reauth`.
- Sync runs off the request path: `POST /accounts/{id}/sync` publishes to
  `account-sync-requests` (202). `python -m app.worker` consumes and runs
  `app.sync.sync_linked_account`; `python -m app.scheduler` enqueues due active links
  every `scheduler_poll_seconds`. The worker's unit of work is
  `app.worker.process_sync_request(db, payload)` — that's what tests drive.
