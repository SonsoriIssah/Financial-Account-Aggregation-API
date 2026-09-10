# Financial Account Aggregation API — Build Guide
## Phase 1: Foundations

---

## Day 1 - 9/7/26
**File:** `alembic/versions/xxxx_initial_schema.py` + `alembic.ini` / `env.py` setup

**Purpose:** Get the database schema under version control. This migration creates the five core tables (`users`, `linked_accounts`, `accounts`, `transactions`, `sync_jobs`) and their foreign-key relationships, so the schema exists as a reproducible artifact rather than only as Python model definitions in your head.

**Build Steps:**
1. Install and initialize Alembic in the project (`alembic init alembic`), point `sqlalchemy.url` in `alembic.ini` (or `env.py`) at your Postgres connection string via environment variable — never hardcoded.
2. Import your existing SQLAlchemy models into `env.py`'s `target_metadata` so `autogenerate` can see them.
3. Run `alembic revision --autogenerate -m "initial schema"` and read the generated file line by line — don't trust it blindly. Confirm it captures all 5 tables and every FK.
4. Manually verify the unique constraint on `transactions(account_id, provider_transaction_id)` is present in the migration — autogenerate sometimes misses composite constraints depending on how they were declared on the model.
5. Confirm every UUID primary key column has `server_default` or an application-side default set (e.g. `uuid4`), not just a bare column type.
6. Run `alembic upgrade head` against your actual dev database.
7. Connect via `psql` (or your DB tool) and manually confirm: all 5 tables exist, all FKs point where expected, and the unique constraint on `transactions` is a real constraint (try inserting a duplicate `(account_id, provider_transaction_id)` pair by hand and confirm Postgres rejects it).
8. Commit the migration file — this is the first reproducible artifact of the project.

> **Technical Decisions to Consider:**
> - **Cascade behavior:** if a `user` is deleted, should `linked_accounts` cascade-delete, or should deletion be blocked/soft? What about `linked_account` → `accounts` → `transactions`? Pick one policy and apply it consistently — an inconsistent mix is a common source of orphaned-row bugs later.
> - **`access_token` encryption:** the design doc calls for this to be encrypted at rest (Fernet or similar), with the key in an env var. Is that encryption/decryption layer going in now (at the model/migration level, e.g. as a custom SQLAlchemy type) or deferred to Phase 3 when you actually write tokens? Deciding now avoids a painful later migration to change the column type.
> - **Enum columns** (`linked_accounts.status`, `accounts.account_type`, `sync_jobs.status`): Postgres native `ENUM` type vs. a plain `string` with app-level validation? Native enums are stricter but harder to alter later (adding a new status value requires a migration); strings are more flexible but push validation into application code. Given `needs_reauth` gets added in Phase 4, consider whether you want that flexibility now.
> - **Timestamps:** UTC-naive or timezone-aware (`timestamptz`)? Given this touches financial transaction timing across potentially different bank timezones, timezone-aware is almost certainly correct — confirm this is set on every timestamp column now, since retrofitting it later touches every row.

**Status:** Not yet started.

---

## Day 2 - 9/8/26
**File:** `app/auth.py`, `app/dependencies.py`, `app/routers/auth.py`

**Purpose:** Stand up authentication for the aggregator's own client-facing API. Per the design doc (§9), this reuses the JWT pattern already built and proven in LedgerCore rather than designing a new one — register, login, `get_current_user`, and refresh tokens, ported and adapted.

**Build Steps:**
1. Copy the relevant pieces of LedgerCore's `auth.py` (password hashing via passlib/bcrypt, JWT encode/decode via python-jose) into this project as a starting point — don't rewrite from scratch.
2. Adapt the `User` model references to match this project's `users` table (from Day 1's migration) rather than LedgerCore's.
3. Build `POST /auth/register`: hash the incoming password, insert a new `users` row, return a minimal confirmation (not the password hash).
4. Build `POST /auth/login`: verify credentials, issue an access token + refresh token pair.
5. Build the `get_current_user` dependency: decode the JWT from the `Authorization` header, look up the user, raise 401 on failure — this becomes the dependency every protected route in later phases will use.
6. Build `POST /auth/refresh`: validate a refresh token, issue a new access token.
7. Add one placeholder protected route (e.g. `GET /me`) that uses `get_current_user`, purely to prove the dependency chain works end-to-end.
8. Test manually end-to-end: register → login → call `/me` with the access token → confirm it works → confirm it fails with no token or a garbage token → refresh → confirm the new access token also works.
9. Confirm the JWT signing secret is read from an environment variable, not hardcoded — this was a specific lesson from LedgerCore's own build (per your project history) and is worth checking explicitly rather than assuming it carried over.

> **Technical Decisions to Consider:**
> - **Token lifetime:** what expiry for access vs. refresh tokens? LedgerCore's existing values are a reasonable default, but this API's usage pattern (background sync jobs running independently of user sessions) may not need the same tradeoffs — worth a deliberate choice, not just a copy-paste.
> - **`require_role`-style RBAC:** the design doc mentions reusing this pattern (§9) for protected routes. Does this project actually need multiple roles at this stage (Phase 1), or is a single authenticated-user check sufficient until a real need for roles appears? Building unused RBAC now is speculative complexity — consider deferring it.
> - **Where does user identity intersect with `linked_accounts`?** Every linked account belongs to a `user_id`. Decide now whether route-level authorization (e.g. "can this user access this specific linked account") is enforced as a reusable dependency/helper, or hand-rolled per route in later phases — retrofitting this consistently across every account/transaction route later is more error-prone than deciding the pattern once, now.
> - **Synchronous vs async DB calls in auth routes:** if the rest of the app (Sync Worker, provider calls) is async, is the auth layer async end-to-end too (`asyncpg`/async SQLAlchemy), matching LedgerCore's documented stack? Mixing sync and async DB access in the same codebase is a common source of subtle bugs (blocking the event loop) — confirm consistency now while the surface area is still small.

**Status:** Not yet started.
