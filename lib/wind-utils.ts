import type { ForecastRecordRow } from "./types";

export function formatMW(
  value: number | null | undefined,
  decimals = 0
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} MW`;
}

export function formatSignedMW(
  value: number | null | undefined,
  decimals = 0
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} MW`;
}

export function formatNumber(
  value: number | null | undefined,
  decimals = 0
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatShortTimestamp(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  // Expected YYYY-MM-DDTHH:MM:SSZ -> Jan 15, 12:00 UTC
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(isoString);
  if (!match) return isoString;
  const [, , month, day, hour, minute] = match;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const mIdx = Math.max(0, Math.min(11, parseInt(month, 10) - 1));
  return `${months[mIdx]} ${parseInt(day, 10)}, ${hour}:${minute}Z`;
}

export function formatTimeHHMM(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  const match = /T(\d{2}:\d{2})/.exec(isoString);
  return match ? `${match[1]}Z` : isoString;
}

export function classifyErrorDirection(
  signedErrorMw: number | null | undefined
): {
  label: string;
  direction: "overforecast" | "underforecast" | "exact" | "unmatched";
} {
  if (signedErrorMw === null || signedErrorMw === undefined) {
    return { label: "Unmatched (:30 Actual)", direction: "unmatched" };
  }
  if (signedErrorMw > 0) {
    return { label: "Overforecast", direction: "overforecast" };
  }
  if (signedErrorMw < 0) {
    return { label: "Underforecast", direction: "underforecast" };
  }
  return { label: "Exact Match", direction: "exact" };
}

export function validateFilterRange(
  startDate: string,
  endDate: string,
  cutoffTime: string
): { valid: boolean; error?: string } {
  const minDate = "2026-01-01";
  const maxDate = "2026-01-31";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { valid: false, error: "Dates must use YYYY-MM-DD format." };
  }
  if (startDate < minDate || endDate > maxDate) {
    return {
      valid: false,
      error: "Analysis range must be within January 2026 (2026-01-01 to 2026-01-31).",
    };
  }
  if (endDate < startDate) {
    return {
      valid: false,
      error: "End date must be on or after start date.",
    };
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoffTime)) {
    return {
      valid: false,
      error: "Cutoff time must be a valid 24-hour HH:MM string.",
    };
  }
  return { valid: true };
}

export type ExplorerRowFilter = "all" | "matched" | "largest_errors";
export type ExplorerSortField =
  | "start_time"
  | "abs_error_mw"
  | "signed_error_mw"
  | "actual_generation_mw"
  | "forecast_generation_mw";

export function filterAndSortForecastRows(
  rows: ForecastRecordRow[],
  rowFilter: ExplorerRowFilter,
  searchQuery: string,
  sortField: ExplorerSortField = "start_time",
  sortDesc = false
): ForecastRecordRow[] {
  const q = searchQuery.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (rowFilter === "matched" && row.status !== "matched") {
      return false;
    }
    if (rowFilter === "largest_errors" && !row.is_largest_error) {
      return false;
    }
    if (q) {
      const hay = `${row.start_time} ${row.uk_local_time} SP${row.settlement_period} ${row.status}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === "start_time") {
      cmp = a.start_time.localeCompare(b.start_time);
    } else {
      const va = a[sortField];
      const vb = b[sortField];
      if (va === null && vb === null) cmp = 0;
      else if (va === null) cmp = -1;
      else if (vb === null) cmp = 1;
      else cmp = va - vb;
    }
    return sortDesc ? -cmp : cmp;
  });
}

function escapeCsvCell(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildForecastsCsv(rows: ForecastRecordRow[]): string {
  const headers = [
    "start_time_utc",
    "uk_local_time",
    "settlement_date",
    "settlement_period",
    "forecast_generation_mw",
    "actual_generation_mw",
    "signed_error_mw",
    "abs_error_mw",
    "selected_publish_time_utc",
    "decision_cutoff_utc",
    "publication_age_hours",
    "total_revisions",
    "eligible_revisions",
    "post_cutoff_revisions_excluded",
    "status",
    "is_largest_error",
  ];

  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        escapeCsvCell(r.start_time),
        escapeCsvCell(r.uk_local_time),
        escapeCsvCell(r.settlement_date),
        escapeCsvCell(r.settlement_period),
        escapeCsvCell(r.forecast_generation_mw),
        escapeCsvCell(r.actual_generation_mw),
        escapeCsvCell(r.signed_error_mw),
        escapeCsvCell(r.abs_error_mw),
        escapeCsvCell(r.publish_time),
        escapeCsvCell(r.cutoff_time),
        escapeCsvCell(r.publication_age_hours),
        escapeCsvCell(r.total_revisions),
        escapeCsvCell(r.eligible_revisions),
        escapeCsvCell(r.post_cutoff_revisions_excluded),
        escapeCsvCell(r.status),
        escapeCsvCell(r.is_largest_error),
      ].join(",")
    );
  }
  return lines.join("\n");
}
