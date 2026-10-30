from datetime import date
from typing import Any, Optional

from app.config import settings
from app.schemas.models import (
    AccuracyResponse,
    DailyCompletenessRow,
    DataMode,
    DataQualityResponse,
    ForecastRecordRow,
    ForecastsResponse,
    OverviewResponse,
    PublicationHistoryResponse,
    PublicationVersionItem,
    TimeSeriesPoint,
)
from app.services.data_processor import (
    NormalizationReport,
    compute_uk_settlement_info,
    format_utc_iso,
    generate_expected_delivery_periods,
    normalize_datasets,
    parse_utc_timestamp,
)
from app.services.elexon_client import ElexonClient, elexon_client
from app.services.forecast_selector import (
    SelectedForecastResult,
    compute_decision_cutoff_utc,
    parse_cutoff_time_str,
    select_forecast_at_cutoff,
)
from app.services.metrics import (
    calculate_daily_metrics,
    calculate_error_distribution,
    calculate_summary_metrics,
    get_metric_explanations,
)


GRANULARITY_NOTE = (
    "Official Elexon BMRS FUELHH reports half-hourly settlement periods (48/day at :00 and :30), "
    "whereas WINDFOR publishes national wind forecasts at hourly delivery timestamps (24/day at :00). "
    "Records are matched strictly on exact delivery startTime without synthetic interpolation: "
    ":00 periods form valid matched forecast-actual pairs, while :30 actuals are preserved in the explorer "
    "and reported as unmatched half-hourly actuals."
)


def validate_january_2026_dates(
    start_date: str, end_date: str, delivery_date: Optional[str] = None
) -> tuple[str, str]:
    """
    Validates that requested analysis dates fall within January 1 to January 31, 2026.
    If delivery_date is provided, scopes start_date and end_date to that single date.
    """
    if delivery_date:
        start_date = delivery_date
        end_date = delivery_date

    try:
        s_dt = date.fromisoformat(start_date)
        e_dt = date.fromisoformat(end_date)
    except ValueError as exc:
        raise ValueError(f"Invalid ISO date format (expected YYYY-MM-DD): {exc}")

    min_d = date(2026, 1, 1)
    max_d = date(2026, 1, 31)

    if s_dt < min_d or e_dt > max_d:
        raise ValueError(
            "Analysis scope is restricted to January 1, 2026 through January 31, 2026 (2026-01-01 to 2026-01-31)."
        )
    if e_dt < s_dt:
        raise ValueError("end_date must be greater than or equal to start_date.")

    return s_dt.isoformat(), e_dt.isoformat()


