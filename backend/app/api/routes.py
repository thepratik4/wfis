import sys
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Path, Query

from app.config import settings
from app.schemas.models import (
    AccuracyResponse,
    DataMode,
    DataQualityResponse,
    ForecastsResponse,
    HealthResponse,
    OverviewResponse,
    PublicationHistoryResponse,
    RefreshRequest,
    RefreshResponse,
)
from app.services.analytics_engine import analytics_engine
from app.services.elexon_client import ElexonAPIError, elexon_client

router = APIRouter(prefix="/api", tags=["wind-analytics"])


@router.get("/health", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        python_version=f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        elexon_base_url=settings.elexon_base_url,
        default_cutoff_time=settings.default_cutoff_time,
        default_cutoff_days_before=settings.default_cutoff_days_before,
        last_refresh_utc=elexon_client._last_refresh_utc,
        active_data_mode="live" if settings.default_data_mode == "live" else "sample",
    )


@router.get("/overview", response_model=OverviewResponse)
async def get_overview(
    start_date: str = Query(default="2026-01-01", description="Start date YYYY-MM-DD (Jan 2026)"),
    end_date: str = Query(default="2026-01-31", description="End date YYYY-MM-DD (Jan 2026)"),
    delivery_date: Optional[str] = Query(default=None, description="Optional single delivery date YYYY-MM-DD"),
    cutoff_time: str = Query(default=settings.default_cutoff_time, description="Decision cutoff HH:MM UK local time"),
    cutoff_days_before: int = Query(default=settings.default_cutoff_days_before, ge=0, le=7),
    data_mode: DataMode = Query(default="live", description="'live' Elexon BMRS or 'sample' sandbox mode"),
) -> OverviewResponse:
    try:
        return await analytics_engine.get_overview(
            start_date=start_date,
            end_date=end_date,
            delivery_date=delivery_date,
            cutoff_time=cutoff_time,
            cutoff_days_before=cutoff_days_before,
            data_mode=data_mode,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ElexonAPIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))


@router.get("/forecasts", response_model=ForecastsResponse)
async def get_forecasts(
    start_date: str = Query(default="2026-01-01", description="Start date YYYY-MM-DD"),
    end_date: str = Query(default="2026-01-31", description="End date YYYY-MM-DD"),
    delivery_date: Optional[str] = Query(default=None, description="Optional single delivery date YYYY-MM-DD"),
    cutoff_time: str = Query(default=settings.default_cutoff_time, description="Decision cutoff HH:MM UK local time"),
    cutoff_days_before: int = Query(default=settings.default_cutoff_days_before, ge=0, le=7),
    data_mode: DataMode = Query(default="live"),
    only_matched: bool = Query(default=False, description="If true, return only matched forecast-actual periods"),
) -> ForecastsResponse:
    try:
        return await analytics_engine.get_forecasts(
            start_date=start_date,
            end_date=end_date,
            delivery_date=delivery_date,
            cutoff_time=cutoff_time,
            cutoff_days_before=cutoff_days_before,
            data_mode=data_mode,
            only_matched=only_matched,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ElexonAPIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))


@router.get("/accuracy", response_model=AccuracyResponse)
async def get_accuracy(
    start_date: str = Query(default="2026-01-01", description="Start date YYYY-MM-DD"),
    end_date: str = Query(default="2026-01-31", description="End date YYYY-MM-DD"),
    delivery_date: Optional[str] = Query(default=None, description="Optional single delivery date YYYY-MM-DD"),
    cutoff_time: str = Query(default=settings.default_cutoff_time, description="Decision cutoff HH:MM UK local time"),
    cutoff_days_before: int = Query(default=settings.default_cutoff_days_before, ge=0, le=7),
    data_mode: DataMode = Query(default="live"),
) -> AccuracyResponse:
    try:
        return await analytics_engine.get_accuracy(
            start_date=start_date,
            end_date=end_date,
            delivery_date=delivery_date,
            cutoff_time=cutoff_time,
            cutoff_days_before=cutoff_days_before,
            data_mode=data_mode,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ElexonAPIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))


@router.get("/forecasts/{start_time}/history", response_model=PublicationHistoryResponse)
async def get_forecast_publication_history(
    start_time: str = Path(..., description="ISO-8601 UTC delivery period timestamp, e.g. 2026-01-15T12:00:00Z"),
    cutoff_time: str = Query(default=settings.default_cutoff_time, description="Decision cutoff HH:MM UK local time"),
    cutoff_days_before: int = Query(default=settings.default_cutoff_days_before, ge=0, le=7),
    data_mode: DataMode = Query(default="live"),
) -> PublicationHistoryResponse:
    decoded_start_time = unquote(start_time)
    try:
        return await analytics_engine.get_publication_history(
            start_time_raw=decoded_start_time,
            cutoff_time=cutoff_time,
            cutoff_days_before=cutoff_days_before,
            data_mode=data_mode,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ElexonAPIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))


@router.get("/data-quality", response_model=DataQualityResponse)
async def get_data_quality(
    start_date: str = Query(default="2026-01-01", description="Start date YYYY-MM-DD"),
    end_date: str = Query(default="2026-01-31", description="End date YYYY-MM-DD"),
    cutoff_time: str = Query(default=settings.default_cutoff_time, description="Decision cutoff HH:MM UK local time"),
    cutoff_days_before: int = Query(default=settings.default_cutoff_days_before, ge=0, le=7),
    data_mode: DataMode = Query(default="live"),
) -> DataQualityResponse:
    try:
        return await analytics_engine.get_data_quality(
            start_date=start_date,
            end_date=end_date,
            cutoff_time=cutoff_time,
            cutoff_days_before=cutoff_days_before,
            data_mode=data_mode,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ElexonAPIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_data(payload: Optional[RefreshRequest] = None) -> RefreshResponse:
    req = payload or RefreshRequest()
    try:
        if req.data_mode == "sample":
            elexon_client._sample_actuals = None
            elexon_client._sample_forecasts = None
            actuals, forecasts, meta = elexon_client.get_sample_january_2026()
            return RefreshResponse(
                success=True,
                data_mode="sample",
                refreshed_at_utc=meta.get("last_refresh_utc")
                or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                actual_records_loaded=len(actuals),
                forecast_records_loaded=len(forecasts),
                message="Regenerated synthetic January 2026 sample dataset.",
                used_cached_fallback=False,
            )

        actuals, forecasts, meta = await elexon_client.fetch_live_january_2026(
            force_refresh=req.force
        )
        used_fallback = bool(meta.get("using_fallback_cache"))
        msg = (
            f"Refresh encountered upstream error ({meta.get('last_refresh_error')}); preserved last valid cached dataset."
            if used_fallback
            else "Successfully refreshed January 2026 FUELHH and WINDFOR datasets from Elexon BMRS API."
        )
        return RefreshResponse(
            success=not used_fallback,
            data_mode="live",
            refreshed_at_utc=meta.get("last_refresh_utc")
            or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            actual_records_loaded=len(actuals),
            forecast_records_loaded=len(forecasts),
            message=msg,
            used_cached_fallback=used_fallback,
        )
    except ElexonAPIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
