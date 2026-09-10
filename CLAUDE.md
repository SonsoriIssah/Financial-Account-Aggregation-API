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

1. Foundations — FastAPI structure, Postgres, core tables, JWT auth. *(in progress)*
2. Mock provider — 2–3 fake banks with quirks (slow, ~10% errors, different shape).
3. Linking + synchronous sync (no Kafka yet) — get normalize-and-store correct first.
4. Resilience — retry/backoff, Redis rate limiter, `needs_reauth`. The heart of the project.
5. Background processing — Kafka topic, standalone worker, scheduler.
6. Polish + metrics — sync-status endpoint, structured logging, load/chaos test.

## Conventions

- Alembic migrations are the only way schema changes reach the DB. Every model change
  gets a migration; never edit the database directly.
- Access tokens from the provider are encrypted at rest (Fernet, key from env).
- `.env` holds real secrets and must never be committed — keep `.env.example` current instead.
- All async: async SQLAlchemy engine/sessions, async route handlers.
