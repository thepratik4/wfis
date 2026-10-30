export type DataMode = "live" | "sample";

export type NavSection =
  | "overview"
  | "explorer"
  | "accuracy"
  | "history"
  | "quality";

export interface GlobalFilterState {
  scopeMode: "range" | "single_day";
  startDate: string;
  endDate: string;
  deliveryDate: string;
  cutoffTime: string;
  cutoffDaysBefore: number;
  dataMode: DataMode;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  python_version: string;
  elexon_base_url: string;
  default_cutoff_time: string;
  default_cutoff_days_before: number;
  last_refresh_utc: string | null;
  active_data_mode: DataMode;
}

export interface TimeSeriesPoint {
  start_time: string;
  uk_local_time: string;
  settlement_date: string;
  settlement_period: number;
  forecast_generation_mw: number | null;
  actual_generation_mw: number | null;
  signed_error_mw: number | null;
  abs_error_mw: number | null;
  publish_time: string | null;
  cutoff_time: string;
  publication_age_hours: number | null;
}

export interface DailyMetricPoint {
  date: string;
  matched_periods: number;
  expected_half_hour_periods: number;
  expected_hourly_periods: number;
  mae_mw: number | null;
  rmse_mw: number | null;
  bias_mw: number | null;
  max_abs_error_mw: number | null;
  avg_forecast_mw: number | null;
  avg_actual_mw: number | null;
  overforecast_count: number;
  underforecast_count: number;
}

export interface ErrorDistributionBin {
  bin_label: string;
  min_mw: number;
  max_mw: number;
  count: number;
  percentage: number;
  direction: "underforecast" | "neutral" | "overforecast";
}

export interface OverviewResponse {
  start_date: string;
  end_date: string;
  cutoff_time: string;
  cutoff_days_before: number;
  cutoff_rule_description: string;
  data_mode: DataMode;
  data_source_label: string;
  last_refresh_utc: string | null;
  mae_mw: number | null;
  rmse_mw: number | null;
  bias_mw: number | null;
  max_abs_error_mw: number | null;
  avg_forecast_mw: number | null;
  avg_actual_mw: number | null;
  matched_periods: number;
  total_expected_half_hour_periods: number;
  total_expected_hourly_periods: number;
  missing_or_excluded_records: number;
  unmatched_actual_records: number;
  completeness_pct: number;
  hourly_completeness_pct: number;
  overforecast_count: number;
  underforecast_count: number;
  exact_match_count: number;
  overforecast_pct: number;
  underforecast_pct: number;
  avg_publication_age_hours: number | null;
  time_series: TimeSeriesPoint[];
  daily_metrics: DailyMetricPoint[];
  error_distribution: ErrorDistributionBin[];
  granularity_note: string;
}

export interface ForecastRecordRow {
  start_time: string;
  uk_local_time: string;
  settlement_date: string;
  settlement_period: number;
  forecast_generation_mw: number | null;
  actual_generation_mw: number | null;
  signed_error_mw: number | null;
  abs_error_mw: number | null;
  publish_time: string | null;
  cutoff_time: string;
  publication_age_hours: number | null;
  total_revisions: number;
  eligible_revisions: number;
  post_cutoff_revisions_excluded: number;
  status:
    | "matched"
    | "unmatched_actual_half_hour"
    | "missing_forecast"
    | "missing_actual"
    | "missing_both";
  is_largest_error: boolean;
}

export interface ForecastsResponse {
  start_date: string;
  end_date: string;
  delivery_date: string | null;
  cutoff_time: string;
  cutoff_days_before: number;
  data_mode: DataMode;
  last_refresh_utc: string | null;
  total_rows: number;
  matched_rows: number;
  unmatched_half_hour_rows: number;
  summary_mae_mw: number | null;
  summary_rmse_mw: number | null;
  summary_bias_mw: number | null;
  summary_max_abs_error_mw: number | null;
  records: ForecastRecordRow[];
}

export interface MetricExplanation {
  key: string;
  name: string;
  formula: string;
  unit: string;
  interpretation: string;
}

