"use client";

import React from "react";
import { Calendar, Clock, Database, RefreshCw, AlertTriangle } from "lucide-react";
import type { DataMode, GlobalFilterState } from "@/lib/types";
import { formatShortTimestamp } from "@/lib/wind-utils";

interface GlobalFilterBarProps {
  filters: GlobalFilterState;
  onUpdateFilters: (patch: Partial<GlobalFilterState>) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  lastRefreshUtc: string | null;
}

const CUTOFF_PRESETS = [
  { label: "06:00 (Early Desk)", value: "06:00" },
  { label: "09:30 (Morning Run)", value: "09:30" },
  { label: "11:00 (Day-Ahead Auction Gate)", value: "11:00" },
  { label: "15:30 (Afternoon Run)", value: "15:30" },
  { label: "18:00 (Evening Desk)", value: "18:00" },
  { label: "22:30 (Late D-1 Run)", value: "22:30" },
];

export default function GlobalFilterBar({
  filters,
  onUpdateFilters,
  onRefresh,
  isRefreshing,
  lastRefreshUtc,
}: GlobalFilterBarProps) {
  const applyPresetRange = (start: string, end: string) => {
    onUpdateFilters({
      scopeMode: "range",
      startDate: start,
      endDate: end,
    });
  };

  return (
    <section
      aria-label="Global Procurement Filters"
      className="bg-white border-b border-slate-200 px-6 py-3.5"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        {/* Left & Center Filter Controls */}
        <div className="flex flex-wrap items-end gap-4">
          {/* Scope Selector: Date Range vs Delivery Date */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Analysis Window Scope
            </label>
            <div className="inline-flex rounded-md bg-slate-100 p-0.5 border border-slate-200">
              <button
                type="button"
                onClick={() => onUpdateFilters({ scopeMode: "range" })}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  filters.scopeMode === "range"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Date Range
              </button>
              <button
                type="button"
                onClick={() => onUpdateFilters({ scopeMode: "single_day" })}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  filters.scopeMode === "single_day"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Single Delivery Date
              </button>
            </div>
          </div>

          {/* Date Range or Single Delivery Date Inputs (Restricted to Jan 2026) */}
          {filters.scopeMode === "range" ? (
            <div className="flex items-end gap-2">
              <div>
                <label
                  htmlFor="filter-start-date"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  From (Jan 2026)
                </label>
                <div className="relative">
                  <input
                    id="filter-start-date"
                    type="date"
                    min="2026-01-01"
                    max={filters.endDate}
                    value={filters.startDate}
                    onChange={(e) =>
                      onUpdateFilters({
                        startDate: e.target.value || "2026-01-01",
                      })
                    }
                    className="px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="filter-end-date"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  To (Jan 2026)
                </label>
                <input
                  id="filter-end-date"
                  type="date"
                  min={filters.startDate}
                  max="2026-01-31"
                  value={filters.endDate}
                  onChange={(e) =>
                    onUpdateFilters({
                      endDate: e.target.value || "2026-01-31",
                    })
                  }
                  className="px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div className="hidden xl:flex items-center gap-1 pb-0.5">
                <button
                  type="button"
                  onClick={() => applyPresetRange("2026-01-01", "2026-01-31")}
                  className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded border border-slate-200 whitespace-nowrap shrink-0"
                >
                  Full Jan
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetRange("2026-01-01", "2026-01-07")}
                  className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded border border-slate-200 whitespace-nowrap shrink-0"
                >
                  Jan 1–7
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetRange("2026-01-15", "2026-01-21")}
                  className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded border border-slate-200 whitespace-nowrap shrink-0"
                >
                  Jan 15–21
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label
                htmlFor="filter-delivery-date"
                className="block text-xs font-medium text-slate-600 mb-1"
              >
                Delivery Settlement Date
              </label>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <input
                  id="filter-delivery-date"
                  type="date"
                  min="2026-01-01"
                  max="2026-01-31"
                  value={filters.deliveryDate}
                  onChange={(e) =>
                    onUpdateFilters({
                      deliveryDate: e.target.value || "2026-01-15",
                    })
                  }
                  className="px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
          )}

          {/* Decision Cutoff Time & Day Offset */}
          <div className="flex items-end gap-2">
            <div>
              <label
                htmlFor="filter-cutoff-time"
                className="block text-xs font-medium text-slate-600 mb-1"
              >
                Decision Cutoff (UK Local)
              </label>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <select
                  id="filter-cutoff-time"
                  value={filters.cutoffTime}
                  onChange={(e) =>
                    onUpdateFilters({ cutoffTime: e.target.value })
                  }
                  className="px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {CUTOFF_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="filter-cutoff-days"
                className="block text-xs font-medium text-slate-600 mb-1"
              >
                Cutoff Horizon
              </label>
              <select
                id="filter-cutoff-days"
                value={filters.cutoffDaysBefore}
                onChange={(e) =>
                  onUpdateFilters({
                    cutoffDaysBefore: parseInt(e.target.value, 10),
                  })
                }
                className="px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value={1}>D-1 (Day-Ahead)</option>
                <option value={2}>D-2 (48h Ahead)</option>
                <option value={0}>D-0 (Delivery Day)</option>
              </select>
            </div>
          </div>

          {/* Data Mode Selector */}
          <div>
            <label
              htmlFor="filter-data-mode"
              className="block text-xs font-medium text-slate-600 mb-1"
            >
              Data Source Mode
            </label>
            <div className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                id="filter-data-mode"
                value={filters.dataMode}
                onChange={(e) =>
                  onUpdateFilters({ dataMode: e.target.value as DataMode })
                }
                className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="live">Live Elexon BMRS API</option>
                <option value="sample">Sample Data (Synthetic Sandbox)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Right: Refresh Action & Timestamp */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-slate-500">Last Verified Refresh</div>
            <div className="text-xs font-mono tabular-nums text-slate-800">
              {formatShortTimestamp(lastRefreshUtc)}
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
            <span>{isRefreshing ? "Refreshing..." : "Refresh Data"}</span>
          </button>
        </div>
      </div>

      {/* Explicit Warning Banner when Sample Data Mode is active */}
      {filters.dataMode === "sample" && (
        <div
          role="status"
          className="mt-3 px-3.5 py-2 rounded-md bg-amber-50 border border-amber-200 flex items-center justify-between gap-3 text-xs text-amber-900"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>Synthetic Sample Data Mode Active:</strong> Displaying
              deterministic sandbox records for offline validation. Do not treat
              these values as real Elexon market findings.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onUpdateFilters({ dataMode: "live" })}
            className="px-2.5 py-1 text-xs font-medium bg-amber-900 text-white rounded hover:bg-amber-800 whitespace-nowrap shrink-0"
          >
            Switch to Live Elexon Data
          </button>
        </div>
      )}
    </section>
  );
}
