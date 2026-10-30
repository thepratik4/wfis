from typing import Literal, Optional
from pydantic import BaseModel, Field


DataMode = Literal["live", "sample"]


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "Wind Forecast Intelligence API"
    version: str
    python_version: str
    elexon_base_url: str
    default_cutoff_time: str
    default_cutoff_days_before: int
    last_refresh_utc: Optional[str] = None
    active_data_mode: DataMode = "live"


class TimeSeriesPoint(BaseModel):
    start_time: str
    uk_local_time: str
    settlement_date: str
    settlement_period: int
    forecast_generation_mw: Optional[float] = None
    actual_generation_mw: Optional[float] = None
    signed_error_mw: Optional[float] = None
    abs_error_mw: Optional[float] = None
    publish_time: Optional[str] = None
    cutoff_time: str
    publication_age_hours: Optional[float] = None


class DailyMetricPoint(BaseModel):
    date: str
    matched_periods: int
    expected_half_hour_periods: int
    expected_hourly_periods: int
    mae_mw: Optional[float] = None
    rmse_mw: Optional[float] = None
    bias_mw: Optional[float] = None
    max_abs_error_mw: Optional[float] = None
    avg_forecast_mw: Optional[float] = None
    avg_actual_mw: Optional[float] = None
    overforecast_count: int = 0
    underforecast_count: int = 0


class ErrorDistributionBin(BaseModel):
    bin_label: str
    min_mw: float
    max_mw: float
    count: int
    percentage: float
    direction: Literal["underforecast", "neutral", "overforecast"]


class OverviewResponse(BaseModel):
    start_date: str
    end_date: str
    cutoff_time: str
    cutoff_days_before: int
    cutoff_rule_description: str
    data_mode: DataMode
    data_source_label: str
    last_refresh_utc: Optional[str] = None

    # Core statistical metrics (MW)
    mae_mw: Optional[float] = None
    rmse_mw: Optional[float] = None
    bias_mw: Optional[float] = None
    max_abs_error_mw: Optional[float] = None
    avg_forecast_mw: Optional[float] = None
    avg_actual_mw: Optional[float] = None

    # Sample size and completeness
    matched_periods: int
    total_expected_half_hour_periods: int
    total_expected_hourly_periods: int
    missing_or_excluded_records: int
    unmatched_actual_records: int
    completeness_pct: float
    hourly_completeness_pct: float

    # Directional bias counts
    overforecast_count: int
    underforecast_count: int
    exact_match_count: int
    overforecast_pct: float
    underforecast_pct: float
    avg_publication_age_hours: Optional[float] = None

    # Chart series
    time_series: list[TimeSeriesPoint]
    daily_metrics: list[DailyMetricPoint]
    error_distribution: list[ErrorDistributionBin]
    granularity_note: str


class ForecastRecordRow(BaseModel):
    start_time: str
    uk_local_time: str
    settlement_date: str
    settlement_period: int
    forecast_generation_mw: Optional[float] = None
    actual_generation_mw: Optional[float] = None
    signed_error_mw: Optional[float] = None
    abs_error_mw: Optional[float] = None
    publish_time: Optional[str] = None
    cutoff_time: str
    publication_age_hours: Optional[float] = None
    total_revisions: int = 0
    eligible_revisions: int = 0
    post_cutoff_revisions_excluded: int = 0
    status: Literal[
        "matched",
        "unmatched_actual_half_hour",
        "missing_forecast",
        "missing_actual",
        "missing_both",
    ]
    is_largest_error: bool = False


class ForecastsResponse(BaseModel):
    start_date: str
    end_date: str
    delivery_date: Optional[str] = None
    cutoff_time: str
    cutoff_days_before: int
    data_mode: DataMode
    last_refresh_utc: Optional[str] = None
    total_rows: int
    matched_rows: int
    unmatched_half_hour_rows: int
    summary_mae_mw: Optional[float] = None
    summary_rmse_mw: Optional[float] = None
    summary_bias_mw: Optional[float] = None
    summary_max_abs_error_mw: Optional[float] = None
    records: list[ForecastRecordRow]


class MetricExplanation(BaseModel):
    key: str
    name: str
    formula: str
    unit: str
    interpretation: str