export interface AccuracyResponse {
  start_date: string;
  end_date: string;
  cutoff_time: string;
  cutoff_days_before: number;
  data_mode: DataMode;
  last_refresh_utc: string | null;
  sample_size_n: number;
  total_half_hour_slots: number;
  total_hourly_forecast_slots: number;
  missing_or_excluded_count: number;
  unmatched_half_hour_actuals_count: number;
  excluded_post_cutoff_publications_count: number;
  mae_mw: number | null;
  rmse_mw: number | null;
  bias_mw: number | null;
  max_abs_error_mw: number | null;
  std_error_mw: number | null;
  median_error_mw: number | null;
  p90_abs_error_mw: number | null;
  avg_forecast_mw: number | null;
  avg_actual_mw: number | null;
  avg_publication_age_hours: number | null;
  overforecast_count: number;
  underforecast_count: number;
  exact_match_count: number;
  overforecast_avg_mw: number | null;
  underforecast_avg_mw: number | null;
  daily_trends: DailyMetricPoint[];
  error_distribution: ErrorDistributionBin[];
  largest_overforecast_periods: ForecastRecordRow[];
  largest_underforecast_periods: ForecastRecordRow[];
  metric_explanations: MetricExplanation[];
}

export interface PublicationVersionItem {
  publish_time: string;
  publish_uk_local_time: string;
  forecast_generation_mw: number;
  lead_time_hours: number;
  delta_from_cutoff_hours: number;
  is_eligible_at_cutoff: boolean;
  is_selected_for_procurement: boolean;
  selection_status:
    | "selected_at_cutoff"
    | "eligible_superseded"
    | "excluded_after_cutoff";
  revision_delta_mw: number | null;
  signed_error_vs_actual_mw: number | null;
  abs_error_vs_actual_mw: number | null;
}

export interface PublicationHistoryResponse {
  start_time: string;
  uk_local_time: string;
  settlement_date: string;
  settlement_period: number;
  cutoff_time: string;
  cutoff_days_before: number;
  decision_cutoff_timestamp: string;
  data_mode: DataMode;
  actual_generation_mw: number | null;
  selected_forecast: PublicationVersionItem | null;
  latest_overall_forecast: PublicationVersionItem | null;
  total_publications: number;
  eligible_publications_count: number;
  excluded_post_cutoff_count: number;
  available_delivery_periods_for_date: string[];
  publications: PublicationVersionItem[];
  note: string;
}

export interface DailyCompletenessRow {
  date: string;
  expected_half_hour_periods: number;
  actual_wind_records: number;
  expected_hourly_forecast_periods: number;
  distinct_forecast_periods: number;
  matched_eligible_periods: number;
  total_forecast_revisions: number;
  completeness_hourly_pct: number;
}

export interface DataQualityResponse {
  api_status: "healthy" | "degraded" | "offline_cached" | "sample_mode";
  elexon_endpoint_fuelhh: string;
  elexon_endpoint_windfor: string;
  data_source: string;
  data_mode: DataMode;
  date_coverage_start: string;
  date_coverage_end: string;
  expected_half_hourly_periods: number;
  expected_hourly_forecast_periods: number;
  actual_records_raw: number;
  actual_records_clean: number;
  actual_duplicates_removed: number;
  actual_malformed_dropped: number;
  forecast_records_raw: number;
  forecast_records_clean: number;
  forecast_duplicates_removed: number;
  forecast_malformed_dropped: number;
  matched_periods: number;
  missing_actual_periods: number;
  missing_hourly_forecast_periods: number;
  unmatched_half_hour_actuals: number;
  unmatched_forecasts: number;
  periods_without_eligible_cutoff_forecast: number;
  excluded_post_cutoff_revisions_total: number;
  last_successful_refresh_utc: string | null;
  actuals_cache_age_seconds: number | null;
  forecasts_cache_age_seconds: number | null;
  cache_ttl_seconds: number;
  using_fallback_cached_dataset: boolean;
  last_refresh_error: string | null;
  granularity_explanation: string;
  warnings: string[];
  daily_completeness: DailyCompletenessRow[];
}

export interface RefreshResponse {
  success: boolean;
  data_mode: DataMode;
  refreshed_at_utc: string;
  actual_records_loaded: number;
  forecast_records_loaded: number;
  message: string;
  used_cached_fallback: boolean;
}
