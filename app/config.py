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


settings = Settings()
