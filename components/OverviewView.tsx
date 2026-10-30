"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight, Info } from "lucide-react";
import type { NavSection, OverviewResponse } from "@/lib/types";
import {
  formatMW,
  formatNumber,
  formatShortTimestamp,
  formatSignedMW,
} from "@/lib/wind-utils";

interface OverviewViewProps {
  data: OverviewResponse;
  onNavigate: (section: NavSection, deliveryDate?: string) => void;
}

export default function OverviewView({ data, onNavigate }: OverviewViewProps) {
  const isOverforecastBias = (data.bias_mw ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Context Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900">
            Day-Ahead Wind Procurement Overview
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>
              Analysis Period:{" "}
              <strong className="font-mono tabular-nums text-slate-900">
                {data.start_date}
              </strong>{" "}
              to{" "}
              <strong className="font-mono tabular-nums text-slate-900">
                {data.end_date}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>{data.cutoff_rule_description}</span>
            <span aria-hidden="true">·</span>
            <span>Source: {data.data_source_label}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span>
            Sample Size:{" "}
            <strong className="font-mono tabular-nums text-slate-900">
              n = {formatNumber(data.matched_periods)}
            </strong>{" "}
            matched periods
          </span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => onNavigate("explorer")}
            className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap shrink-0"
          >
            <span>Open Half-Hourly Explorer</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Primary KPI Grid (Single-Elevation 1px Bordered Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Forecast MAE */}
        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="text-xs font-medium text-slate-500">
            Mean Absolute Error (MAE)
          </div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-slate-900">
            {formatMW(data.mae_mw, 1)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
            <span>mean(|forecast − actual|)</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              n = {formatNumber(data.matched_periods)}
            </span>
          </div>
        </div>

        {/* Card 2: Forecast RMSE */}
        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="text-xs font-medium text-slate-500">
            Root Mean Squared Error (RMSE)
          </div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-slate-900">
            {formatMW(data.rmse_mw, 1)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
            <span>Max miss: {formatMW(data.max_abs_error_mw, 0)}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              n = {formatNumber(data.matched_periods)}
            </span>
          </div>
        </div>

        {/* Card 3: Forecast Bias */}
        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="text-xs font-medium text-slate-500">
            Mean Forecast Error (Bias)
          </div>
          <div
            className={`mt-2 font-mono tabular-nums text-2xl font-semibold ${
              isOverforecastBias ? "text-amber-700" : "text-emerald-700"
            }`}
          >
            {formatSignedMW(data.bias_mw, 1)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
            <span>
              {isOverforecastBias
                ? "Net Overforecasting (+MW)"
                : "Net Underforecasting (−MW)"}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              n = {formatNumber(data.matched_periods)}
            </span>
          </div>
        </div>

        {/* Card 4: Matched Delivery Periods & Completeness */}
        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="text-xs font-medium text-slate-500">
            Matched Delivery Periods
          </div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-slate-900">
            {formatNumber(data.matched_periods)}{" "}
            <span className="text-sm font-normal text-slate-500">
              / {formatNumber(data.total_expected_hourly_periods)} hr
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
            <span className="font-mono tabular-nums text-emerald-700 font-medium">
              {data.hourly_completeness_pct}% hourly match
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {formatNumber(data.total_expected_half_hour_periods)} 30m slots
            </span>
          </div>
        </div>
      </div>

      {/* Secondary Procurement & Directional Bias Strip */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Generation Averages & Cutoff Age */}
          <div className="lg:col-span-5 grid grid-cols-3 gap-4 border-b lg:border-b-0 lg:border-r border-slate-200 pb-4 lg:pb-0 lg:pr-6">
            <div>
              <div className="text-xs text-slate-500">Mean Forecast</div>
              <div className="mt-1 font-mono tabular-nums text-base font-semibold text-slate-900">
                {formatMW(data.avg_forecast_mw, 0)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Mean Actual</div>
              <div className="mt-1 font-mono tabular-nums text-base font-semibold text-slate-900">
                {formatMW(data.avg_actual_mw, 0)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Forecast Age at Cutoff</div>
              <div className="mt-1 font-mono tabular-nums text-base font-semibold text-slate-900">
                {data.avg_publication_age_hours !== null
                  ? `${data.avg_publication_age_hours}h`
                  : "—"}
              </div>
            </div>
          </div>

          {/* Overforecasting vs Underforecasting Split */}
          <div className="lg:col-span-7 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="text-slate-700">
                <strong className="text-amber-700 font-semibold">
                  Overforecasting (Forecast &gt; Actual):
                </strong>{" "}
                <span className="font-mono tabular-nums">
                  {formatNumber(data.overforecast_count)} periods (
                  {data.overforecast_pct}%)
                </span>{" "}
                <span className="text-slate-500">
                  — Day-ahead volume shortfall risk
                </span>
              </div>
              <div className="text-slate-700">
                <strong className="text-emerald-700 font-semibold">
                  Underforecasting (Forecast &lt; Actual):
                </strong>{" "}
                <span className="font-mono tabular-nums">
                  {formatNumber(data.underforecast_count)} periods (
                  {data.underforecast_pct}%)
                </span>
              </div>
            </div>

            {/* Proportional Directional Bar */}
            <div className="w-full h-2.5 bg-slate-100 rounded-sm overflow-hidden flex">
              <div
                style={{ width: `${data.overforecast_pct}%` }}
                className="bg-amber-600 h-full transition-all"
                title={`Overforecasting: ${data.overforecast_pct}%`}
              />
              <div
                style={{ width: `${data.underforecast_pct}%` }}
                className="bg-emerald-600 h-full transition-all"
                title={`Underforecasting: ${data.underforecast_pct}%`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Chart: Forecast vs Actual Generation Time-Series */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Selected Day-Ahead Forecast vs. Actual Wind Generation (MW)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Comparing eligible WINDFOR forecast selected at or before{" "}
              <span className="font-mono tabular-nums">{data.cutoff_time}</span>{" "}
              UK (D-{data.cutoff_days_before}) against metered FUELHH WIND
              output (n = {formatNumber(data.matched_periods)}).
            </p>
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            Last Refresh: {formatShortTimestamp(data.last_refresh_utc)}
          </div>
        </div>

        {data.time_series.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded">
            No matched forecast-actual records available for the selected window.
          </div>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.time_series}
                margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis
                  dataKey="start_time"
                  tickFormatter={(val: string) => {
                    const m = /^2026-01-(\d{2})T(\d{2}:\d{2})/.exec(val);
                    return m ? `Jan ${parseInt(m[1], 10)} ${m[2]}` : val;
                  }}
                  tick={{ fontSize: 11, fill: "#475569" }}
                  minTickGap={45}
                />
                <YAxis
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: "#475569" }}
                  width={48}
                  label={{
                    value: "Generation (MW)",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11, fill: "#64748B" },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0F172A",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    color: "#F8FAFC",
                    fontSize: "12px",
                  }}
                  labelFormatter={(label) =>
                    `Delivery Period: ${formatShortTimestamp(String(label))}`
                  }
                  formatter={(value: unknown, name: unknown) => [
                    formatMW(typeof value === "number" ? value : Number(value), 0),
                    String(name),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                <Line
                  type="monotone"
                  dataKey="forecast_generation_mw"
                  name="Selected Forecast (WINDFOR)"
                  stroke="#D97706"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="actual_generation_mw"
                  name="Actual Generation (FUELHH WIND)"
                  stroke="#0F766E"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Bottom Two-Column Charts: Daily MAE & Bias Trend + Error Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily MAE & Bias Trend */}
        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Daily MAE &amp; Bias Trend (MW)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Daily Mean Absolute Error and signed Mean Forecast Error across
              each settlement date. Click a bar to inspect that delivery date.
            </p>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.daily_metrics}
                margin={{ top: 10, right: 15, left: 5, bottom: 5 }}
                onClick={(state) => {
                  if (state && state.activeLabel) {
                    onNavigate("explorer", String(state.activeLabel));
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fontSize: 11, fill: "#475569" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#475569" }}
                  width={48}
                  tickFormatter={(v: number) => `${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0F172A",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    color: "#F8FAFC",
                    fontSize: "12px",
                  }}
                  formatter={(value: unknown, name: unknown) => [
                    formatMW(typeof value === "number" ? value : Number(value), 1),
                    String(name),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "6px" }} />
                <ReferenceLine y={0} stroke="#64748B" />
                <Bar
                  dataKey="mae_mw"
                  name="Daily MAE (MW)"
                  fill="#0F172A"
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="bias_mw"
                  name="Daily Signed Bias (MW)"
                  fill="#D97706"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Error Distribution Histogram */}
        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Forecast Error Distribution (forecast − actual, MW)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Distribution of signed errors across{" "}
              <span className="font-mono tabular-nums">
                n = {formatNumber(data.matched_periods)}
              </span>{" "}
              matched periods. Amber bars indicate overforecasting (+MW); green
              bars indicate underforecasting (−MW).
            </p>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.error_distribution}
                margin={{ top: 10, right: 15, left: 5, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis
                  dataKey="bin_label"
                  tick={{ fontSize: 10, fill: "#475569" }}
                  angle={-20}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#475569" }}
                  width={40}
                  label={{
                    value: "Periods",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11, fill: "#64748B" },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0F172A",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    color: "#F8FAFC",
                    fontSize: "12px",
                  }}
                  formatter={(value: unknown, _name: unknown, item: { payload?: { percentage?: number } }) => [
                    `${value} periods (${item?.payload?.percentage ?? 0}%)`,
                    "Frequency",
                  ]}
                />
                <Bar dataKey="count" name="Matched Periods" radius={[2, 2, 0, 0]}>
                  {data.error_distribution.map((entry, idx) => (
                    <Cell
                      key={`cell-${idx}`}
                      fill={
                        entry.direction === "overforecast"
                          ? "#D97706"
                          : "#0F766E"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Granularity & Methodological Audit Note */}
      <div className="bg-white border border-slate-200 rounded-md p-4 flex items-start gap-3 text-xs text-slate-600">
        <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-900 font-medium">
            Elexon BMRS Resolution &amp; Matching Note:
          </strong>{" "}
          {data.granularity_note}
        </div>
      </div>
    </div>
  );
}
