from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DEMO_MODE: bool = True
    DATABASE_URL: str = "postgresql+psycopg://allercare:allercare_demo@localhost:5432/allercare"
    AUTH_SECRET: str = "change-me-to-a-long-random-string-in-production"
    AUTH_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    AI_PROVIDER: str = "demo"
    AI_MODEL: str = "demo-rules-chat"
    AI_API_KEY: str = ""
    VIDEO_BASE_URL: str = ""
    LIVEKIT_URL: str = ""
    LIVEKIT_API_KEY: str = ""
    LIVEKIT_API_SECRET: str = ""
    LIVEKIT_TOKEN_TTL_MINUTES: int = 60
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_settings_public() -> dict:
    s = get_settings()
    return {
        "demo_mode": s.DEMO_MODE,
        "ai_provider": s.AI_PROVIDER,
        "video_enabled": bool(s.VIDEO_BASE_URL) or bool(s.LIVEKIT_URL),
    }
