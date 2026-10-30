from datetime import datetime, timezone
import math
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.models import ForecastRecordRow
from app.services.data_processor import (
    NormalizedForecastRecord,
    compute_uk_settlement_info,
    format_utc_iso,
    generate_expected_delivery_periods,
    normalize_datasets,
    parse_utc_timestamp,
)
from app.services.elexon_client import ElexonAPIError, ElexonClient
from app.services.forecast_selector import (
    compute_decision_cutoff_utc,
    select_forecast_at_cutoff,
)
from app.services.metrics import (
    calculate_error_distribution,
    calculate_summary_metrics,
)


def _make_forecast(start_iso: str, pub_iso: str, gen_mw: float) -> NormalizedForecastRecord:
    st_dt = parse_utc_timestamp(start_iso)
    pub_dt = parse_utc_timestamp(pub_iso)
    assert st_dt is not None and pub_dt is not None
    _, _, pub_uk = compute_uk_settlement_info(pub_dt)
    return NormalizedForecastRecord(
        start_time_utc=st_dt,
        start_time_iso=format_utc_iso(st_dt),
        publish_time_utc=pub_dt,
        publish_time_iso=format_utc_iso(pub_dt),
        publish_uk_local_str=pub_uk,
        generation_mw=gen_mw,
    )


def test_forecast_selection_at_decision_cutoff_and_post_cutoff_exclusion():
    """
    Verifies that select_forecast_at_cutoff:
    1. Selects the most recent forecast published at or before the cutoff.
    2. Excludes forecasts published after the cutoff from procurement selection.
    3. Retains the full chronological publication history and accurately computes publication age.
    """
    start_iso = "2026-01-15T12:00:00Z"
    settlement_date = "2026-01-15"

    # Decision cutoff: D-1 (2026-01-14) at 11:00 UK local time (11:00Z in winter)
    revisions = [
        _make_forecast(start_iso, "2026-01-13T22:30:00Z", 11080.0),  # Eligible (superseded)
        _make_forecast(start_iso, "2026-01-14T07:30:00Z", 11049.0),  # Eligible (superseded)
        _make_forecast(start_iso, "2026-01-14T09:30:00Z", 11178.0),  # Eligible & Latest <= 11:00Z -> SELECTED
        _make_forecast(start_iso, "2026-01-14T11:30:00Z", 11351.0),  # Excluded (30m after cutoff)
        _make_forecast(start_iso, "2026-01-15T09:30:00Z", 10503.0),  # Excluded (intraday revision)
    ]

    result = select_forecast_at_cutoff(
        start_time_iso=start_iso,
        settlement_date_str=settlement_date,
        revisions=revisions,
        cutoff_time_str="11:00",
        cutoff_days_before=1,
    )

    assert result.decision_cutoff_iso == "2026-01-14T11:00:00Z"
    assert result.selected_forecast is not None
    assert result.selected_forecast.publish_time_iso == "2026-01-14T09:30:00Z"
    assert result.selected_forecast.generation_mw == 11178.0
    assert result.publication_age_hours == 1.5
    assert result.total_revisions == 5
    assert result.eligible_revisions == 3
    assert result.excluded_post_cutoff_revisions == 2
    assert len(result.all_revisions_chronological) == 5


def test_forecast_selection_exact_boundary_and_all_post_cutoff():
    """
    Verifies inclusive boundary (publishTime == cutoff is eligible) and empty selection
    when all publications occur after the decision cutoff.
    """
    start_iso = "2026-01-10T18:00:00Z"
    revs_exact = [
        _make_forecast(start_iso, "2026-01-09T11:00:00Z", 9500.0),
        _make_forecast(start_iso, "2026-01-09T11:01:00Z", 9700.0),
    ]
    res_exact = select_forecast_at_cutoff(
        start_time_iso=start_iso,
        settlement_date_str="2026-01-10",
        revisions=revs_exact,
        cutoff_time_str="11:00",
        cutoff_days_before=1,
    )
    assert res_exact.selected_forecast is not None
    assert res_exact.selected_forecast.generation_mw == 9500.0
    assert res_exact.publication_age_hours == 0.0

    # If cutoff is set earlier than all publications (e.g. D-2 06:00)
    res_none = select_forecast_at_cutoff(
        start_time_iso=start_iso,
        settlement_date_str="2026-01-10",
        revisions=revs_exact,
        cutoff_time_str="06:00",
        cutoff_days_before=2,
    )
    assert res_none.selected_forecast is None
    assert res_none.eligible_revisions == 0
    assert res_none.excluded_post_cutoff_revisions == 2


