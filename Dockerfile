# Runtime image for the API on a hosted platform (Render, etc.).
# Local development still uses `uv run uvicorn ...` directly — this Dockerfile
# is only exercised by the deploy target.
FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

WORKDIR /app

# Install deps first so this layer is cached across code-only changes.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
RUN uv sync --frozen --no-dev

# Render (and most PaaS targets) inject $PORT; default it for local `docker run`.
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
