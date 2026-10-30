"use client";

import React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { PublicationHistoryResponse } from "@/lib/types";
import {
  formatMW,
  formatNumber,
  formatShortTimestamp,
  formatSignedMW,
} from "@/lib/wind-utils";

interface PublicationHistoryViewProps {
  data: PublicationHistoryResponse;
  selectedStartTime: string;
  onChangeStartTime: (newStartTimeIso: string) => void;
}

const HOURLY_SLOTS = Array.from({ length: 24 }, (_, h) => {
  const hh = String(h).padStart(2, "0");
  return `${hh}:00:00Z`;
});

export default function PublicationHistoryView({
  data,
  selectedStartTime,
  onChangeStartTime,
}: PublicationHistoryViewProps) {
  const currentDatePart = selectedStartTime.slice(0, 10) || "2026-01-15";
  const currentTimePart = selectedStartTime.slice(11) || "12:00:00Z";

  const handleDateChange = (newDate: string) => {
    if (!newDate) return;
    onChangeStartTime(`${newDate}T${currentTimePart}`);
  };

  const handleHourChange = (newHourPart: string) => {
    onChangeStartTime(`${currentDatePart}T${newHourPart}`);
  };

  return (
    <div className="space-y-6">
      {/* Header & Delivery Period Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900">
            Forecast Publication History &amp; Cutoff Eligibility Audit
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>
              Delivery Period:{" "}
              <strong className="font-mono tabular-nums text-slate-900">
                {data.start_time}
              </strong>{" "}
              ({data.uk_local_time}, SP{data.settlement_period})
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Decision Cutoff:{" "}
              <strong className="font-mono tabular-nums text-slate-900">
                {data.decision_cutoff_timestamp}
              </strong>
            </span>
          </div>
        </div>

        {/* Delivery Date & Delivery Hour Selector */}
        <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-md px-3.5 py-2">
          <div>
            <label
              htmlFor="history-date-picker"
              className="block text-[11px] font-medium text-slate-500"
            >
              Delivery Date (Jan 2026)
            </label>
            <input
              id="history-date-picker"
              type="date"
              min="2026-01-01"
              max="2026-01-31"
              value={currentDatePart}
              onChange={(e) => handleDateChange(e.target.value)}
              className="mt-0.5 px-2 py-1 text-xs font-mono tabular-nums bg-slate-50 border border-slate-300 rounded text-slate-900"
            />
          </div>

          <div>
            <label
              htmlFor="history-hour-picker"
              className="block text-[11px] font-medium text-slate-500"
            >
              Delivery Period (UTC)
            </label>
            <select
              id="history-hour-picker"
              value={currentTimePart}
              onChange={(e) => handleHourChange(e.target.value)}
              className="mt-0.5 px-2 py-1 text-xs font-mono tabular-nums bg-slate-50 border border-slate-300 rounded text-slate-900"
            >
              {HOURLY_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot.slice(0, 5)} UTC (Hourly Forecast)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Audit Cards for Selected Delivery Period */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="text-xs font-medium text-slate-500">
            Selected Forecast at Cutoff
          </div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-amber-700">
            {formatMW(data.selected_forecast?.forecast_generation_mw, 0)}
          </div>
          <div className="mt-2 text-xs text-slate-600 font-mono tabular-nums">
            Published:{" "}
            {formatShortTimestamp(data.selected_forecast?.publish_time)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="text-xs font-medium text-slate-500">
            Actual Generation (FUELHH WIND)
          </div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-emerald-700">
            {formatMW(data.actual_generation_mw, 0)}
          </div>
          <div className="mt-2 text-xs text-slate-600 font-mono tabular-nums">
            Cutoff Error:{" "}
            {formatSignedMW(
              data.selected_forecast?.signed_error_vs_actual_mw,
              0
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="text-xs font-medium text-slate-500">
            Latest Post-Cutoff Revision
          </div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-slate-900">
            {formatMW(data.latest_overall_forecast?.forecast_generation_mw, 0)}
          </div>
          <div className="mt-2 text-xs text-slate-600 font-mono tabular-nums">
            Published:{" "}
            {formatShortTimestamp(data.latest_overall_forecast?.publish_time)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="text-xs font-medium text-slate-500">
            Publication Eligibility Split
          </div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-slate-900">
            {formatNumber(data.eligible_publications_count)} eligible{" "}
            <span className="text-sm font-normal text-slate-500">
              / {formatNumber(data.total_publications)} total
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-600 font-mono tabular-nums">
            {formatNumber(data.excluded_post_cutoff_count)} post-cutoff
            revisions excluded
          </div>
        </div>
      </div>

      {/* Audit Note */}
      <div className="bg-white border border-slate-200 rounded-md px-4 py-3 text-xs text-slate-700 flex items-center justify-between gap-4">
        <div>
          <strong className="text-slate-900">Selection Audit Summary:</strong>{" "}
          {data.note}
        </div>
      </div>

      {/* Forecast Revision Trajectory Chart */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <div className="mb-4">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Chronological Forecast Evolution Across Publications (MW)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Shows how Elexon WINDFOR forecast publications evolved as the
            delivery period approached, compared against the decision cutoff and
            final metered FUELHH actual generation.
          </p>
        </div>

        {data.publications.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded">
            No forecast publications available for {data.start_time}.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.publications}
                margin={{ top: 15, right: 25, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis
                  dataKey="publish_time"
                  tickFormatter={(val: string) => formatShortTimestamp(val)}
                  tick={{ fontSize: 11, fill: "#475569" }}
                  minTickGap={30}
                />
                <YAxis
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`}
                  tick={{ fontSize: 11, fill: "#475569" }}
                  width={48}
                  domain={["auto", "auto"]}
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
                    `Published: ${formatShortTimestamp(String(label))}`
                  }
                  formatter={(value: unknown, _name: unknown, item: { payload?: { selection_status?: string } }) => {
                    const statusLabel =
                      item?.payload?.selection_status === "selected_at_cutoff"
                        ? "SELECTED AT CUTOFF"
                        : item?.payload?.selection_status ===
                          "eligible_superseded"
                        ? "Eligible (Superseded)"
                        : "Excluded (Post-Cutoff)";
                    return [
                      `${formatMW(
                        typeof value === "number" ? value : Number(value),
                        0
                      )} [${statusLabel}]`,
                      "Forecast Generation",
                    ];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "6px" }} />
                {data.actual_generation_mw !== null && (
                  <ReferenceLine
                    y={data.actual_generation_mw}
                    stroke="#0F766E"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    label={{
                      value: `Actual: ${formatMW(data.actual_generation_mw, 0)}`,
                      position: "insideTopRight",
                      fill: "#0F766E",
                      fontSize: 11,
                    }}
                  />
                )}
                {data.selected_forecast && (
                  <ReferenceLine
                    x={data.selected_forecast.publish_time}
                    stroke="#D97706"
                    strokeWidth={2}
                    label={{
                      value: "Selected at Cutoff",
                      position: "insideTopLeft",
                      fill: "#D97706",
                      fontSize: 11,
                    }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="forecast_generation_mw"
                  name="WINDFOR Publication Revision (MW)"
                  stroke="#0F172A"
                  strokeWidth={2}
                  dot={(props: {
                    cx?: number;
                    cy?: number;
                    payload?: {
                      publish_time?: string;
                      is_selected_for_procurement?: boolean;
                      is_eligible_at_cutoff?: boolean;
                    };
                  }) => {
                    const { cx, cy, payload } = props;
                    if (cx === undefined || cy === undefined || !payload) {
                      return <svg key="empty" />;
                    }
                    if (payload.is_selected_for_procurement) {
                      return (
                        <circle
                          key={payload.publish_time}
                          cx={cx}
                          cy={cy}
                          r={6}
                          fill="#D97706"
                          stroke="#FFFFFF"
                          strokeWidth={2}
                        />
                      );
                    }
                    return (
                      <circle
                        key={payload.publish_time}
                        cx={cx}
                        cy={cy}
                        r={3.5}
                        fill={
                          payload.is_eligible_at_cutoff ? "#0F172A" : "#94A3B8"
                        }
                      />
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Chronological Publication Revisions Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Chronological Forecast Revisions ({data.publications.length}{" "}
              Publications)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ordered from earliest initial forecast run to final intraday
              publication.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">publishTime (UTC)</th>
                <th className="py-2.5 px-3">UK Local Time</th>
                <th className="py-2.5 px-3 text-right">Forecast (MW)</th>
                <th className="py-2.5 px-3 text-right">Revision Δ</th>
                <th className="py-2.5 px-3 text-right">Lead Before Delivery</th>
                <th className="py-2.5 px-3 text-right">Relative to Cutoff</th>
                <th className="py-2.5 px-3">Cutoff Eligibility Status</th>
                <th className="py-2.5 px-3 text-right">Error vs Actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.publications.map((pub, idx) => {
                const isSelected = pub.is_selected_for_procurement;
                const isEligible = pub.is_eligible_at_cutoff;

                return (
                  <tr
                    key={pub.publish_time}
                    className={`transition-colors ${
                      isSelected
                        ? "bg-amber-50/90 font-medium"
                        : isEligible
                        ? "hover:bg-slate-50"
                        : "bg-slate-50/50 text-slate-500 hover:bg-slate-100/60"
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-slate-900 whitespace-nowrap">
                      {pub.publish_time}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                      {pub.publish_uk_local_time}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                      {formatMW(pub.forecast_generation_mw, 0)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {pub.revision_delta_mw !== null
                        ? formatSignedMW(pub.revision_delta_mw, 0)
                        : "Initial"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {pub.lead_time_hours}h ahead
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {pub.delta_from_cutoff_hours >= 0
                        ? `${pub.delta_from_cutoff_hours}h before cutoff`
                        : `${Math.abs(pub.delta_from_cutoff_hours)}h after cutoff`}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span>Selected for Day-Ahead Procurement</span>
                        </span>
                      ) : isEligible ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-700">
                          <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>Eligible · Superseded by Later Run</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-slate-500">
                          <XCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>Excluded · Published After Cutoff</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {formatSignedMW(pub.signed_error_vs_actual_mw, 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