def test_mae_rmse_bias_and_missing_records_handling():
    """
    Verifies MAE, RMSE, Bias, and directional counts on synthetic matched pairs,
    and ensures missing actual or forecast values are never coerced to zero.
    """
    # Pair 1: forecast=12000, actual=11000 -> error = +1000 (overforecast)
    # Pair 2: forecast=8000,  actual=8500  -> error = -500  (underforecast)
    # Pair 3: forecast=10000, actual=9700  -> error = +300  (overforecast)
    # Row 4:  forecast=None,  actual=9200  -> unmatched half-hour actual (must be excluded)
    # Row 5:  forecast=9500,  actual=None  -> missing actual (must be excluded)
    rows = [
        ForecastRecordRow(
            start_time="2026-01-05T00:00:00Z",
            uk_local_time="2026-01-05 00:00 GMT",
            settlement_date="2026-01-05",
            settlement_period=1,
            forecast_generation_mw=12000.0,
            actual_generation_mw=11000.0,
            signed_error_mw=1000.0,
            abs_error_mw=1000.0,
            publish_time="2026-01-04T09:30:00Z",
            cutoff_time="2026-01-04T11:00:00Z",
            publication_age_hours=1.5,
            status="matched",
        ),
        ForecastRecordRow(
            start_time="2026-01-05T01:00:00Z",
            uk_local_time="2026-01-05 01:00 GMT",
            settlement_date="2026-01-05",
            settlement_period=3,
            forecast_generation_mw=8000.0,
            actual_generation_mw=8500.0,
            signed_error_mw=-500.0,
            abs_error_mw=500.0,
            publish_time="2026-01-04T09:30:00Z",
            cutoff_time="2026-01-04T11:00:00Z",
            publication_age_hours=1.5,
            status="matched",
        ),
        ForecastRecordRow(
            start_time="2026-01-05T02:00:00Z",
            uk_local_time="2026-01-05 02:00 GMT",
            settlement_date="2026-01-05",
            settlement_period=5,
            forecast_generation_mw=10000.0,
            actual_generation_mw=9700.0,
            signed_error_mw=300.0,
            abs_error_mw=300.0,
            publish_time="2026-01-04T09:30:00Z",
            cutoff_time="2026-01-04T11:00:00Z",
            publication_age_hours=1.5,
            status="matched",
        ),
        ForecastRecordRow(
            start_time="2026-01-05T00:30:00Z",
            uk_local_time="2026-01-05 00:30 GMT",
            settlement_date="2026-01-05",
            settlement_period=2,
            forecast_generation_mw=None,
            actual_generation_mw=9200.0,
            signed_error_mw=None,
            abs_error_mw=None,
            publish_time=None,
            cutoff_time="2026-01-04T11:00:00Z",
            publication_age_hours=None,
            status="unmatched_actual_half_hour",
        ),
        ForecastRecordRow(
            start_time="2026-01-05T03:00:00Z",
            uk_local_time="2026-01-05 03:00 GMT",
            settlement_date="2026-01-05",
            settlement_period=7,
            forecast_generation_mw=9500.0,
            actual_generation_mw=None,
            signed_error_mw=None,
            abs_error_mw=None,
            publish_time="2026-01-04T09:30:00Z",
            cutoff_time="2026-01-04T11:00:00Z",
            publication_age_hours=1.5,
            status="missing_actual",
        ),
    ]

    summary = calculate_summary_metrics(rows)
    assert summary["matched_periods"] == 3
    # MAE = (1000 + 500 + 300) / 3 = 600.0
    assert summary["mae_mw"] == 600.0
    # Bias = (1000 - 500 + 300) / 3 = 266.67
    assert summary["bias_mw"] == 266.67
    # RMSE = sqrt((1000^2 + (-500)^2 + 300^2) / 3) = sqrt(1340000 / 3) = 668.33
    expected_rmse = round(math.sqrt((1000**2 + 500**2 + 300**2) / 3.0), 2)
    assert summary["rmse_mw"] == expected_rmse
    assert summary["max_abs_error_mw"] == 1000.0
    assert summary["overforecast_count"] == 2
    assert summary["underforecast_count"] == 1
    assert summary["exact_match_count"] == 0

    dist = calculate_error_distribution(rows)
    assert sum(b.count for b in dist) == 3


