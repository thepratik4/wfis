from dataclasses import dataclass
from datetime import date, datetime, time as dt_time, timedelta, timezone
from typing import Optional

from app.services.data_processor import (
    NormalizedForecastRecord,
    UK_TZ,
    format_utc_iso,
)


@dataclass(frozen=True)
class SelectedForecastResult:
    start_time_iso: str
    decision_cutoff_utc: datetime
    decision_cutoff_iso: str
    selected_forecast: Optional[NormalizedForecastRecord]
    publication_age_hours: Optional[float]
    total_revisions: int
    eligible_revisions: int
    excluded_post_cutoff_revisions: int
    all_revisions_chronological: list[NormalizedForecastRecord]


def parse_cutoff_time_str(cutoff_time_str: str) -> dt_time:
    """
    Parses a 'HH:MM' cutoff time string (e.g. '11:00', '18:00', '23:59').
    Raises ValueError if invalid.
    """
    cleaned = cutoff_time_str.strip()
    parts = cleaned.split(":")
    if len(parts) not in (2, 3):
        raise ValueError(
            f"Invalid cutoff_time '{cutoff_time_str}'. Expected HH:MM in 24-hour format."
        )
    hour = int(parts[0])
    minute = int(parts[1])
    second = int(parts[2]) if len(parts) == 3 else 0
    return dt_time(hour=hour, minute=minute, second=second)


def compute_decision_cutoff_utc(
    settlement_date_str: str,
    cutoff_time_str: str = "11:00",
    cutoff_days_before: int = 1,
) -> datetime:
    """
    Computes the exact UTC timestamp for the day-ahead purchasing decision cutoff
    for a given UK delivery settlement date.

    Example:
    - Delivery settlement date: 2026-01-15
    - cutoff_days_before: 1 (D-1)
    - cutoff_time_str: '11:00' (UK local time, Europe/London)
    -> Decision cutoff is 2026-01-14 11:00 Europe/London converted to UTC.
    """
    if cutoff_days_before < 0 or cutoff_days_before > 7:
        raise ValueError("cutoff_days_before must be between 0 and 7 days.")

    delivery_date = date.fromisoformat(settlement_date_str)
    cutoff_date = delivery_date - timedelta(days=cutoff_days_before)
    cutoff_clock = parse_cutoff_time_str(cutoff_time_str)

    local_cutoff = datetime.combine(cutoff_date, cutoff_clock, tzinfo=UK_TZ)
    return local_cutoff.astimezone(timezone.utc)


def select_forecast_at_cutoff(
    start_time_iso: str,
    settlement_date_str: str,
    revisions: list[NormalizedForecastRecord],
    cutoff_time_str: str = "11:00",
    cutoff_days_before: int = 1,
) -> SelectedForecastResult:
    """
    Implements the historical forecast selection business rule:
    1. Identifies all available forecast publications for the delivery period.
    2. Applies the explicit day-ahead decision cutoff.
    3. Selects the most recent eligible forecast published at or before that cutoff (publishTime <= cutoff).
    4. Records the selected forecast's publishTime and publication age at the cutoff.
    5. Excludes post-cutoff forecasts (publishTime > cutoff) from procurement accuracy analysis.
    6. Retains the full chronological publication history for inspection.
    """
    cutoff_utc = compute_decision_cutoff_utc(
        settlement_date_str=settlement_date_str,
        cutoff_time_str=cutoff_time_str,
        cutoff_days_before=cutoff_days_before,
    )
    cutoff_iso = format_utc_iso(cutoff_utc)

    sorted_revs = sorted(revisions, key=lambda r: r.publish_time_utc)
    eligible = [r for r in sorted_revs if r.publish_time_utc <= cutoff_utc]
    excluded = [r for r in sorted_revs if r.publish_time_utc > cutoff_utc]

    selected = eligible[-1] if eligible else None
    pub_age_hours: Optional[float] = None
    if selected is not None:
        delta_sec = (cutoff_utc - selected.publish_time_utc).total_seconds()
        pub_age_hours = round(delta_sec / 3600.0, 2)

    return SelectedForecastResult(
        start_time_iso=start_time_iso,
        decision_cutoff_utc=cutoff_utc,
        decision_cutoff_iso=cutoff_iso,
        selected_forecast=selected,
        publication_age_hours=pub_age_hours,
        total_revisions=len(sorted_revs),
        eligible_revisions=len(eligible),
        excluded_post_cutoff_revisions=len(excluded),
        all_revisions_chronological=sorted_revs,
    )
