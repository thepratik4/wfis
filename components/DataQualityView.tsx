"use client";

import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCw,
  Server,
} from "lucide-react";
import type { DataQualityResponse } from "@/lib/types";
import { formatNumber, formatShortTimestamp } from "@/lib/wind-utils";

interface DataQualityViewProps {
  data: DataQualityResponse;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export default function DataQualityView({
  data,
  onRefresh,
  isRefreshing,
}: DataQualityViewProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900">
            Data Quality, Elexon Schema Verification &amp; Completeness Audit
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>
              Coverage:{" "}
              <strong className="font-mono tabular-nums text-slate-900">
                {data.date_coverage_start}
              </strong>{" "}
              to{" "}
              <strong className="font-mono tabular-nums text-slate-900">
                {data.date_coverage_end}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>Source: {data.data_source}</span>
            <span aria-hidden="true">·</span>
            <span>
              Last Refresh:{" "}
              <strong className="font-mono tabular-nums text-slate-900">
                {formatShortTimestamp(data.last_successful_refresh_utc)}
              </strong>
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
          />
          <span>
            {isRefreshing ? "Re-validating Upstream..." : "Force Upstream Refresh"}
          </span>
        </button>
      </div>

      {/* Warnings / Notices */}
      {data.warnings.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-md p-4 space-y-2">
          <div className="text-xs font-semibold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Data Quality &amp; Granularity Notices</span>
          </div>
          <ul className="space-y-1.5 text-xs text-slate-700 pl-6 list-disc">
            {data.warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* System & Pipeline Health Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="text-xs font-medium text-slate-500 flex items-center justify-between">
            <span>Upstream API Status</span>
            <Server className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <CheckCircle2
              className={`w-5 h-5 shrink-0 ${
                data.api_status === "healthy"
                  ? "text-emerald-600"
                  : "text-amber-600"
              }`}
            />
            <span className="font-display text-lg font-semibold text-slate-900">
              {data.api_status === "healthy"
                ? "Healthy · Live Elexon"
                : data.api_status === "sample_mode"
                ? "Sandbox · Sample Mode"
                : "Cached Fallback"}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
            Cache TTL: {data.cache_ttl_seconds}s · Age:{" "}
            {data.forecasts_cache_age_seconds ?? 0}s
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="text-xs font-medium text-slate-500 flex items-center justify-between">
            <span>FUELHH Actual Records (WIND)</span>
            <Database className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-slate-900">
            {formatNumber(data.actual_records_clean)}{" "}
            <span className="text-sm font-normal text-slate-500">
              / {formatNumber(data.expected_half_hourly_periods)}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-600 font-mono tabular-nums">
            Duplicates removed: {data.actual_duplicates_removed} · Malformed:{" "}
            {data.actual_malformed_dropped}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="text-xs font-medium text-slate-500">
            WINDFOR Historical Revisions
          </div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-slate-900">
            {formatNumber(data.forecast_records_clean)}
          </div>
          <div className="mt-2 text-xs text-slate-600 font-mono tabular-nums">
            Duplicates removed: {data.forecast_duplicates_removed} · Malformed:{" "}
            {data.forecast_malformed_dropped}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="text-xs font-medium text-slate-500">
            Matched Procurement Pairs
          </div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-emerald-700">
            {formatNumber(data.matched_periods)}{" "}
            <span className="text-sm font-normal text-slate-500">
              / {formatNumber(data.expected_hourly_forecast_periods)} hr
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-600 font-mono tabular-nums">
            Post-cutoff revisions excluded:{" "}
            {formatNumber(data.excluded_post_cutoff_revisions_total)}
          </div>
        </div>
      </div>

      {/* Verified Elexon Endpoint & Granularity Specification */}
      <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
        <h2 className="font-display text-base font-semibold text-slate-900">
          Verified Elexon BMRS Endpoint Schemas &amp; Normalization Rules
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded border border-slate-200 bg-slate-50/70 space-y-2">
            <div className="font-semibold text-slate-900">
              1. Actual Generation Dataset (FUELHH)
            </div>
            <div className="font-mono text-[11px] text-slate-700 break-all">
              GET {data.elexon_endpoint_fuelhh}
            </div>
            <div className="text-slate-600 space-y-1">
              <div>
                <strong>Parameters:</strong>{" "}
                <code className="font-mono">
                  settlementDateFrom=2026-01-01&amp;settlementDateTo=2026-01-31&amp;fuelType=WIND
                </code>
              </div>
              <div>
                <strong>Verified Schema Fields:</strong>{" "}
                <code className="font-mono">
                  dataset, publishTime, startTime, settlementDate,
                  settlementPeriod (1..48), fuelType (&quot;WIND&quot;), generation (MW)
                </code>
              </div>
              <div>
                <strong>Granularity:</strong> Half-hourly settlement periods
                (:00 and :30 UTC, 48 periods/day in winter = 1,488 records in
                Jan 2026).
              </div>
            </div>
          </div>

          <div className="p-4 rounded border border-slate-200 bg-slate-50/70 space-y-2">
            <div className="font-semibold text-slate-900">
              2. Wind Generation Forecast Dataset (WINDFOR)
            </div>
            <div className="font-mono text-[11px] text-slate-700 break-all">
              GET {data.elexon_endpoint_windfor}
            </div>
            <div className="text-slate-600 space-y-1">
              <div>
                <strong>Parameters:</strong>{" "}
                <code className="font-mono">
                  publishDateTimeFrom=2025-12-28T00:00:00Z&amp;publishDateTimeTo=2026-02-01T00:00:00Z
                </code>
              </div>
              <div>
                <strong>Verified Schema Fields:</strong>{" "}
                <code className="font-mono">
                  dataset, publishTime, startTime, generation (MW)
                </code>
              </div>
              <div>
                <strong>Granularity &amp; Revisions:</strong> Hourly delivery
                timestamps (:00 UTC, 24 periods/day = 744 periods in Jan 2026),
                published 8 times daily (~24 revisions per delivery hour).
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          {data.granularity_explanation}
        </p>
      </div>

      {/* Daily Completeness Audit Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Daily Data Completeness &amp; Revision Density ({data.daily_completeness.length}{" "}
            Settlement Days)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Expected delivery period counts are derived dynamically from UK{" "}
            <code className="font-mono">Europe/London</code> timezone rules.
          </p>
        </div>

        <div className="overflow-x-auto max-h-[460px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
              <tr>
                <th className="py-2.5 px-3">Settlement Date</th>
                <th className="py-2.5 px-3 text-right">Expected 30m Periods</th>
                <th className="py-2.5 px-3 text-right">FUELHH WIND Actuals</th>
                <th className="py-2.5 px-3 text-right">
                  Expected Hourly Forecasts
                </th>
                <th className="py-2.5 px-3 text-right">
                  Matched Eligible Pairs
                </th>
                <th className="py-2.5 px-3 text-right">
                  Total WINDFOR Revisions
                </th>
                <th className="py-2.5 px-3 text-right">Hourly Completeness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.daily_completeness.map((row) => (
                <tr key={row.date} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-mono tabular-nums font-medium text-slate-900">
                    {row.date}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                    {row.expected_half_hour_periods}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-900">
                    {row.actual_wind_records}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                    {row.expected_hourly_forecast_periods}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-700 font-medium">
                    {row.matched_eligible_periods}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                    {formatNumber(row.total_forecast_revisions)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {row.completeness_hourly_pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