def test_duplicate_detection_and_fuel_type_filtering():
    """
    Verifies that normalize_datasets:
    - Filters FUELHH strictly to WIND (ignoring CCGT/NUCLEAR)
    - Deduplicates actuals by startTime (keeping the latest publishTime)
    - Deduplicates forecasts by (startTime, publishTime)
    - Rejects malformed records with missing or non-numeric generation
    """
    raw_actuals = [
        {
            "dataset": "FUELHH",
            "publishTime": "2026-01-02T00:05:00Z",
            "startTime": "2026-01-02T00:00:00Z",
            "settlementDate": "2026-01-02",
            "settlementPeriod": 1,
            "fuelType": "WIND",
            "generation": 12000,
        },
        # Duplicate startTime with newer publishTime -> should supersede 12000 with 12150
        {
            "dataset": "FUELHH",
            "publishTime": "2026-01-02T00:30:00Z",
            "startTime": "2026-01-02T00:00:00Z",
            "settlementDate": "2026-01-02",
            "settlementPeriod": 1,
            "fuelType": "WIND",
            "generation": 12150,
        },
        # Non-WIND record -> should be ignored
        {
            "dataset": "FUELHH",
            "publishTime": "2026-01-02T00:30:00Z",
            "startTime": "2026-01-02T00:00:00Z",
            "settlementDate": "2026-01-02",
            "settlementPeriod": 1,
            "fuelType": "CCGT",
            "generation": 14000,
        },
        # Malformed record (generation is None) -> should be dropped, never coerced to 0
        {
            "dataset": "FUELHH",
            "publishTime": "2026-01-02T01:00:00Z",
            "startTime": "2026-01-02T00:30:00Z",
            "settlementDate": "2026-01-02",
            "settlementPeriod": 2,
            "fuelType": "WIND",
            "generation": None,
        },
    ]

    raw_forecasts = [
        {
            "dataset": "WINDFOR",
            "publishTime": "2026-01-01T09:30:00Z",
            "startTime": "2026-01-02T00:00:00Z",
            "generation": 12400,
        },
        # Duplicate (startTime, publishTime)
        {
            "dataset": "WINDFOR",
            "publishTime": "2026-01-01T09:30:00Z",
            "startTime": "2026-01-02T00:00:00Z",
            "generation": 12450,
        },
        # Malformed forecast
        {
            "dataset": "WINDFOR",
            "publishTime": "invalid-timestamp",
            "startTime": "2026-01-02T01:00:00Z",
            "generation": 11000,
        },
    ]

    report = normalize_datasets(
        raw_actuals=raw_actuals,
        raw_forecasts=raw_forecasts,
        start_date_str="2026-01-02",
        end_date_str="2026-01-02",
    )

    assert report.actual_records_clean == 1
    assert report.actual_duplicates_removed == 1
    assert report.actual_malformed_dropped == 1
    assert report.actuals_By_start["2026-01-02T00:00:00Z"].generation_mw == 12150.0
    assert "2026-01-02T00:30:00Z" not in report.actuals_By_start

    assert report.forecast_records_clean == 1
    assert report.forecast_duplicates_removed == 1
    assert report.forecast_malformed_dropped == 1


def test_timestamp_normalization_and_uk_dst_edge_cases():
    """
    Verifies timestamp normalization across offsets and UK daylight-saving time transitions:
    - Winter standard day (2026-01-15): 48 half-hour periods
    - UK Spring Forward to BST (2026-03-29): 46 half-hour periods (23 hours)
    - UK Autumn Fallback to GMT (2026-10-25): 50 half-hour periods (25 hours)
    """
    dt_offset = parse_utc_timestamp("2026-01-15T13:00:00+01:00")
    assert dt_offset is not None
    assert format_utc_iso(dt_offset) == "2026-01-15T12:00:00Z"

    winter_day = generate_expected_delivery_periods("2026-01-15", "2026-01-15")
    assert len(winter_day) == 48
    assert winter_day[0]["settlement_period"] == 1
    assert winter_day[-1]["settlement_period"] == 48

    spring_dst_day = generate_expected_delivery_periods("2026-03-29", "2026-03-29")
    assert len(spring_dst_day) == 46
    assert spring_dst_day[-1]["settlement_period"] == 46

    autumn_dst_day = generate_expected_delivery_periods("2026-10-25", "2026-10-25")
    assert len(autumn_dst_day) == 50
    assert autumn_dst_day[-1]["settlement_period"] == 50

    # Verify cutoff calculation during BST converts UK local time to UTC (-1h)
    bst_cutoff = compute_decision_cutoff_utc("2026-06-15", "11:00", cutoff_days_before=1)
    assert format_utc_iso(bst_cutoff) == "2026-06-14T10:00:00Z"


