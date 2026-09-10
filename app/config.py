from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration, loaded from environment variables or a .env file.

    Field names are matched to env vars case-insensitively, so `database_url`
    reads `DATABASE_URL`. Fields without a default are required: the app fails
    to start if they are missing, which is intentional.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Required
    database_url: str
    jwt_secret_key: str

    # JWT
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Database
    sql_echo: bool = False

    # Logging
    log_level: str = "INFO"
    log_json: bool = True

    # Aggregator provider (mock service during development)
    mock_provider_base_url: str = "http://127.0.0.1:9000"
    provider_timeout_seconds: float = 30.0

    # Resilience (Phase 4)
    redis_url: str = "redis://localhost:6379/0"
    # retry with exponential backoff on transient provider failures
    provider_max_attempts: int = 3
    provider_backoff_base_seconds: float = 2.0
    provider_backoff_max_seconds: float = 20.0
    # token bucket limiting our outbound calls to a provider
    provider_rate_capacity: int = 60
    provider_rate_refill_per_second: float = 1.0
    # fixed-window limiting a single user's calls to the sync endpoint
    api_rate_limit_per_minute: int = 30

    # Background processing (Phase 5)
    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_sync_requests_topic: str = "account-sync-requests"
    kafka_sync_results_topic: str = "account-sync-results"
    kafka_consumer_group: str = "sync-workers"
    # scheduler: re-sync an active link this many seconds after its last sync,
    # polling for due links this often
    sync_interval_seconds: int = 300
    scheduler_poll_seconds: int = 60
    # cap on how long the worker waits before requeueing a rate-limited sync
    worker_max_requeue_delay_seconds: float = 60.0


settings = Settings()