class AnalyticsEngine:
    def __init__(self, client: ElexonClient = elexon_client):
        self.client = client

    async def _load_normalized(
        self,
        data_mode: DataMode,
        start_date: str,
        end_date: str,
    ) -> tuple[NormalizationReport, dict[str, Any]]:
        if data_mode == "sample":
            raw_actuals, raw_forecasts, meta = self.client.get_sample_january_2026()
        else:
            raw_actuals, raw_forecasts, meta = await self.client.fetch_live_january_2026(
                force_refresh=False
            )

        norm = normalize_datasets(
            raw_actuals=raw_actuals,
            raw_forecasts=raw_forecasts,
            start_date_str=start_date,
            end_date_str=end_date,
        )
        return norm, meta

    def _build_period_rows(
        self,
        norm: NormalizationReport,
        start_date: str,
        end_date: str,
        cutoff_time: str,
        cutoff_days_before: int,
    ) -> tuple[
        list[ForecastRecordRow],
        dict[str, tuple[int, int]],
        dict[str, SelectedForecastResult],
    ]:
        # Validate cutoff format early
        parse_cutoff_time_str(cutoff_time)

        expected_periods = generate_expected_delivery_periods(start_date, end_date)
        expected_by_date: dict[str, tuple[int, int]] = {}
        for p in expected_periods:
            d_str = p["settlement_date"]
            hh, hr = expected_by_date.get(d_str, (0, 0))
            expected_by_date[d_str] = (
                hh + 1,
                hr + (1 if p["is_hourly_boundary"] else 0),
            )

        rows: list[ForecastRecordRow] = []
        selection_map: dict[str, SelectedForecastResult] = {}

        for p in expected_periods:
            st_iso = p["start_time_iso"]
            s_date = p["settlement_date"]
            s_period = p["settlement_period"]
            uk_str = p["uk_local_time"]
            is_hourly = p["is_hourly_boundary"]

            actual_rec = norm.actuals_By_start.get(st_iso)
            revisions = norm.forecasts_by_start.get(st_iso, [])

            sel = select_forecast_at_cutoff(
                start_time_iso=st_iso,
                settlement_date_str=s_date,
                revisions=revisions,
                cutoff_time_str=cutoff_time,
                cutoff_days_before=cutoff_days_before,
            )
            selection_map[st_iso] = sel

            actual_mw = actual_rec.generation_mw if actual_rec is not None else None
            forecast_mw = (
                sel.selected_forecast.generation_mw
                if sel.selected_forecast is not None
                else None
            )
            pub_iso = (
                sel.selected_forecast.publish_time_iso
                if sel.selected_forecast is not None
                else None
            )

            signed_err: Optional[float] = None
            abs_err: Optional[float] = None

            if forecast_mw is not None and actual_mw is not None:
                signed_err = round(forecast_mw - actual_mw, 2)
                abs_err = round(abs(signed_err), 2)
                status = "matched"
            elif actual_mw is not None and forecast_mw is None:
                status = (
                    "unmatched_actual_half_hour"
                    if not is_hourly and len(revisions) == 0
                    else "missing_forecast"
                )
            elif forecast_mw is not None and actual_mw is None:
                status = "missing_actual"
            else:
                status = "missing_both"

            rows.append(
                ForecastRecordRow(
                    start_time=st_iso,
                    uk_local_time=uk_str,
                    settlement_date=s_date,
                    settlement_period=s_period,
                    forecast_generation_mw=forecast_mw,
                    actual_generation_mw=actual_mw,
                    signed_error_mw=signed_err,
                    abs_error_mw=abs_err,
                    publish_time=pub_iso,
                    cutoff_time=sel.decision_cutoff_iso,
                    publication_age_hours=sel.publication_age_hours,
                    total_revisions=sel.total_revisions,
                    eligible_revisions=sel.eligible_revisions,
                    post_cutoff_revisions_excluded=sel.excluded_post_cutoff_revisions,
                    status=status,  # type: ignore[arg-type]
                    is_largest_error=False,
                )
            )

        # Flag top 10% largest absolute errors (at least top 5 when matched > 0)
        matched_rows_sorted = sorted(
            [r for r in rows if r.abs_error_mw is not None],
            key=lambda x: x.abs_error_mw or 0.0,
            reverse=True,
        )
        if matched_rows_sorted:
            highlight_count = max(3, min(15, max(1, len(matched_rows_sorted) // 10)))
            top_starts = {r.start_time for r in matched_rows_sorted[:highlight_count]}
            for r in rows:
                if r.start_time in top_starts:
                    r.is_largest_error = True

        return rows, expected_by_date, selection_map

    async def get_overview(
        self,
        start_date: str = "2026-01-01",
        end_date: str = "2026-01-31",
        delivery_date: Optional[str] = None,
        cutoff_time: str = settings.default_cutoff_time,
        cutoff_days_before: int = settings.default_cutoff_days_before,
        data_mode: DataMode = "live",
    ) -> OverviewResponse:
        s_date, e_date = validate_january_2026_dates(start_date, end_date, delivery_date)
        norm, meta = await self._load_normalized(data_mode, s_date, e_date)
        rows, expected_by_date, _ = self._build_period_rows(
            norm, s_date, e_date, cutoff_time, cutoff_days_before
        )

        summary = calculate_summary_metrics(rows)
        daily_metrics = calculate_daily_metrics(rows, expected_by_date)
        error_dist = calculate_error_distribution(rows)

        total_hh = sum(v[0] for v in expected_by_date.values())
        total_hr = sum(v[1] for v in expected_by_date.values())
        matched_n = summary["matched_periods"]
        unmatched_hh_actuals = sum(
            1 for r in rows if r.status == "unmatched_actual_half_hour"
        )
        missing_or_excluded = total_hr - matched_n

        completeness_hh_pct = (
            round((matched_n / total_hh) * 100.0, 1) if total_hh > 0 else 0.0
        )
        completeness_hr_pct = (
            round((matched_n / total_hr) * 100.0, 1) if total_hr > 0 else 0.0
        )

        # Build time series points (include matched hourly points, or all points if viewing 1-3 days)
        day_count = len(expected_by_date)
        ts_source = (
            rows
            if day_count <= 2
            else [r for r in rows if r.forecast_generation_mw is not None or r.start_time.endswith(":00:00Z")]
        )
        time_series = [
            TimeSeriesPoint(
                start_time=r.start_time,
                uk_local_time=r.uk_local_time,
                settlement_date=r.settlement_date,
                settlement_period=r.settlement_period,
                forecast_generation_mw=r.forecast_generation_mw,
                actual_generation_mw=r.actual_generation_mw,
                signed_error_mw=r.signed_error_mw,
                abs_error_mw=r.abs_error_mw,
                publish_time=r.publish_time,
                cutoff_time=r.cutoff_time,
                publication_age_hours=r.publication_age_hours,
            )
            for r in ts_source
        ]

        day_label = (
            f"D-{cutoff_days_before} ({cutoff_days_before} day{'s' if cutoff_days_before != 1 else ''} before delivery)"
            if cutoff_days_before > 0
            else "D-0 (Delivery Date)"
        )
        cutoff_desc = f"Latest WINDFOR publication at or before {cutoff_time} UK local time on {day_label}"
        source_label = (
            "Official Elexon BMRS API (FUELHH & WINDFOR)"
            if data_mode == "live"
            else "Synthetic Sample Dataset (Explicitly Labeled Sandbox Mode)"
        )

        return OverviewResponse(
            start_date=s_date,
            end_date=e_date,
            cutoff_time=cutoff_time,
            cutoff_days_before=cutoff_days_before,
            cutoff_rule_description=cutoff_desc,
            data_mode=data_mode,
            data_source_label=source_label,
            last_refresh_utc=meta.get("last_refresh_utc"),
            mae_mw=summary["mae_mw"],
            rmse_mw=summary["rmse_mw"],
            bias_mw=summary["bias_mw"],
            max_abs_error_mw=summary["max_abs_error_mw"],
            avg_forecast_mw=summary["avg_forecast_mw"],
            avg_actual_mw=summary["avg_actual_mw"],
            matched_periods=matched_n,
            total_expected_half_hour_periods=total_hh,
            total_expected_hourly_periods=total_hr,
            missing_or_excluded_records=max(0, missing_or_excluded),
            unmatched_actual_records=unmatched_hh_actuals,
            completeness_pct=completeness_hh_pct,
            hourly_completeness_pct=completeness_hr_pct,
            overforecast_count=summary["overforecast_count"],
            underforecast_count=summary["underforecast_count"],
            exact_match_count=summary["exact_match_count"],
            overforecast_pct=summary["overforecast_pct"],
            underforecast_pct=summary["underforecast_pct"],
            avg_publication_age_hours=summary["avg_publication_age_hours"],
            time_series=time_series,
            daily_metrics=daily_metrics,
            error_distribution=error_dist,
            granularity_note=GRANULARITY_NOTE,
        )

    async def get_forecasts(
        self,
        start_date: str = "2026-01-01",
        end_date: str = "2026-01-31",
        delivery_date: Optional[str] = None,
        cutoff_time: str = settings.default_cutoff_time,
        cutoff_days_before: int = settings.default_cutoff_days_before,
        data_mode: DataMode = "live",
        only_matched: bool = False,
    ) -> ForecastsResponse:
        s_date, e_date = validate_january_2026_dates(start_date, end_date, delivery_date)
        norm, meta = await self._load_normalized(data_mode, s_date, e_date)
        rows, _, _ = self._build_period_rows(
            norm, s_date, e_date, cutoff_time, cutoff_days_before
        )

        summary = calculate_summary_metrics(rows)
        matched_rows_count = summary["matched_periods"]
        unmatched_hh_count = sum(
            1 for r in rows if r.status == "unmatched_actual_half_hour"
        )

        filtered_rows = (
            [r for r in rows if r.status == "matched"] if only_matched else rows
        )

        return ForecastsResponse(
            start_date=s_date,
            end_date=e_date,
            delivery_date=delivery_date,
            cutoff_time=cutoff_time,
            cutoff_days_before=cutoff_days_before,
            data_mode=data_mode,
            last_refresh_utc=meta.get("last_refresh_utc"),
            total_rows=len(filtered_rows),
            matched_rows=matched_rows_count,
            unmatched_half_hour_rows=unmatched_hh_count,
            summary_mae_mw=summary["mae_mw"],
            summary_rmse_mw=summary["rmse_mw"],
            summary_bias_mw=summary["bias_mw"],
            summary_max_abs_error_mw=summary["max_abs_error_mw"],
            records=filtered_rows,
        )

    async def get_accuracy(
        self,
        start_date: str = "2026-01-01",
        end_date: str = "2026-01-31",
        delivery_date: Optional[str] = None,
        cutoff_time: str = settings.default_cutoff_time,
        cutoff_days_before: int = settings.default_cutoff_days_before,
        data_mode: DataMode = "live",
    ) -> AccuracyResponse:
        s_date, e_date = validate_january_2026_dates(start_date, end_date, delivery_date)
        norm, meta = await self._load_normalized(data_mode, s_date, e_date)
        rows, expected_by_date, _ = self._build_period_rows(
            norm, s_date, e_date, cutoff_time, cutoff_days_before
        )

        summary = calculate_summary_metrics(rows)
        daily_trends = calculate_daily_metrics(rows, expected_by_date)
        error_dist = calculate_error_distribution(rows)

        total_hh = sum(v[0] for v in expected_by_date.values())
        total_hr = sum(v[1] for v in expected_by_date.values())
        matched_n = summary["matched_periods"]
        unmatched_hh = sum(
            1 for r in rows if r.status == "unmatched_actual_half_hour"
        )
        excluded_post_cutoff = sum(r.post_cutoff_revisions_excluded for r in rows)

        matched_only = [r for r in rows if r.signed_error_mw is not None]
        largest_over = sorted(
            [r for r in matched_only if (r.signed_error_mw or 0.0) > 0],
            key=lambda r: r.signed_error_mw or 0.0,
            reverse=True,
        )[:8]
        largest_under = sorted(
            [r for r in matched_only if (r.signed_error_mw or 0.0) < 0],
            key=lambda r: r.signed_error_mw or 0.0,
        )[:8]

        return AccuracyResponse(
            start_date=s_date,
            end_date=e_date,
            cutoff_time=cutoff_time,
            cutoff_days_before=cutoff_days_before,
            data_mode=data_mode,
            last_refresh_utc=meta.get("last_refresh_utc"),
            sample_size_n=matched_n,
            total_half_hour_slots=total_hh,
            total_hourly_forecast_slots=total_hr,
            missing_or_excluded_count=max(0, total_hr - matched_n),
            unmatched_half_hour_actuals_count=unmatched_hh,
            excluded_post_cutoff_publications_count=excluded_post_cutoff,
            mae_mw=summary["mae_mw"],
            rmse_mw=summary["rmse_mw"],
            bias_mw=summary["bias_mw"],
            max_abs_error_mw=summary["max_abs_error_mw"],
            std_error_mw=summary["std_error_mw"],
            median_error_mw=summary["median_error_mw"],
            p90_abs_error_mw=summary["p90_abs_error_mw"],
            avg_forecast_mw=summary["avg_forecast_mw"],
            avg_actual_mw=summary["avg_actual_mw"],
            avg_publication_age_hours=summary["avg_publication_age_hours"],
            overforecast_count=summary["overforecast_count"],
            underforecast_count=summary["underforecast_count"],
            exact_match_count=summary["exact_match_count"],
            overforecast_avg_mw=summary["overforecast_avg_mw"],
            underforecast_avg_mw=summary["underforecast_avg_mw"],
            daily_trends=daily_trends,
            error_distribution=error_dist,
            largest_overforecast_periods=largest_over,
            largest_underforecast_periods=largest_under,
            metric_explanations=get_metric_explanations(),
        )

    async def get_publication_history(
        self,
        start_time_raw: str,
        cutoff_time: str = settings.default_cutoff_time,
        cutoff_days_before: int = settings.default_cutoff_days_before,
        data_mode: DataMode = "live",
    ) -> PublicationHistoryResponse:
        st_dt = parse_utc_timestamp(start_time_raw)
        if st_dt is None:
            raise ValueError(
                f"Invalid delivery period start_time '{start_time_raw}'. Expected ISO-8601 UTC timestamp."
            )

        st_iso = format_utc_iso(st_dt)
        s_date, s_period, uk_str = compute_uk_settlement_info(st_dt)
        validate_january_2026_dates(s_date, s_date)

        norm, _ = await self._load_normalized(data_mode, s_date, s_date)
        actual_rec = norm.actuals_By_start.get(st_iso)
        actual_mw = actual_rec.generation_mw if actual_rec is not None else None

        revisions = norm.forecasts_by_start.get(st_iso, [])
        sel = select_forecast_at_cutoff(
            start_time_iso=st_iso,
            settlement_date_str=s_date,
            revisions=revisions,
            cutoff_time_str=cutoff_time,
            cutoff_days_before=cutoff_days_before,
        )

        pub_items: list[PublicationVersionItem] = []
        prev_gen: Optional[float] = None
        selected_item: Optional[PublicationVersionItem] = None

        for rev in sel.all_revisions_chronological:
            lead_h = round(
                (st_dt - rev.publish_time_utc).total_seconds() / 3600.0, 2
            )
            delta_cutoff_h = round(
                (sel.decision_cutoff_utc - rev.publish_time_utc).total_seconds()
                / 3600.0,
                2,
            )
            is_elig = rev.publish_time_utc <= sel.decision_cutoff_utc
            is_sel = (
                sel.selected_forecast is not None
                and rev.publish_time_iso == sel.selected_forecast.publish_time_iso
            )

            if is_sel:
                sel_status = "selected_at_cutoff"
            elif is_elig:
                sel_status = "eligible_superseded"
            else:
                sel_status = "excluded_after_cutoff"

            rev_delta = (
                round(rev.generation_mw - prev_gen, 2)
                if prev_gen is not None
                else None
            )
            prev_gen = rev.generation_mw

            signed_err = (
                round(rev.generation_mw - actual_mw, 2)
                if actual_mw is not None
                else None
            )
            abs_err = round(abs(signed_err), 2) if signed_err is not None else None

            item = PublicationVersionItem(
                publish_time=rev.publish_time_iso,
                publish_uk_local_time=rev.publish_uk_local_str,
                forecast_generation_mw=rev.generation_mw,
                lead_time_hours=lead_h,
                delta_from_cutoff_hours=delta_cutoff_h,
                is_eligible_at_cutoff=is_elig,
                is_selected_for_procurement=is_sel,
                selection_status=sel_status,  # type: ignore[arg-type]
                revision_delta_mw=rev_delta,
                signed_error_vs_actual_mw=signed_err,
                abs_error_vs_actual_mw=abs_err,
            )
            pub_items.append(item)
            if is_sel:
                selected_item = item

        latest_overall = pub_items[-1] if pub_items else None
        available_for_date = sorted(norm.forecasts_by_start.keys())

        if not pub_items and st_dt.minute == 30:
            note = (
                "This delivery period is a :30 half-hour boundary. Elexon WINDFOR publishes forecasts only "
                "for :00 hourly delivery timestamps, while FUELHH provides actual generation for all 48 half-hour periods."
            )
        elif not pub_items:
            note = "No WINDFOR forecast publications were returned for this delivery period."
        elif selected_item is None:
            note = (
                f"Found {len(pub_items)} forecast revisions for this delivery period, "
                f"but all were published after the configured decision cutoff ({sel.decision_cutoff_iso})."
            )
        else:
            note = (
                f"Selected forecast published at {selected_item.publish_time} "
                f"({selected_item.delta_from_cutoff_hours}h before decision cutoff). "
                f"{sel.excluded_post_cutoff_revisions} post-cutoff intraday revisions were excluded from procurement accuracy."
            )

        return PublicationHistoryResponse(
            start_time=st_iso,
            uk_local_time=uk_str,
            settlement_date=s_date,
            settlement_period=s_period,
            cutoff_time=cutoff_time,
            cutoff_days_before=cutoff_days_before,
            decision_cutoff_timestamp=sel.decision_cutoff_iso,
            data_mode=data_mode,
            actual_generation_mw=actual_mw,
            selected_forecast=selected_item,
            latest_overall_forecast=latest_overall,
            total_publications=sel.total_revisions,
            eligible_publications_count=sel.eligible_revisions,
            excluded_post_cutoff_count=sel.excluded_post_cutoff_revisions,
            available_delivery_periods_for_date=available_for_date,
            publications=pub_items,
            note=note,
        )

    async def get_data_quality(
        self,
        start_date: str = "2026-01-01",
        end_date: str = "2026-01-31",
        cutoff_time: str = settings.default_cutoff_time,
        cutoff_days_before: int = settings.default_cutoff_days_before,
        data_mode: DataMode = "live",
    ) -> DataQualityResponse:
        s_date, e_date = validate_january_2026_dates(start_date, end_date)
        norm, meta = await self._load_normalized(data_mode, s_date, e_date)
        rows, expected_by_date, selection_map = self._build_period_rows(
            norm, s_date, e_date, cutoff_time, cutoff_days_before
        )

        total_hh = sum(v[0] for v in expected_by_date.values())
        total_hr = sum(v[1] for v in expected_by_date.values())

        matched_periods = sum(1 for r in rows if r.status == "matched")
        missing_actuals = sum(
            1 for r in rows if r.actual_generation_mw is None
        )
        distinct_forecast_periods = len(norm.forecasts_by_start)
        missing_hourly_forecasts = max(0, total_hr - distinct_forecast_periods)
        unmatched_hh_actuals = sum(
            1 for r in rows if r.status == "unmatched_actual_half_hour"
        )
        unmatched_forecasts = sum(
            1 for r in rows if r.status == "missing_actual"
        )
        no_elig_cutoff = sum(
            1
            for st_iso, sel in selection_map.items()
            if sel.total_revisions > 0 and sel.selected_forecast is None
        )
        excluded_post_cutoff_total = sum(
            sel.excluded_post_cutoff_revisions for sel in selection_map.values()
        )

        # Daily completeness breakdown
        rows_by_date: dict[str, list[ForecastRecordRow]] = {}
        for r in rows:
            rows_by_date.setdefault(r.settlement_date, []).append(r)

        daily_comp: list[DailyCompletenessRow] = []
        for d_str in sorted(expected_by_date.keys()):
            exp_hh, exp_hr = expected_by_date[d_str]
            d_rows = rows_by_date.get(d_str, [])
            act_cnt = sum(1 for r in d_rows if r.actual_generation_mw is not None)
            dist_f_cnt = sum(1 for r in d_rows if r.total_revisions > 0)
            matched_cnt = sum(1 for r in d_rows if r.status == "matched")
            tot_revs = sum(r.total_revisions for r in d_rows)
            comp_pct = round((matched_cnt / exp_hr) * 100.0, 1) if exp_hr > 0 else 0.0

            daily_comp.append(
                DailyCompletenessRow(
                    date=d_str,
                    expected_half_hour_periods=exp_hh,
                    actual_wind_records=act_cnt,
                    expected_hourly_forecast_periods=exp_hr,
                    distinct_forecast_periods=dist_f_cnt,
                    matched_eligible_periods=matched_cnt,
                    total_forecast_revisions=tot_revs,
                    completeness_hourly_pct=comp_pct,
                )
            )

        warnings: list[str] = []
        if data_mode == "sample":
            warnings.append(
                "Sample Data Mode is active. Metrics reflect deterministic synthetic data and must not be cited as real Elexon market findings."
            )
        if meta.get("using_fallback_cache"):
            warnings.append(
                f"Latest live refresh encountered an error ({meta.get('last_refresh_error')}); serving last verified cached dataset."
            )
        if unmatched_hh_actuals > 0:
            warnings.append(
                f"{unmatched_hh_actuals} half-hourly (:30) FUELHH actual records have no native :30 WINDFOR forecast record because Elexon WINDFOR reports hourly (:00) timestamps. These are excluded from error aggregation rather than synthetically interpolated."
            )
        if no_elig_cutoff > 0:
            warnings.append(
                f"{no_elig_cutoff} hourly delivery periods had forecast revisions, but none were published at or before the selected decision cutoff ({cutoff_time} D-{cutoff_days_before})."
            )

        if data_mode == "sample":
            api_status = "sample_mode"
        elif meta.get("using_fallback_cache"):
            api_status = "offline_cached"
        else:
            api_status = "healthy"

        return DataQualityResponse(
            api_status=api_status,  # type: ignore[arg-type]
            elexon_endpoint_fuelhh=self.client.fuelhh_endpoint,
            elexon_endpoint_windfor=self.client.windfor_endpoint,
            data_source=(
                "Elexon Insights Solution (BMRS) Open API v1"
                if data_mode == "live"
                else "Synthetic Sample Generator (Sandbox)"
            ),
            data_mode=data_mode,
            date_coverage_start=s_date,
            date_coverage_end=e_date,
            expected_half_hourly_periods=total_hh,
            expected_hourly_forecast_periods=total_hr,
            actual_records_raw=norm.actual_records_raw,
            actual_records_clean=norm.actual_records_clean,
            actual_duplicates_removed=norm.actual_duplicates_removed,
            actual_malformed_dropped=norm.actual_malformed_dropped,
            forecast_records_raw=norm.forecast_records_raw,
            forecast_records_clean=norm.forecast_records_clean,
            forecast_duplicates_removed=norm.forecast_duplicates_removed,
            forecast_malformed_dropped=norm.forecast_malformed_dropped,
            matched_periods=matched_periods,
            missing_actual_periods=missing_actuals,
            missing_hourly_forecast_periods=missing_hourly_forecasts,
            unmatched_half_hour_actuals=unmatched_hh_actuals,
            unmatched_forecasts=unmatched_forecasts,
            periods_without_eligible_cutoff_forecast=no_elig_cutoff,
            excluded_post_cutoff_revisions_total=excluded_post_cutoff_total,
            last_successful_refresh_utc=meta.get("last_refresh_utc"),
            actuals_cache_age_seconds=meta.get("actuals_cache_age_seconds"),
            forecasts_cache_age_seconds=meta.get("forecasts_cache_age_seconds"),
            cache_ttl_seconds=self.client.cache_ttl_seconds,
            using_fallback_cached_dataset=bool(meta.get("using_fallback_cache")),
            last_refresh_error=meta.get("last_refresh_error"),
            granularity_explanation=GRANULARITY_NOTE,
            warnings=warnings,
            daily_completeness=daily_comp,
        )


analytics_engine = AnalyticsEngine()
