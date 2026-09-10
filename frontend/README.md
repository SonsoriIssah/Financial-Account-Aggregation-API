# KudiVault — frontend

React + TypeScript + Vite client for the aggregation API. Tailwind design tokens
are lifted from the Stitch mockups (`tailwind.config.js`).

## Run

```bash
npm install
cp .env.example .env          # VITE_API_BASE_URL, defaults to http://localhost:8000
npm run dev                   # http://localhost:5173
```

The API must be running with CORS allowing this origin (it does by default —
`CORS_ALLOW_ORIGINS` in the backend `.env`), plus Redis, Kafka, a worker, and
the mock provider on :9000.

## Layout

- `src/lib/api.ts` — typed client; access token in `localStorage`, one silent
  refresh on 401
- `src/auth/AuthContext.tsx` — session state, bootstraps from `GET /auth/me`
- `src/pages/` — Login/Register, Dashboard, AccountDetail, Settings
- `src/features/LinkAccountModal.tsx` — the 3-step link flow
- Data fetching via TanStack Query; `sync-status` polls while a job is
  `queued`/`in_progress`

## Scripts

`npm run dev` · `npm run build` (typecheck + bundle) · `npm run typecheck` · `npm run preview`
