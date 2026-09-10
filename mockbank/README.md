# mockbank

A fake-bank service for demos — stands in for a Plaid-style aggregator so the
whole pipeline (link → sync worker → Kafka → dashboard) can be shown without
real bank credentials.

Each bank keeps an in-memory ledger that a background task grows every
`MOCKBANK_TICK_SECONDS` (default 1800), so the aggregator's scheduler keeps
pulling fresh transactions and the dashboard moves during a demo.

```bash
uv run uvicorn mockbank.app:app --port 9000
# or via docker compose (service "mockbank")
```

| Env | Default | |
|---|---|---|
| `MOCKBANK_TICK_SECONDS` | `1800` | how often new transactions appear (set `120` for a live demo) |
| `MOCKBANK_SLOW_DELAY` | `5` | delay for the "slow" bank |
| `MOCKBANK_FLAKY_RATE` | `0.15` | 503 rate for the "flaky" bank |

Ledgers reset on restart.
