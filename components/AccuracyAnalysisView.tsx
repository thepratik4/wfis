"use client";

import React, { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HelpCircle, Clock } from "lucide-react";
import type { AccuracyResponse } from "@/lib/types";
import {
  formatMW,
  formatNumber,
  formatShortTimestamp,
  formatSignedMW,
} from "@/lib/wind-utils";

interface AccuracyAnalysisViewProps {
  data: AccuracyResponse;
  onInspectPeriodHistory: (startTimeIso: string) => void;
}

export default function AccuracyAnalysisView({
  data,
  onInspectPeriodHistory,
}: AccuracyAnalysisViewProps) {
  const [activeTooltipKey, setActiveTooltipKey] = useState<string | null>(null);

  const explanationMap = Object.fromEntries(
    data.metric_explanations.map((m) => [m.key, m])
  );

  const renderMetricHeader = (label: string, metricKey: string) => {
    const exp = explanationMap[metricKey];
    const isOpen = activeTooltipKey === metricKey;
    return (
      <div className="relative flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {exp && (
          <button
            type="button"
            aria-label={`Explain ${exp.name}`}
            onClick={() =>
              setActiveTooltipKey(isOpen ? null : metricKey)
            }
            onMouseEnter={() => setActiveTooltipKey(metricKey)}
            onMouseLeave={() => setActiveTooltipKey(null)}
            className="text-slate-400 hover:text-slate-700 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        )}
        {exp && isOpen && (
          <div
            role="tooltip"
            className="absolute z-20 top-6 right-0 w-72 p-3 rounded-md bg-slate-900 text-slate-100 text-xs shadow-lg border border-slate-700 space-y-1.5"
          >
            <div className="font-semibold text-white">{exp.name}</div>
            <div className="font-mono text-emerald-400 text-[11px]">
              {exp.formula} ({exp.unit})
            </div>
            <p className="text-slate-300 leading-relaxed">
              {exp.interpretation}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900">
            Forecast Accuracy &amp; Systematic Bias Analysis
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>
              Window:{" "}
              <strong className="font-mono tabular-nums text-slate-900">
                {data.start_date}
              </strong>{" "}
              to{" "}
              <strong className="font-mono tabular-nums text-slate-900">
                {data.end_date}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Decision Cutoff:{" "}
              <strong className="font-mono tabular-nums text-slate-900">
                {data.cutoff_time} UK (D-{data.cutoff_days_before})
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Valid Sample Size:{" "}
              <strong className="font-mono tabular-nums text-slate-900">
                n = {formatNumber(data.sample_size_n)}
              </strong>{" "}
              matched pairs
            </span>
          </div>
        </div>
      </div>

      {/* Statistical Accuracy Metrics Grid with Tooltips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-md p-5">
          {renderMetricHeader("Mean Absolute Error (MAE)", "mae")}
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-slate-900">
            {formatMW(data.mae_mw, 2)}
          </div>
          <div className="mt-2 text-xs text-slate-600 font-mono tabular-nums">
            P90 |Error|: {formatMW(data.p90_abs_error_mw, 0)} · n ={" "}
            {formatNumber(data.sample_size_n)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-5">
          {renderMetricHeader("Root Mean Squared Error (RMSE)", "rmse")}
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-slate-900">
            {formatMW(data.rmse_mw, 2)}
          </div>
          <div className="mt-2 text-xs text-slate-600 font-mono tabular-nums">
            Error Std Dev: {formatMW(data.std_error_mw, 0)} · n ={" "}
            {formatNumber(data.sample_size_n)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-5">
          {renderMetricHeader("Mean Forecast Error (Bias)", "bias")}
          <div
            className={`mt-2 font-mono tabular-nums text-2xl font-semibold ${
              (data.bias_mw ?? 0) > 0 ? "text-amber-700" : "text-emerald-700"
            }`}
          >
            {formatSignedMW(data.bias_mw, 2)}
          </div>
          <div className="mt-2 text-xs text-slate-600 font-mono tabular-nums">
            Median Error: {formatSignedMW(data.median_error_mw, 0)} · n ={" "}
            {formatNumber(data.sample_size_n)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-5">
          {renderMetricHeader("Maximum Absolute Error", "max_abs_error")}
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-slate-900">
            {formatMW(data.max_abs_error_mw, 0)}
          </div>
          <div className="mt-2 text-xs text-slate-600 font-mono tabular-nums">
            Mean Cutoff Age: {data.avg_publication_age_hours ?? "—"}h · n ={" "}
            {formatNumber(data.sample_size_n)}
          </div>
        </div>
      </div>

      {/* Record Counts & Missing / Excluded Data Accounting */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <h2 className="font-display text-sm font-semibold text-slate-900 mb-3">
          Sample Accounting, Directional Bias &amp; Excluded Records Breakdown
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
          <div>
            <div className="text-slate-500">Valid Matched Pairs (n)</div>
            <div className="mt-1 font-mono tabular-nums text-base font-semibold text-slate-900">
              {formatNumber(data.sample_size_n)}
            </div>
            <div className="text-slate-500 mt-0.5">
              of {formatNumber(data.total_hourly_forecast_slots)} hourly slots
            </div>
          </div>

          <div>
            <div className="text-slate-500">Overforecasting Periods</div>
            <div className="mt-1 font-mono tabular-nums text-base font-semibold text-amber-700">
              {formatNumber(data.overforecast_count)}
            </div>
            <div className="text-slate-500 mt-0.5 font-mono tabular-nums">
              Avg: {formatSignedMW(data.overforecast_avg_mw, 0)}
            </div>
          </div>

          <div>
            <div className="text-slate-500">Underforecasting Periods</div>
            <div className="mt-1 font-mono tabular-nums text-base font-semibold text-emerald-700">
              {formatNumber(data.underforecast_count)}
            </div>
            <div className="text-slate-500 mt-0.5 font-mono tabular-nums">
              Avg: {formatSignedMW(data.underforecast_avg_mw, 0)}
            </div>
          </div>

          <div>
            <div className="text-slate-500">Unmatched :30 Actuals</div>
            <div className="mt-1 font-mono tabular-nums text-base font-semibold text-slate-900">
              {formatNumber(data.unmatched_half_hour_actuals_count)}
            </div>
            <div className="text-slate-500 mt-0.5">
              FUELHH 30m vs WINDFOR 60m
            </div>
          </div>

          <div>
            <div className="text-slate-500">Missing / Excluded Hourly</div>
            <div className="mt-1 font-mono tabular-nums text-base font-semibold text-slate-900">
              {formatNumber(data.missing_or_excluded_count)}
            </div>
            <div className="text-slate-500 mt-0.5">
              Never substituted as zero
            </div>
          </div>

          <div>
            <div className="text-slate-500">Excluded Post-Cutoff Pubs</div>
            <div className="mt-1 font-mono tabular-nums text-base font-semibold text-slate-900">
              {formatNumber(data.excluded_post_cutoff_publications_count)}
            </div>
            <div className="text-slate-500 mt-0.5">
              Intraday revisions filtered
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row: Daily Error Trends + Error Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Error Trends (MAE, RMSE, Bias) */}
        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Daily Accuracy Evolution (MAE, RMSE &amp; Bias in MW)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tracks daily forecast error magnitude and directional bias across
              each settlement date.
            </p>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data.daily_trends}
                margin={{ top: 10, right: 15, left: 5, bottom: 5 }}
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
                  fill="#CBD5E1"
                  radius={[2, 2, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="rmse_mw"
                  name="Daily RMSE (MW)"
                  stroke="#0F172A"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="bias_mw"
                  name="Daily Signed Bias (MW)"
                  stroke="#D97706"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Error Distribution */}
        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Signed Forecast Error Histogram (MW)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Frequency of matched delivery periods by error bucket (n ={" "}
              {formatNumber(data.sample_size_n)}).
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
                <YAxis tick={{ fontSize: 11, fill: "#475569" }} width={40} />
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
                    "Count",
                  ]}
                />
                <Bar dataKey="count" name="Delivery Periods" radius={[2, 2, 0, 0]}>
                  {data.error_distribution.map((entry, idx) => (
                    <Cell
                      key={`acc-cell-${idx}`}
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

      {/* Largest Overforecasting & Underforecasting Periods Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Overforecasting Periods */}
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Largest Overforecasting Periods (Forecast &gt; Actual)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Periods where wind output fell significantly short of the
              day-ahead forecast selected at cutoff.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <th className="py-2.5 px-3">Delivery Period</th>
                  <th className="py-2.5 px-3 text-right">Forecast</th>
                  <th className="py-2.5 px-3 text-right">Actual</th>
                  <th className="py-2.5 px-3 text-right">Signed Error</th>
                  <th className="py-2.5 px-3 text-right">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.largest_overforecast_periods.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      No overforecasting periods in selected window.
                    </td>
                  </tr>
                ) : (
                  data.largest_overforecast_periods.map((row) => (
                    <tr key={row.start_time} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        {formatShortTimestamp(row.start_time)} (SP
                        {row.settlement_period})
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {formatMW(row.forecast_generation_mw, 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {formatMW(row.actual_generation_mw, 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-amber-700">
                        {formatSignedMW(row.signed_error_mw, 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => onInspectPeriodHistory(row.start_time)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded whitespace-nowrap shrink-0"
                        >
                          <Clock className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Underforecasting Periods */}
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Largest Underforecasting Periods (Forecast &lt; Actual)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Periods where actual wind generation exceeded the day-ahead
              forecast selected at cutoff.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <th className="py-2.5 px-3">Delivery Period</th>
                  <th className="py-2.5 px-3 text-right">Forecast</th>
                  <th className="py-2.5 px-3 text-right">Actual</th>
                  <th className="py-2.5 px-3 text-right">Signed Error</th>
                  <th className="py-2.5 px-3 text-right">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.largest_underforecast_periods.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      No underforecasting periods in selected window.
                    </td>
                  </tr>
                ) : (
                  data.largest_underforecast_periods.map((row) => (
                    <tr key={row.start_time} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        {formatShortTimestamp(row.start_time)} (SP
                        {row.settlement_period})
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {formatMW(row.forecast_generation_mw, 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {formatMW(row.actual_generation_mw, 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {formatSignedMW(row.signed_error_mw, 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => onInspectPeriodHistory(row.start_time)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded whitespace-nowrap shrink-0"
                        >
                          <Clock className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Reference Glossary of Statistical Definitions */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <h2 className="font-display text-sm font-semibold text-slate-900 mb-3">
          Statistical Metric Definitions &amp; Procurement Rationale
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 text-xs">
          {data.metric_explanations.map((m) => (
            <div
              key={m.key}
              className="p-3 rounded border border-slate-200 bg-slate-50/60 space-y-1"
            >
              <div className="font-semibold text-slate-900">{m.name}</div>
              <div className="font-mono text-[11px] text-emerald-800">
                {m.formula}
              </div>
              <p className="text-slate-600 leading-relaxed">
                {m.interpretation}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
