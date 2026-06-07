from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    DATABASE_URL: str

    S3_ENDPOINT: str
    S3_BUCKET: str
    S3_REGION: str = "us-east-1"
    S3_ACCESS_KEY_ID: str
    S3_SECRET_ACCESS_KEY: str
    S3_PUBLIC_BASE_URL: str
    S3_FORCE_PATH_STYLE: bool = True

    COUPLE_NAMES: str = "Stefanie & Leandro"
    EVENT_DATE: str | None = None
    PUBLIC_BASE_URL: str | None = None

    ADMIN_PASSWORD: str
    SESSION_SECRET: str = Field(..., min_length=16)
    ALLOWED_ADMIN_EMAILS: str

    PORT: int = 3000
    STATIC_DIR: str = "./public"
    NODE_ENV: str = "production"
    AUTO_MIGRATE: bool = True

    @property
    def admin_emails_list(self) -> list[str]:
        return [e.strip().lower() for e in self.ALLOWED_ADMIN_EMAILS.split(",") if e.strip()]

    @property
    def is_production(self) -> bool:
        return self.NODE_ENV == "production"


settings = Settings()  # type: ignore[call-arg]
