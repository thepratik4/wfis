import test from "node:test";
import assert from "node:assert/strict";
import {
  buildForecastsCsv,
  classifyErrorDirection,
  filterAndSortForecastRows,
  formatMW,
  formatShortTimestamp,
  formatSignedMW,
  validateFilterRange,
} from "./wind-utils";
import type { ForecastRecordRow } from "./types";

const SAMPLE_ROWS: ForecastRecordRow[] = [
  {
    start_time: "2026-01-15T00:00:00Z",
    uk_local_time: "2026-01-15 00:00 GMT",
    settlement_date: "2026-01-15",
    settlement_period: 1,
    forecast_generation_mw: 13200,
    actual_generation_mw: 11400,
    signed_error_mw: 1800,
    abs_error_mw: 1800,
    publish_time: "2026-01-14T09:30:00Z",
    cutoff_time: "2026-01-14T11:00:00Z",
    publication_age_hours: 1.5,
    total_revisions: 24,
    eligible_revisions: 11,
    post_cutoff_revisions_excluded: 13,
    status: "matched",
    is_largest_error: true,
  },
  {
    start_time: "2026-01-15T00:30:00Z",
    uk_local_time: "2026-01-15 00:30 GMT",
    settlement_date: "2026-01-15",
    settlement_period: 2,
    forecast_generation_mw: null,
    actual_generation_mw: 11520,
    signed_error_mw: null,
    abs_error_mw: null,
    publish_time: null,
    cutoff_time: "2026-01-14T11:00:00Z",
    publication_age_hours: null,
    total_revisions: 0,
    eligible_revisions: 0,
    post_cutoff_revisions_excluded: 0,
    status: "unmatched_actual_half_hour",
    is_largest_error: false,
  },
  {
    start_time: "2026-01-15T01:00:00Z",
    uk_local_time: "2026-01-15 01:00 GMT",
    settlement_date: "2026-01-15",
    settlement_period: 3,
    forecast_generation_mw: 10900,
    actual_generation_mw: 11300,
    signed_error_mw: -400,
    abs_error_mw: 400,
    publish_time: "2026-01-14T09:30:00Z",
    cutoff_time: "2026-01-14T11:00:00Z",
    publication_age_hours: 1.5,
    total_revisions: 24,
    eligible_revisions: 11,
    post_cutoff_revisions_excluded: 13,
    status: "matched",
    is_largest_error: false,
  },
];

test("formatMW and formatSignedMW format numeric and null values accurately", () => {
  assert.equal(formatMW(13421.4, 1), "13,421.4 MW");
  assert.equal(formatMW(null), "—");
  assert.equal(formatSignedMW(1839.9, 1), "+1,839.9 MW");
  assert.equal(formatSignedMW(-420, 0), "-420 MW");
  assert.equal(formatSignedMW(undefined), "—");
});

test("classifyErrorDirection distinguishes overforecast, underforecast, and unmatched records", () => {
  assert.equal(classifyErrorDirection(500).direction, "overforecast");
  assert.equal(classifyErrorDirection(-250).direction, "underforecast");
  assert.equal(classifyErrorDirection(0).direction, "exact");
  assert.equal(classifyErrorDirection(null).direction, "unmatched");
});

test("validateFilterRange enforces January 2026 scope and HH:MM cutoff format", () => {
  assert.equal(validateFilterRange("2026-01-01", "2026-01-31", "11:00").valid, true);
  assert.equal(validateFilterRange("2026-01-20", "2026-01-10", "11:00").valid, false);
  assert.equal(validateFilterRange("2026-02-01", "2026-02-05", "11:00").valid, false);
  assert.equal(validateFilterRange("2026-01-01", "2026-01-31", "25:00").valid, false);
});

test("filterAndSortForecastRows filters matched and largest_errors and sorts by abs_error_mw", () => {
  const matchedOnly = filterAndSortForecastRows(SAMPLE_ROWS, "matched", "");
  assert.equal(matchedOnly.length, 2);

  const largestOnly = filterAndSortForecastRows(SAMPLE_ROWS, "largest_errors", "");
  assert.equal(largestOnly.length, 1);
  assert.equal(largestOnly[0].start_time, "2026-01-15T00:00:00Z");

  const sortedByAbsDesc = filterAndSortForecastRows(
    SAMPLE_ROWS,
    "matched",
    "",
    "abs_error_mw",
    true
  );
  assert.equal(sortedByAbsDesc[0].abs_error_mw, 1800);
  assert.equal(sortedByAbsDesc[1].abs_error_mw, 400);
});

test("buildForecastsCsv produces valid CSV with header and data rows", () => {
  const csv = buildForecastsCsv(SAMPLE_ROWS);
  const lines = csv.split("\n");
  assert.equal(lines.length, 4);
  assert.ok(lines[0].startsWith("start_time_utc,uk_local_time,settlement_date"));
  assert.ok(lines[1].includes("2026-01-15T00:00:00Z"));
  assert.ok(lines[2].includes("unmatched_actual_half_hour"));
});

test("formatShortTimestamp formats UTC ISO string concisely", () => {
  assert.equal(formatShortTimestamp("2026-01-15T12:00:00Z"), "Jan 15, 12:00Z");
  assert.equal(formatShortTimestamp(null), "—");
});