@pytest.mark.asyncio
async def test_elexon_client_fallback_preserves_cached_dataset_on_failure(tmp_path):
    """
    Verifies that when a valid dataset is cached, a subsequent upstream API failure
    does not lose the last valid dataset and marks using_fallback_cache=True.
    """
    client = ElexonClient(
        base_url="http://127.0.0.1:9",  # Unreachable port to simulate network failure
        timeout_seconds=0.2,
        cache_dir=str(tmp_path),
    )

    # First, with no cache, it should raise ElexonAPIError
    with pytest.raises(ElexonAPIError):
        await client.fetch_live_january_2026(force_refresh=True)

    # Seed valid cache
    sample_act, sample_for, _ = client.get_sample_january_2026()
    client._live_actuals = sample_act[:48]
    client._live_forecasts = sample_for[:96]
    client._actuals_fetched_at = 1000.0
    client._forecasts_fetched_at = 1000.0
    client._last_refresh_utc = "2026-01-31T12:00:00Z"

    # Now force refresh against unreachable upstream -> should preserve cached dataset
    act, fore, meta = await client.fetch_live_january_2026(force_refresh=True)
    assert len(act) == 48
    assert len(fore) == 96
    assert meta["using_fallback_cache"] is True
    assert meta["last_refresh_error"] is not None


def test_rest_api_endpoints_and_schema_validation():
    """
    Tests all REST API endpoints using FastAPI TestClient in deterministic 'sample' mode
    so unit tests do not depend on an external network connection.
    """
    client = TestClient(app)

    # 1. GET /api/health
    r_health = client.get("/api/health")
    assert r_health.status_code == 200
    assert r_health.json()["status"] == "ok"

    # 2. GET /api/overview
    r_ov = client.get(
        "/api/overview",
        params={
            "start_date": "2026-01-01",
            "end_date": "2026-01-03",
            "cutoff_time": "11:00",
            "cutoff_days_before": 1,
            "data_mode": "sample",
        },
    )
    assert r_ov.status_code == 200
    ov_data = r_ov.json()
    assert ov_data["data_mode"] == "sample"
    assert ov_data["matched_periods"] == 72  # 3 days * 24 hourly forecasts
    assert ov_data["total_expected_half_hour_periods"] == 144  # 3 days * 48 half-hours
    assert ov_data["mae_mw"] > 0

    # 3. GET /api/forecasts
    r_fc = client.get(
        "/api/forecasts",
        params={
            "delivery_date": "2026-01-15",
            "cutoff_time": "11:00",
            "cutoff_days_before": 1,
            "data_mode": "sample",
        },
    )
    assert r_fc.status_code == 200
    fc_data = r_fc.json()
    assert fc_data["total_rows"] == 48
    assert fc_data["matched_rows"] == 24
    assert fc_data["unmatched_half_hour_rows"] == 24

    # 4. GET /api/accuracy
    r_acc = client.get(
        "/api/accuracy",
        params={
            "start_date": "2026-01-01",
            "end_date": "2026-01-07",
            "data_mode": "sample",
        },
    )
    assert r_acc.status_code == 200
    acc_data = r_acc.json()
    assert acc_data["sample_size_n"] == 168
    assert len(acc_data["metric_explanations"]) >= 4

    # 5. GET /api/forecasts/{start_time}/history
    r_hist = client.get(
        "/api/forecasts/2026-01-15T12:00:00Z/history",
        params={"cutoff_time": "11:00", "cutoff_days_before": 1, "data_mode": "sample"},
    )
    assert r_hist.status_code == 200
    hist_data = r_hist.json()
    assert hist_data["start_time"] == "2026-01-15T12:00:00Z"
    assert hist_data["total_publications"] > 0
    assert hist_data["selected_forecast"] is not None
    assert hist_data["excluded_post_cutoff_count"] > 0

    # 6. GET /api/data-quality
    r_dq = client.get(
        "/api/data-quality",
        params={"start_date": "2026-01-01", "end_date": "2026-01-05", "data_mode": "sample"},
    )
    assert r_dq.status_code == 200
    dq_data = r_dq.json()
    assert dq_data["api_status"] == "sample_mode"
    assert dq_data["expected_half_hourly_periods"] == 240

    # 7. Validation error on out-of-scope date (e.g. February 2026)
    r_bad = client.get("/api/overview", params={"start_date": "2026-02-01", "end_date": "2026-02-05"})
    assert r_bad.status_code == 400
