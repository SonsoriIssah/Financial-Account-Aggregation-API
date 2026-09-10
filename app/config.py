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


settings = Settings()