class AccuracyResponse(BaseModel):
    start_date: str
    end_date: str
    cutoff_time: str
    cutoff_days_before: int
    data_mode: DataMode
    last_refresh_utc: Optional[str] = None

    # Overall metrics
    sample_size_n: int
    total_half_hour_slots: int
    total_hourly_forecast_slots: int
    missing_or_excluded_count: int
    unmatched_half_hour_actuals_count: int
    excluded_post_cutoff_publications_count: int

    mae_mw: Optional[float] = None
    rmse_mw: Optional[float] = None
    bias_mw: Optional[float] = None
    max_abs_error_mw: Optional[float] = None
    std_error_mw: Optional[float] = None
    median_error_mw: Optional[float] = None
    p90_abs_error_mw: Optional[float] = None
    avg_forecast_mw: Optional[float] = None
    avg_actual_mw: Optional[float] = None
    avg_publication_age_hours: Optional[float] = None

    overforecast_count: int
    underforecast_count: int
    exact_match_count: int
    overforecast_avg_mw: Optional[float] = None
    underforecast_avg_mw: Optional[float] = None

    daily_trends: list[DailyMetricPoint]
    error_distribution: list[ErrorDistributionBin]
    largest_overforecast_periods: list[ForecastRecordRow]
    largest_underforecast_periods: list[ForecastRecordRow]
    metric_explanations: list[MetricExplanation]


class PublicationVersionItem(BaseModel):
    publish_time: str
    publish_uk_local_time: str
    forecast_generation_mw: float
    lead_time_hours: float
    delta_from_cutoff_hours: float
    is_eligible_at_cutoff: bool
    is_selected_for_procurement: bool
    selection_status: Literal[
        "selected_at_cutoff",
        "eligible_superseded",
        "excluded_after_cutoff",
    ]
    revision_delta_mw: Optional[float] = None
    signed_error_vs_actual_mw: Optional[float] = None
    abs_error_vs_actual_mw: Optional[float] = None


class PublicationHistoryResponse(BaseModel):
    start_time: str
    uk_local_time: str
    settlement_date: str
    settlement_period: int
    cutoff_time: str
    cutoff_days_before: int
    decision_cutoff_timestamp: str
    data_mode: DataMode
    actual_generation_mw: Optional[float] = None
    selected_forecast: Optional[PublicationVersionItem] = None
    latest_overall_forecast: Optional[PublicationVersionItem] = None
    total_publications: int
    eligible_publications_count: int
    excluded_post_cutoff_count: int
    available_delivery_periods_for_date: list[str]
    publications: list[PublicationVersionItem]
    note: str


class DailyCompletenessRow(BaseModel):
    date: str
    expected_half_hour_periods: int
    actual_wind_records: int
    expected_hourly_forecast_periods: int
    distinct_forecast_periods: int
    matched_eligible_periods: int
    total_forecast_revisions: int
    completeness_hourly_pct: float


class DataQualityResponse(BaseModel):
    api_status: Literal["healthy", "degraded", "offline_cached", "sample_mode"]
    elexon_endpoint_fuelhh: str
    elexon_endpoint_windfor: str
    data_source: str
    data_mode: DataMode
    date_coverage_start: str
    date_coverage_end: str

    # Record counts & duplicates
    expected_half_hourly_periods: int
    expected_hourly_forecast_periods: int
    actual_records_raw: int
    actual_records_clean: int
    actual_duplicates_removed: int
    actual_malformed_dropped: int

    forecast_records_raw: int
    forecast_records_clean: int
    forecast_duplicates_removed: int
    forecast_malformed_dropped: int

    # Matching & completeness
    matched_periods: int
    missing_actual_periods: int
    missing_hourly_forecast_periods: int
    unmatched_half_hour_actuals: int
    unmatched_forecasts: int
    periods_without_eligible_cutoff_forecast: int
    excluded_post_cutoff_revisions_total: int

    # Cache & refresh metadata
    last_successful_refresh_utc: Optional[str] = None
    actuals_cache_age_seconds: Optional[float] = None
    forecasts_cache_age_seconds: Optional[float] = None
    cache_ttl_seconds: int
    using_fallback_cached_dataset: bool = False
    last_refresh_error: Optional[str] = None

    granularity_explanation: str
    warnings: list[str]
    daily_completeness: list[DailyCompletenessRow]


class RefreshRequest(BaseModel):
    data_mode: DataMode = Field(default="live")
    force: bool = Field(default=True)


class RefreshResponse(BaseModel):
    success: bool
    data_mode: DataMode
    refreshed_at_utc: str
    actual_records_loaded: int
    forecast_records_loaded: int
    message: str
    used_cached_fallback: bool = False
