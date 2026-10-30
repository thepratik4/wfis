from dataclasses import dataclass
from datetime import date, datetime, time as dt_time, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

UK_TZ = ZoneInfo("Europe/London")


@dataclass(frozen=True)
class NormalizedActualRecord:
    start_time_utc: datetime
    start_time_iso: str
    uk_local_time_str: str
    settlement_date: str
    settlement_period: int
    publish_time_iso: Optional[str]
    generation_mw: float


@dataclass(frozen=True)
class NormalizedForecastRecord:
    start_time_utc: datetime
    start_time_iso: str
    publish_time_utc: datetime
    publish_time_iso: str
    publish_uk_local_str: str
    generation_mw: float


@dataclass
class NormalizationReport:
    actuals_By_start: dict[str, NormalizedActualRecord]
    forecasts_by_start: dict[str, list[NormalizedForecastRecord]]
    actual_records_raw: int
    actual_records_clean: int
    actual_duplicates_removed: int
    actual_malformed_dropped: int
    forecast_records_raw: int
    forecast_records_clean: int
    forecast_duplicates_removed: int
    forecast_malformed_dropped: int


def parse_utc_timestamp(raw_value: Any) -> Optional[datetime]:
    """
    Parses an ISO-8601 timestamp string or datetime into an unambiguous timezone-aware UTC datetime.
    """
    if raw_value is None:
        return None
    if isinstance(raw_value, datetime):
        dt = raw_value
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    if not isinstance(raw_value, str):
        return None

    text = raw_value.strip()
    if not text:
        return None

    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt
    except ValueError:
        return None


