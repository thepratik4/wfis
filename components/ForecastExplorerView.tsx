"use client";

import React, { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  Clock,
  Download,
  Search,
  ArrowUpDown,
} from "lucide-react";
import type { ForecastsResponse } from "@/lib/types";
import {
  buildForecastsCsv,
  classifyErrorDirection,
  ExplorerRowFilter,
  ExplorerSortField,
  filterAndSortForecastRows,
  formatMW,
  formatNumber,
  formatShortTimestamp,
  formatSignedMW,
  formatTimeHHMM,
} from "@/lib/wind-utils";

interface ForecastExplorerViewProps {
  data: ForecastsResponse;
  selectedDate: string;
  onSelectDate: (newDate: string) => void;
  onInspectPeriodHistory: (startTimeIso: string) => void;
}

export default function ForecastExplorerView({
  data,
  selectedDate,
  onSelectDate,
  onInspectPeriodHistory,
}: ForecastExplorerViewProps) {
  const [rowFilter, setRowFilter] = useState<ExplorerRowFilter>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<ExplorerSortField>("start_time");
  const [sortDesc, setSortDesc] = useState<boolean>(false);

  const visibleRows = useMemo(
    () =>
      filterAndSortForecastRows(
        data.records,
        rowFilter,
        searchQuery,
        sortField,
        sortDesc
      ),
    [data.records, rowFilter, searchQuery, sortField, sortDesc]
  );

  const handleSort = (field: ExplorerSortField) => {
    if (sortField === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortField(field);
      setSortDesc(field !== "start_time");
    }
  };

  const handleDownloadCsv = () => {
    const csvContent = buildForecastsCsv(visibleRows);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wind_forecasts_${selectedDate}_cutoff_${data.cutoff_time.replace(":", "")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header & Delivery Date Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900">
            Forecast Explorer &amp; Half-Hourly Settlement Table
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>
              Delivery Date:{" "}
              <strong className="font-mono tabular-nums text-slate-900">
                {selectedDate}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Cutoff:{" "}
              <strong className="font-mono tabular-nums text-slate-900">
                {data.cutoff_time} UK (D-{data.cutoff_days_before})
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Matched:{" "}
              <strong className="font-mono tabular-nums text-slate-900">
                {data.matched_rows}
              </strong>{" "}
              of {data.total_rows} half-hour periods
            </span>
          </div>
        </div>

        {/* Delivery Date Picker + CSV Export Button */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="explorer-date-select"
              className="text-xs font-medium text-slate-700 whitespace-nowrap"
            >
              Inspect Delivery Date:
            </label>
            <input
              id="explorer-date-select"
              type="date"
              min="2026-01-01"
              max="2026-01-31"
              value={selectedDate}
              onChange={(e) => onSelectDate(e.target.value || "2026-01-15")}
              className="px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900"
            />
          </div>

          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV ({visibleRows.length} rows)</span>
          </button>
        </div>
      </div>

      {/* Selected Window Summary KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">Selected Date MAE</div>
          <div className="mt-1 font-mono tabular-nums text-lg font-semibold text-slate-900">
            {formatMW(data.summary_mae_mw, 1)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
            n = {data.matched_rows} matched pairs
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">Selected Date RMSE</div>
          <div className="mt-1 font-mono tabular-nums text-lg font-semibold text-slate-900">
            {formatMW(data.summary_rmse_mw, 1)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Root mean squared error
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">Selected Date Bias</div>
          <div
            className={`mt-1 font-mono tabular-nums text-lg font-semibold ${
              (data.summary_bias_mw ?? 0) > 0
                ? "text-amber-700"
                : "text-emerald-700"
            }`}
          >
            {formatSignedMW(data.summary_bias_mw, 1)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Signed mean forecast error
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">Maximum Absolute Error</div>
          <div className="mt-1 font-mono tabular-nums text-lg font-semibold text-slate-900">
            {formatMW(data.summary_max_abs_error_mw, 0)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Peak period deviation
          </div>
        </div>
      </div>

      {/* Interactive Chart for Selected Delivery Date */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Half-Hourly Profile: Forecast vs. Actual Wind Generation ({selectedDate})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              FUELHH actual wind generation across all 48 half-hour settlement
              periods vs. WINDFOR day-ahead forecast selected at cutoff.
            </p>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data.records}
              margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis
                dataKey="start_time"
                tickFormatter={(val: string) => formatTimeHHMM(val)}
                tick={{ fontSize: 11, fill: "#475569" }}
                minTickGap={24}
              />
              <YAxis
                tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`}
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
                labelFormatter={(label) =>
                  `Delivery Period: ${formatShortTimestamp(String(label))}`
                }
                formatter={(value: unknown, name: unknown) => [
                  formatMW(
                    typeof value === "number" ? value : Number(value),
                    0
                  ),
                  String(name),
                ]}
              />
              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "6px" }} />
              <Line
                type="monotone"
                dataKey="forecast_generation_mw"
                name="Selected Forecast (WINDFOR :00)"
                stroke="#D97706"
                strokeWidth={2.2}
                dot={{ r: 3, fill: "#D97706" }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="actual_generation_mw"
                name="Actual Generation (FUELHH 30m)"
                stroke="#0F766E"
                strokeWidth={2}
                dot={{ r: 2, fill: "#0F766E" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table Toolbar & Filters */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          {/* Segmented Row Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md border border-slate-200">
            <button
              type="button"
              onClick={() => setRowFilter("all")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                rowFilter === "all"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Half-Hours ({data.records.length})
            </button>
            <button
              type="button"
              onClick={() => setRowFilter("matched")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                rowFilter === "matched"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Matched Pairs Only ({data.matched_rows})
            </button>
            <button
              type="button"
              onClick={() => setRowFilter("largest_errors")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                rowFilter === "largest_errors"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Largest Errors Highlighted
            </button>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Filter settlement periods"
              placeholder="Search timestamp or SP (e.g. 12:00, SP25)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* High-Density Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-3 whitespace-nowrap">SP</th>
                <th className="py-2.5 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort("start_time")}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Delivery Period (UTC)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort("forecast_generation_mw")}
                    className="inline-flex items-center gap-1 hover:text-slate-900 ml-auto"
                  >
                    <span>Forecast (MW)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort("actual_generation_mw")}
                    className="inline-flex items-center gap-1 hover:text-slate-900 ml-auto"
                  >
                    <span>Actual (MW)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort("signed_error_mw")}
                    className="inline-flex items-center gap-1 hover:text-slate-900 ml-auto"
                  >
                    <span>Signed Error</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort("abs_error_mw")}
                    className="inline-flex items-center gap-1 hover:text-slate-900 ml-auto"
                  >
                    <span>Abs Error</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap">
                  Selected publishTime
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap">
                  Direction / Status
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  Publication Audit
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-8 text-center text-slate-500"
                  >
                    No delivery periods match the current filter criteria.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => {
                  const dir = classifyErrorDirection(row.signed_error_mw);
                  return (
                    <tr
                      key={row.start_time}
                      className={`hover:bg-slate-50/90 transition-colors ${
                        row.is_largest_error ? "bg-amber-50/60" : ""
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        SP{row.settlement_period}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        {formatShortTimestamp(row.start_time)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        {formatMW(row.forecast_generation_mw, 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        {formatMW(row.actual_generation_mw, 0)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono tabular-nums font-medium whitespace-nowrap ${
                          row.signed_error_mw === null
                            ? "text-slate-400"
                            : row.signed_error_mw > 0
                            ? "text-amber-700"
                            : row.signed_error_mw < 0
                            ? "text-emerald-700"
                            : "text-slate-700"
                        }`}
                      >
                        {formatSignedMW(row.signed_error_mw, 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        <span className="inline-flex items-center justify-end gap-1">
                          {row.is_largest_error && (
                            <AlertCircle
                              className="w-3.5 h-3.5 text-amber-600 shrink-0"
                              aria-label="Largest forecast error highlight"
                            />
                          )}
                          <span>{formatMW(row.abs_error_mw, 0)}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {row.publish_time ? (
                          <span>
                            {formatShortTimestamp(row.publish_time)}{" "}
                            <span className="text-slate-400">
                              ({row.publication_age_hours}h pre-cutoff)
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                        {dir.direction === "overforecast" && (
                          <span className="text-amber-700 font-medium">
                            Overforecast
                          </span>
                        )}
                        {dir.direction === "underforecast" && (
                          <span className="text-emerald-700 font-medium">
                            Underforecast
                          </span>
                        )}
                        {dir.direction === "exact" && (
                          <span className="text-slate-700">Exact</span>
                        )}
                        {dir.direction === "unmatched" && (
                          <span className="text-slate-400">
                            :30 Actual Only
                          </span>
                        )}
                        {row.is_largest_error && (
                          <span className="text-amber-800 font-semibold">
                            {" "}
                            · Peak Error
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {row.total_revisions > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              onInspectPeriodHistory(row.start_time)
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
                          >
                            <Clock className="w-3 h-3" />
                            <span>
                              History ({formatNumber(row.total_revisions)})
                            </span>
                          </button>
                        ) : (
                          <span className="text-slate-400">No :30 Pubs</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
