import asyncio
import json
import math
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import httpx

from app.config import settings


class ElexonAPIError(Exception):
    """Raised when the Elexon BMRS API returns an unrecoverable error and no valid cache exists."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


class ElexonClient:
    """
    Asynchronous client for official Elexon BMRS datasets:
    - Actual generation: /datasets/FUELHH/stream (filtered to fuelType=WIND)
    - Forecast generation: /datasets/WINDFOR/stream

    Includes:
    - Retry with exponential backoff for transient network errors and 429 rate limits
    - Disk-backed and in-memory caching with configurable TTL
    - Safe preservation of the last valid dataset if a live refresh fails
    - Explicitly labeled synthetic Sample Data mode for offline/sandbox comparison
    """

    def __init__(
        self,
        base_url: str = settings.elexon_base_url,
        timeout_seconds: float = settings.elexon_timeout_seconds,
        cache_dir: str = settings.cache_dir,
        cache_ttl_seconds: int = settings.cache_ttl_seconds,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.cache_ttl_seconds = cache_ttl_seconds

        # In-memory cache state
        self._live_actuals: Optional[list[dict[str, Any]]] = None
        self._live_forecasts: Optional[list[dict[str, Any]]] = None
        self._actuals_fetched_at: Optional[float] = None
        self._forecasts_fetched_at: Optional[float] = None
        self._last_refresh_utc: Optional[str] = None
        self._last_refresh_error: Optional[str] = None
        self._using_fallback_cache: bool = False

        # Sample data cache
        self._sample_actuals: Optional[list[dict[str, Any]]] = None
        self._sample_forecasts: Optional[list[dict[str, Any]]] = None
        self._sample_generated_utc: Optional[str] = None

        self._load_disk_cache()

    @property
    def fuelhh_endpoint(self) -> str:
        return f"{self.base_url}/datasets/FUELHH/stream"

    @property
    def windfor_endpoint(self) -> str:
        return f"{self.base_url}/datasets/WINDFOR/stream"

    def _cache_paths(self) -> tuple[Path, Path, Path]:
        return (
            self.cache_dir / "fuelhh_jan2026.json",
            self.cache_dir / "windfor_jan2026.json",
            self.cache_dir / "cache_meta.json",
        )

    def _load_disk_cache(self) -> None:
        actuals_path, forecasts_path, meta_path = self._cache_paths()
        try:
            if actuals_path.exists() and forecasts_path.exists() and meta_path.exists():
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                self._live_actuals = json.loads(actuals_path.read_text(encoding="utf-8"))
                self._live_forecasts = json.loads(forecasts_path.read_text(encoding="utf-8"))
                self._actuals_fetched_at = meta.get("actuals_fetched_at")
                self._forecasts_fetched_at = meta.get("forecasts_fetched_at")
                self._last_refresh_utc = meta.get("last_refresh_utc")
        except Exception:
            # Ignore corrupted cache files; next request will fetch fresh data
            pass

    def _save_disk_cache(self) -> None:
        actuals_path, forecasts_path, meta_path = self._cache_paths()
        try:
            if self._live_actuals is not None and self._live_forecasts is not None:
                actuals_path.write_text(json.dumps(self._live_actuals), encoding="utf-8")
                forecasts_path.write_text(json.dumps(self._live_forecasts), encoding="utf-8")
                meta = {
                    "actuals_fetched_at": self._actuals_fetched_at,
                    "forecasts_fetched_at": self._forecasts_fetched_at,
                    "last_refresh_utc": self._last_refresh_utc,
                }
                meta_path.write_text(json.dumps(meta), encoding="utf-8")
        except Exception:
            pass

    def is_cache_fresh(self) -> bool:
        if (
            self._live_actuals is None
            or self._live_forecasts is None
            or self._forecasts_fetched_at is None
        ):
            return False
        age = time.time() - self._forecasts_fetched_at
        return age < self.cache_ttl_seconds

    async def _request_json(
        self, client: httpx.AsyncClient, url: str, params: dict[str, Any]
    ) -> list[dict[str, Any]]:
        max_retries = 3
        backoff = 1.0
        last_exc: Optional[Exception] = None

        for attempt in range(max_retries):
            try:
                response = await client.get(
                    url,
                    params=params,
                    headers={"Accept": "application/json"},
                )
                if response.status_code == 429:
                    retry_after = float(response.headers.get("Retry-After", backoff))
                    await asyncio.sleep(min(retry_after, 5.0))
                    backoff *= 2
                    continue

                response.raise_for_status()
                payload = response.json()

                if isinstance(payload, list):
                    return payload
                if isinstance(payload, dict) and isinstance(payload.get("data"), list):
                    return payload["data"]

                raise ElexonAPIError(
                    f"Unexpected Elexon response format from {url}: expected JSON array",
                    status_code=502,
                )
            except httpx.TimeoutException as exc:
                last_exc = ElexonAPIError(
                    f"Timeout after {self.timeout_seconds}s calling Elexon endpoint {url}",
                    status_code=504,
                )
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                if status >= 500 and attempt < max_retries - 1:
                    await asyncio.sleep(backoff)
                    backoff *= 2
                    continue
                last_exc = ElexonAPIError(
                    f"Elexon HTTP {status} error calling {url}: {exc.response.text[:250]}",
                    status_code=status if 400 <= status < 500 else 502,
                )
                break
            except httpx.RequestError as exc:
                last_exc = ElexonAPIError(
                    f"Network error communicating with Elexon API ({url}): {str(exc)}",
                    status_code=502,
                )

            if attempt < max_retries - 1:
                await asyncio.sleep(backoff)
                backoff *= 2

        raise last_exc or ElexonAPIError(f"Failed to retrieve data from {url}")

    async def fetch_live_january_2026(
        self, force_refresh: bool = False
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
        """
        Retrieves January 1 - January 31, 2026 actual wind generation (FUELHH)
        and historical wind forecast publications (WINDFOR, published from 2025-12-28 through 2026-02-01
        so multi-day-ahead publications for Jan 1, 2026 are fully captured).
        """
        if not force_refresh and self.is_cache_fresh():
            now_ts = time.time()
            return (
                self._live_actuals or [],
                self._live_forecasts or [],
                {
                    "last_refresh_utc": self._last_refresh_utc,
                    "actuals_cache_age_seconds": round(
                        now_ts - (self._actuals_fetched_at or now_ts), 1
                    ),
                    "forecasts_cache_age_seconds": round(
                        now_ts - (self._forecasts_fetched_at or now_ts), 1
                    ),
                    "using_fallback_cache": self._using_fallback_cache,
                    "last_refresh_error": self._last_refresh_error,
                },
            )

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                # Historical actuals for Jan 2026 are immutable settlement records;
                # only re-fetch actuals if force_refresh is True or not yet cached.
                if force_refresh or self._live_actuals is None:
                    actuals_task = self._request_json(
                        client,
                        self.fuelhh_endpoint,
                        {
                            "settlementDateFrom": "2026-01-01",
                            "settlementDateTo": "2026-01-31",
                            "fuelType": "WIND",
                        },
                    )
                else:
                    actuals_task = None

                # Query WINDFOR stream from Dec 28, 2025 00:00Z to Feb 1, 2026 00:00Z
                # to capture all forecast revisions published prior to Jan 1, 2026 gate closure
                forecasts_task = self._request_json(
                    client,
                    self.windfor_endpoint,
                    {
                        "publishDateTimeFrom": "2025-12-28T00:00:00Z",
                        "publishDateTimeTo": "2026-02-01T00:00:00Z",
                    },
                )

                if actuals_task is not None:
                    actuals_data, forecasts_data = await asyncio.gather(
                        actuals_task, forecasts_task
                    )
                    self._live_actuals = actuals_data
                    self._actuals_fetched_at = time.time()
                else:
                    forecasts_data = await forecasts_task

                self._live_forecasts = forecasts_data
                self._forecasts_fetched_at = time.time()
                self._last_refresh_utc = datetime.now(timezone.utc).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                )
                self._last_refresh_error = None
                self._using_fallback_cache = False
                self._save_disk_cache()

        except Exception as exc:
            self._last_refresh_error = str(exc)
            if self._live_actuals is not None and self._live_forecasts is not None:
                # Preserve last valid dataset when refresh fails
                self._using_fallback_cache = True
            else:
                if isinstance(exc, ElexonAPIError):
                    raise exc
                raise ElexonAPIError(f"Failed to retrieve Elexon data: {str(exc)}")

        now_ts = time.time()
        return (
            self._live_actuals or [],
            self._live_forecasts or [],
            {
                "last_refresh_utc": self._last_refresh_utc,
                "actuals_cache_age_seconds": round(
                    now_ts - (self._actuals_fetched_at or now_ts), 1
                ),
                "forecasts_cache_age_seconds": round(
                    now_ts - (self._forecasts_fetched_at or now_ts), 1
                ),
                "using_fallback_cache": self._using_fallback_cache,
                "last_refresh_error": self._last_refresh_error,
            },
        )

    def get_sample_january_2026(
        self,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
        """
        Generates a deterministic, explicitly labeled synthetic sample dataset
        mirroring Elexon BMRS schemas (half-hourly FUELHH actuals and multi-revision
        hourly WINDFOR forecasts across January 1 - January 31, 2026).
        Never presented as live Elexon findings.
        """
        if self._sample_actuals is not None and self._sample_forecasts is not None:
            return (
                self._sample_actuals,
                self._sample_forecasts,
                {
                    "last_refresh_utc": self._sample_generated_utc,
                    "actuals_cache_age_seconds": 0.0,
                    "forecasts_cache_age_seconds": 0.0,
                    "using_fallback_cache": False,
                    "last_refresh_error": None,
                },
            )

        actuals: list[dict[str, Any]] = []
        forecasts: list[dict[str, Any]] = []

        start_dt = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
        # 31 days * 48 half-hours = 1,488 half-hour periods
        for idx in range(31 * 48):
            dt = start_dt + timedelta(minutes=30 * idx)
            settlement_date = dt.strftime("%Y-%m-%d")
            settlement_period = (idx % 48) + 1
            start_iso = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            pub_iso = (dt + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ")

            # Deterministic synoptic weather wave + diurnal pattern (between 4,800 MW and 18,500 MW)
            hours_elapsed = idx * 0.5
            synoptic = 11200.0 + 4800.0 * math.sin(hours_elapsed / 38.0) + 2100.0 * math.cos(hours_elapsed / 17.5)
            diurnal = 650.0 * math.sin((hours_elapsed % 24.0) * math.pi / 12.0)
            actual_mw = round(max(1800.0, min(19800.0, synoptic + diurnal)))

            actuals.append(
                {
                    "dataset": "FUELHH",
                    "publishTime": pub_iso,
                    "startTime": start_iso,
                    "settlementDate": settlement_date,
                    "settlementPeriod": settlement_period,
                    "fuelType": "WIND",
                    "generation": actual_mw,
                }
            )

            # Mirror Elexon WINDFOR hourly granularity (:00 minutes) with 8 daily revisions
            if dt.minute == 0:
                # Create 12 historical revisions published from 48h before delivery up to 2h after delivery
                revision_Publishing_hours = [-45.5, -40.5, -36.5, -32.5, -26.5, -21.5, -16.5, -13.5, -9.5, -5.5, -1.5, 2.5]
                for rev_idx, offset_h in enumerate(revision_Publishing_hours):
                    pub_dt = dt + timedelta(hours=offset_h)
                    # Forecast converges toward actual as publishTime approaches startTime,
                    # with a realistic +280 MW systematic day-ahead overforecast bias
                    lead_h = abs(offset_h)
                    systematic_bias = 280.0 if offset_h <= -12.0 else 65.0
                    wave_err = (lead_h * 26.0) * math.sin((idx * 0.37) + rev_idx * 0.8)
                    forecast_mw = round(max(1500.0, actual_mw + systematic_bias + wave_err))

                    forecasts.append(
                        {
                            "dataset": "WINDFOR",
                            "publishTime": pub_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "startTime": start_iso,
                            "generation": forecast_mw,
                        }
                    )

        self._sample_actuals = actuals
        self._sample_forecasts = forecasts
        self._sample_generated_utc = datetime.now(timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )

        return (
            self._sample_actuals,
            self._sample_forecasts,
            {
                "last_refresh_utc": self._sample_generated_utc,
                "actuals_cache_age_seconds": 0.0,
                "forecasts_cache_age_seconds": 0.0,
                "using_fallback_cache": False,
                "last_refresh_error": None,
            },
        )


elexon_client = ElexonClient()