def format_utc_iso(dt: datetime) -> str:
    """Formats a datetime to canonical UTC ISO-8601 string with Z suffix."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def compute_uk_settlement_info(utc_dt: datetime) -> tuple[str, int, str]:
    """
    Converts a UTC delivery period start timestamp into UK local time (Europe/London),
    correctly accounting for GMT/BST daylight-saving transitions.
    Returns (settlement_date_str, settlement_period_1_indexed, uk_local_display_str).
    """
    utc_norm = utc_dt.astimezone(timezone.utc)
    uk_dt = utc_norm.astimezone(UK_TZ)
    settlement_date_str = uk_dt.strftime("%Y-%m-%d")

    # Compute exact 30-minute settlement period index from 00:00 UK local time on that calendar date
    uk_midnight = datetime.combine(uk_dt.date(), dt_time(0, 0), tzinfo=UK_TZ)
    elapsed_seconds = (uk_norm_utc := utc_norm) - uk_midnight.astimezone(timezone.utc)
    settlement_period = int(round(elapsed_seconds.total_seconds() // 1800)) + 1

    tz_abbr = uk_dt.tzname() or "GMT"
    uk_display = f"{uk_dt.strftime('%Y-%m-%d %H:%M')} {tz_abbr}"
    return settlement_date_str, settlement_period, uk_display


def generate_expected_delivery_periods(
    start_date_str: str, end_date_str: str
) -> list[dict[str, Any]]:
    """
    Derives all expected half-hourly delivery periods for the given UK settlement date range
    directly from UK local timezone rules (Europe/London), rather than blindly assuming 48 periods.
    - Standard winter/summer day: 48 half-hour periods (24 hourly :00 periods)
    - Spring forward DST transition day: 46 half-hour periods (23 hourly :00 periods)
    - Autumn fallback DST transition day: 50 half-hour periods (25 hourly :00 periods)
    """
    start_d = date.fromisoformat(start_date_str)
    end_d = date.fromisoformat(end_date_str)
    if end_d < start_d:
        return []

    uk_start_midnight = datetime.combine(start_d, dt_time(0, 0), tzinfo=UK_TZ)
    uk_end_next_midnight = datetime.combine(
        end_d + timedelta(days=1), dt_time(0, 0), tzinfo=UK_TZ
    )

    cur_utc = uk_start_midnight.astimezone(timezone.utc)
    end_utc = uk_end_next_midnight.astimezone(timezone.utc)

    periods: list[dict[str, Any]] = []
    while cur_utc < end_utc:
        s_date, s_period, uk_str = compute_uk_settlement_info(cur_utc)
        periods.append(
            {
                "start_time_utc": cur_utc,
                "start_time_iso": format_utc_iso(cur_utc),
                "uk_local_time": uk_str,
                "settlement_date": s_date,
                "settlement_period": s_period,
                "is_hourly_boundary": cur_utc.minute == 0,
            }
        )
        cur_utc += timedelta(minutes=30)

    return periods


def normalize_datasets(
    raw_actuals: list[dict[str, Any]],
    raw_forecasts: list[dict[str, Any]],
    start_date_str: str = "2026-01-01",
    end_date_str: str = "2026-01-31",
) -> NormalizationReport:
    """
    Normalizes and deduplicates raw Elexon FUELHH actual records and WINDFOR forecast publications.
    - Filters FUELHH strictly to fuelType == 'WIND'
    - Validates numeric generation values (never coerces missing/None to 0)
    - Deduplicates actuals by startTime (retaining latest publishTime)
    - Deduplicates forecasts by (startTime, publishTime)
    - Filters delivery startTime to the requested UK settlement date window
    """
    expected_periods = generate_expected_delivery_periods(start_date_str, end_date_str)
    valid_start_isos = {p["start_time_iso"] for p in expected_periods}

    # 1. Process Actuals (FUELHH)
    actual_raw_count = len(raw_actuals)
    actual_duplicates = 0
    actual_malformed = 0
    actuals_map: dict[str, tuple[Optional[datetime], NormalizedActualRecord]] = {}

    for row in raw_actuals:
        if not isinstance(row, dict):
            actual_malformed += 1
            continue

        fuel_type = str(row.get("fuelType", "")).strip().upper()
        if fuel_type != "WIND":
            # Ignore non-WIND fuel types
            continue

        st_dt = parse_utc_timestamp(row.get("startTime"))
        gen_raw = row.get("generation")
        if st_dt is None or gen_raw is None or isinstance(gen_raw, bool):
            actual_malformed += 1
            continue

        try:
            gen_mw = float(gen_raw)
            if gen_mw != gen_mw:  # NaN check
                actual_malformed += 1
                continue
        except (ValueError, TypeError):
            actual_malformed += 1
            continue

        st_iso = format_utc_iso(st_dt)
        if st_iso not in valid_start_isos:
            continue

        pub_dt = parse_utc_timestamp(row.get("publishTime"))
        pub_iso = format_utc_iso(pub_dt) if pub_dt else None
        s_date, s_period, uk_str = compute_uk_settlement_info(st_dt)

        # Prefer Elexon's settlementPeriod if present and valid, fallback to computed
        raw_sp = row.get("settlementPeriod")
        if isinstance(raw_sp, int) and 1 <= raw_sp <= 50:
            s_period = raw_sp

        record = NormalizedActualRecord(
            start_time_utc=st_dt,
            start_time_iso=st_iso,
            uk_local_time_str=uk_str,
            settlement_date=s_date,
            settlement_period=s_period,
            publish_time_iso=pub_iso,
            generation_mw=gen_mw,
        )

        if st_iso in actuals_map:
            actual_duplicates += 1
            prev_pub_dt, _ = actuals_map[st_iso]
            # Keep record with latest publishTime
            if pub_dt and (prev_pub_dt is None or pub_dt >= prev_pub_dt):
                actuals_map[st_iso] = (pub_dt, record)
        else:
            actuals_map[st_iso] = (pub_dt, record)

    clean_actuals = {k: v[1] for k, v in actuals_map.items()}

    # 2. Process Forecasts (WINDFOR)
    forecast_raw_count = len(raw_forecasts)
    forecast_duplicates = 0
    forecast_malformed = 0
    forecast_pair_map: dict[tuple[str, str], NormalizedForecastRecord] = {}

    for row in raw_forecasts:
        if not isinstance(row, dict):
            forecast_malformed += 1
            continue

        st_dt = parse_utc_timestamp(row.get("startTime"))
        pub_dt = parse_utc_timestamp(row.get("publishTime"))
        gen_raw = row.get("generation")

        if st_dt is None or pub_dt is None or gen_raw is None or isinstance(gen_raw, bool):
            forecast_malformed += 1
            continue

        try:
            gen_mw = float(gen_raw)
            if gen_mw != gen_mw:
                forecast_malformed += 1
                continue
        except (ValueError, TypeError):
            forecast_malformed += 1
            continue

        st_iso = format_utc_iso(st_dt)
        if st_iso not in valid_start_isos:
            continue

        pub_iso = format_utc_iso(pub_dt)
        _, _, pub_uk_str = compute_uk_settlement_info(pub_dt)

        f_record = NormalizedForecastRecord(
            start_time_utc=st_dt,
            start_time_iso=st_iso,
            publish_time_utc=pub_dt,
            publish_time_iso=pub_iso,
            publish_uk_local_str=pub_uk_str,
            generation_mw=gen_mw,
        )

        key = (st_iso, pub_iso)
        if key in forecast_pair_map:
            forecast_duplicates += 1
        forecast_pair_map[key] = f_record

    forecasts_by_start: dict[str, list[NormalizedForecastRecord]] = {}
    for f_rec in forecast_pair_map.values():
        forecasts_by_start.setdefault(f_rec.start_time_iso, []).append(f_rec)

    for st_iso in forecasts_by_start:
        forecasts_by_start[st_iso].sort(key=lambda r: r.publish_time_utc)

    return NormalizationReport(
        actuals_By_start=clean_actuals,
        forecasts_by_start=forecasts_by_start,
        actual_records_raw=actual_raw_count,
        actual_records_clean=len(clean_actuals),
        actual_duplicates_removed=actual_duplicates,
        actual_malformed_dropped=actual_malformed,
        forecast_records_raw=forecast_raw_count,
        forecast_records_clean=len(forecast_pair_map),
        forecast_duplicates_removed=forecast_duplicates,
        forecast_malformed_dropped=forecast_malformed,
    )
