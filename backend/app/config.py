import os
from pathlib import Path
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load root .env if present
root_env = Path(__file__).resolve().parents[2] / ".env"
if root_env.exists():
    load_dotenv(root_env)


class Settings(BaseModel):
    app_name: str = "Wind Forecast Intelligence API"
    app_version: str = "1.0.0"

    # Official Elexon Insights Solution (BMRS) API v1 base URL
    elexon_base_url: str = Field(
        default_factory=lambda: os.getenv(
            "ELEXON_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1"
        )
    )
    elexon_timeout_seconds: float = Field(
        default_factory=lambda: float(os.getenv("ELEXON_TIMEOUT_SECONDS", "25.0"))
    )

    # Default Day-Ahead Decision Cutoff:
    # 11:00 UK local time on D-1 (1 day prior to the delivery settlement date),
    # corresponding to typical GB day-ahead wholesale electricity auction gate closure (EPEX SPOT / N2EX).
    default_cutoff_time: str = Field(
        default_factory=lambda: os.getenv("DEFAULT_CUTOFF_TIME", "11:00")
    )
    default_cutoff_days_before: int = Field(
        default_factory=lambda: int(os.getenv("DEFAULT_CUTOFF_DAYS_BEFORE", "1"))
    )

    # Caching configuration
    cache_dir: str = Field(
        default_factory=lambda: os.getenv("CACHE_DIR", "/tmp/wind_forecast_cache")
    )
    cache_ttl_seconds: int = Field(
        default_factory=lambda: int(os.getenv("CACHE_TTL_SECONDS", "3600"))
    )
    default_data_mode: str = Field(
        default_factory=lambda: os.getenv("DEFAULT_DATA_MODE", "live")
    )

    # Analysis scope boundaries (January 2026)
    analysis_min_date: str = "2026-01-01"
    analysis_max_date: str = "2026-01-31"

    # CORS configuration
    cors_origins_raw: str = Field(
        default_factory=lambda: os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173",
        )
    )

    @property
    def cors_origins(self) -> list[str]:
        origins = [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]
        return origins if origins else ["http://localhost:3000"]


settings = Settings()
