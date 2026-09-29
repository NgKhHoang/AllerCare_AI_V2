import os
from pathlib import Path
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DEMO_MODE: bool = True
    DATABASE_URL: str = "postgresql+psycopg://allercare:allercare_demo@localhost:5432/allercare"
    AUTH_SECRET: str = "change-me-to-a-long-random-string-in-production"
    AUTH_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    AI_PROVIDER: str = "gemini"
    AI_MODEL: str = "gemini-3.8-flash"
    AI_API_KEY: str = ""
    VIDEO_BASE_URL: str = ""
    LIVEKIT_URL: str = ""
    LIVEKIT_API_KEY: str = ""
    LIVEKIT_API_SECRET: str = ""
    LIVEKIT_TOKEN_TTL_MINUTES: int = 60
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    @model_validator(mode="after")
    def check_ai_api_key_fallback(self) -> "Settings":
        if not self.AI_API_KEY:
            # Dò tìm file .env hoặc appsettings.json
            candidates = [
                Path(".env"),
                Path("/srv/.env"),
                Path(__file__).resolve().parents[2] / ".env",
                Path(__file__).resolve().parents[3] / "src" / "AppHost" / "appsettings.json",
            ]
            for cand in candidates:
                if cand.is_file():
                    try:
                        text = cand.read_text(encoding="utf-8")
                        if cand.suffix == ".json":
                            import json
                            data = json.loads(text)
                            if data.get("AI_API_KEY"):
                                self.AI_API_KEY = data["AI_API_KEY"].strip()
                                break
                        else:
                            for line in text.splitlines():
                                line = line.strip()
                                if line.startswith("AI_API_KEY="):
                                    val = line.split("=", 1)[1].strip().strip('"').strip("'")
                                    if val:
                                        self.AI_API_KEY = val
                                        break
                    except Exception:
                        pass
                if self.AI_API_KEY:
                    break
        return self

    @property
    def allowed_origins(self) -> list[str]:
        origins = [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]
        defaults = [
            "https://allercare-ai-v2-web.onrender.com",
            "https://allercare-web.onrender.com",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
        for d in defaults:
            if d not in origins:
                origins.append(d)
        return origins


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
