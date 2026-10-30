from typing import Any, Optional
import numpy as np
import pandas as pd

from app.schemas.models import (
    DailyMetricPoint,
    ErrorDistributionBin,
    ForecastRecordRow,
    MetricExplanation,
)


ERROR_BINS: list[tuple[str, float, float, str]] = [
    ("< -2,000 MW", -float("inf"), -2000.0, "underforecast"),
    ("-2,000 to -1,000 MW", -2000.0, -1000.0, "underforecast"),
    ("-1,000 to -500 MW", -1000.0, -500.0, "underforecast"),
    ("-500 to 0 MW", -500.0, 0.0, "underforecast"),
    ("0 to +500 MW", 0.0, 500.0, "overforecast"),
    ("+500 to +1,000 MW", 500.0, 1000.0, "overforecast"),
    ("+1,000 to +2,000 MW", 1000.0, 2000.0, "overforecast"),
    ("> +2,000 MW", 2000.0, float("inf"), "overforecast"),
]


def get_metric_explanations() -> list[MetricExplanation]:
    return [
        MetricExplanation(
            key="mae",
            name="Mean Absolute Error (MAE)",
            formula="MAE = mean(|forecast - actual|)",
            unit="MW",
            interpretation=(
                "Average magnitude of forecast deviation from actual generation in MW across matched delivery periods, "
                "regardless of error direction. Never expressed as a percentage because wind output can approach zero."
            ),
        ),
        MetricExplanation(
            key="rmse",
            name="Root Mean Squared Error (RMSE)",
            formula="RMSE = sqrt(mean((forecast - actual)^2))",
            unit="MW",
            interpretation=(
                "Penalizes large tail errors more heavily than MAE. Critical for wholesale electricity procurement "
                "because extreme wind forecast misses drive disproportionate imbalance settlement exposure."
            ),
        ),
        MetricExplanation(
            key="bias",
            name="Mean Forecast Error (Bias)",
            formula="Bias = mean(forecast - actual)",
            unit="MW",
            interpretation=(
                "Signed average error. Positive values (+MW) indicate systematic overforecasting (utility risks under-procuring "
                "in the day-ahead market); negative values (-MW) indicate systematic underforecasting."
            ),
        ),
        MetricExplanation(
            key="max_abs_error",
            name="Maximum Absolute Error",
            formula="Max |Error| = max(|forecast - actual|)",
            unit="MW",
            interpretation=(
                "Worst single delivery-period forecast miss in the selected analysis window."
            ),
        ),
        MetricExplanation(
            key="publication_age",
            name="Forecast Publication Age at Cutoff",
            formula="Age = decision_cutoff_time - selected_publish_time",
            unit="Hours",
            interpretation=(
                "Elapsed time between the selected forecast's publication timestamp and the day-ahead purchasing decision cutoff."
            ),
        ),
    ]


def calculate_summary_metrics(rows: list[ForecastRecordRow]) -> dict[str, Any]:
    """
    Computes core forecast accuracy metrics strictly over valid matched forecast-actual pairs
    using Pandas and NumPy. Missing values are explicitly excluded and never coerced to zero.
    """
    matched_data = [
        {
            "start_time": r.start_time,
            "settlement_date": r.settlement_date,
            "forecast": r.forecast_generation_mw,
            "actual": r.actual_generation_mw,
            "pub_age": r.publication_age_hours,
        }
        for r in rows
        if r.forecast_generation_mw is not None and r.actual_generation_mw is not None
    ]

    if not matched_data:
        return {
            "matched_periods": 0,
            "mae_mw": None,
            "rmse_mw": None,
            "bias_mw": None,
            "max_abs_error_mw": None,
            "std_error_mw": None,
            "median_error_mw": None,
            "p90_abs_error_mw": None,
            "avg_forecast_mw": None,
            "avg_actual_mw": None,
            "avg_publication_age_hours": None,
            "overforecast_count": 0,
            "underforecast_count": 0,
            "exact_match_count": 0,
            "overforecast_pct": 0.0,
            "underforecast_pct": 0.0,
            "overforecast_avg_mw": None,
            "underforecast_avg_mw": None,
        }

    df = pd.DataFrame(matched_data)
    forecast_arr = df["forecast"].to_numpy(dtype=np.float64)
    actual_arr = df["actual"].to_numpy(dtype=np.float64)

    # Core error definition: error = forecast_generation - actual_generation
    signed_errors = forecast_arr - actual_arr
    abs_errors = np.abs(signed_errors)

    n = int(len(signed_errors))
    mae = float(np.mean(abs_errors))
    rmse = float(np.sqrt(np.mean(np.square(signed_errors))))
    bias = float(np.mean(signed_errors))
    max_abs = float(np.max(abs_errors))
    std_err = float(np.std(signed_errors, ddof=0))
    median_err = float(np.median(signed_errors))
    p90_abs = float(np.percentile(abs_errors, 90))
    avg_forecast = float(np.mean(forecast_arr))
    avg_actual = float(np.mean(actual_arr))

    over_mask = signed_errors > 0
    under_mask = signed_errors < 0
    exact_mask = signed_errors == 0

    over_count = int(np.sum(over_mask))
    under_count = int(np.sum(under_mask))
    exact_count = int(np.sum(exact_mask))

    over_avg = float(np.mean(signed_errors[over_mask])) if over_count > 0 else None
    under_avg = float(np.mean(signed_errors[under_mask])) if under_count > 0 else None

    valid_ages = df["pub_age"].dropna().to_numpy(dtype=np.float64)
    avg_pub_age = float(np.mean(valid_ages)) if len(valid_ages) > 0 else None

    return {
        "matched_periods": n,
        "mae_mw": round(mae, 2),
        "rmse_mw": round(rmse, 2),
        "bias_mw": round(bias, 2),
        "max_abs_error_mw": round(max_abs, 2),
        "std_error_mw": round(std_err, 2),
        "median_error_mw": round(median_err, 2),
        "p90_abs_error_mw": round(p90_abs, 2),
        "avg_forecast_mw": round(avg_forecast, 2),
        "avg_actual_mw": round(avg_actual, 2),
        "avg_publication_age_hours": round(avg_pub_age, 2)
        if avg_pub_age is not None
        else None,
        "overforecast_count": over_count,
        "underforecast_count": under_count,
        "exact_match_count": exact_count,
        "overforecast_pct": round((over_count / n) * 100.0, 1) if n > 0 else 0.0,
        "underforecast_pct": round((under_count / n) * 100.0, 1) if n > 0 else 0.0,
        "overforecast_avg_mw": round(over_avg, 2) if over_avg is not None else None,
        "underforecast_avg_mw": round(under_avg, 2) if under_avg is not None else None,
    }


def calculate_daily_metrics(
    rows: list[ForecastRecordRow],
    expected_by_date: dict[str, tuple[int, int]],
) -> list[DailyMetricPoint]:
    """
    Calculates daily MAE, RMSE, Bias, and matched counts for each settlement date.
    expected_by_date maps date -> (expected_half_hour_periods, expected_hourly_periods).
    """
    rows_by_date: dict[str, list[ForecastRecordRow]] = {}
    for r in rows:
        rows_by_date.setdefault(r.settlement_date, []).append(r)

    all_dates = sorted(set(expected_by_date.keys()) | set(rows_by_date.keys()))
    daily_points: list[DailyMetricPoint] = []

    for d_str in all_dates:
        d_rows = rows_by_date.get(d_str, [])
        exp_hh, exp_hr = expected_by_date.get(d_str, (len(d_rows), len(d_rows) // 2))
        summary = calculate_summary_metrics(d_rows)

        daily_points.append(
            DailyMetricPoint(
                date=d_str,
                matched_periods=summary["matched_periods"],
                expected_half_hour_periods=exp_hh,
                expected_hourly_periods=exp_hr,
                mae_mw=summary["mae_mw"],
                rmse_mw=summary["rmse_mw"],
                bias_mw=summary["bias_mw"],
                max_abs_error_mw=summary["max_abs_error_mw"],
                avg_forecast_mw=summary["avg_forecast_mw"],
                avg_actual_mw=summary["avg_actual_mw"],
                overforecast_count=summary["overforecast_count"],
                underforecast_count=summary["underforecast_count"],
            )
        )

    return daily_points


def calculate_error_distribution(
    rows: list[ForecastRecordRow],
) -> list[ErrorDistributionBin]:
    """
    Groups signed forecast errors (forecast - actual) into histogram bins.
    """
    errors = [
        r.signed_error_mw
        for r in rows
        if r.signed_error_mw is not None
    ]
    total = len(errors)
    arr = np.array(errors, dtype=np.float64) if total > 0 else np.array([], dtype=np.float64)

    bins_out: list[ErrorDistributionBin] = []
    for label, low, high, direction in ERROR_BINS:
        if total == 0:
            count = 0
        elif low == -float("inf"):
            count = int(np.sum(arr < high))
        elif high == float("inf"):
            count = int(np.sum(arr >= low))
        else:
            count = int(np.sum((arr >= low) & (arr < high)))

        pct = round((count / total) * 100.0, 1) if total > 0 else 0.0
        bins_out.append(
            ErrorDistributionBin(
                bin_label=label,
                min_mw=-3500.0 if low == -float("inf") else low,
                max_mw=3500.0 if high == float("inf") else high,
                count=count,
                percentage=pct,
                direction=direction,  # type: ignore[arg-type]
            )
        )

    return bins_out
