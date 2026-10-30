import type {
  AccuracyResponse,
  DataMode,
  DataQualityResponse,
  ForecastsResponse,
  GlobalFilterState,
  HealthResponse,
  OverviewResponse,
  PublicationHistoryResponse,
  RefreshResponse,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

function buildQueryParams(filters: GlobalFilterState, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (filters.scopeMode === "single_day") {
    params.set("start_date", filters.deliveryDate);
    params.set("end_date", filters.deliveryDate);
    params.set("delivery_date", filters.deliveryDate);
  } else {
    params.set("start_date", filters.startDate);
    params.set("end_date", filters.endDate);
  }
  params.set("cutoff_time", filters.cutoffTime);
  params.set("cutoff_days_before", String(filters.cutoffDaysBefore));
  params.set("data_mode", filters.dataMode);

  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      params.set(k, v);
    }
  }
  return params.toString();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody && typeof errBody.detail === "string") {
        errorDetail = errBody.detail;
      }
    } catch {
      // fallback
    }
    throw new Error(errorDetail);
  }

  return res.json() as Promise<T>;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>(`${API_BASE}/health`);
}

export async function fetchOverview(
  filters: GlobalFilterState
): Promise<OverviewResponse> {
  const qs = buildQueryParams(filters);
  return fetchJson<OverviewResponse>(`${API_BASE}/overview?${qs}`);
}

export async function fetchForecasts(
  filters: GlobalFilterState,
  overrideDeliveryDate?: string,
  onlyMatched = false
): Promise<ForecastsResponse> {
  const effectiveFilters: GlobalFilterState = overrideDeliveryDate
    ? {
        ...filters,
        scopeMode: "single_day",
        deliveryDate: overrideDeliveryDate,
      }
    : filters;

  const qs = buildQueryParams(effectiveFilters, {
    only_matched: String(onlyMatched),
  });
  return fetchJson<ForecastsResponse>(`${API_BASE}/forecasts?${qs}`);
}

export async function fetchAccuracy(
  filters: GlobalFilterState
): Promise<AccuracyResponse> {
  const qs = buildQueryParams(filters);
  return fetchJson<AccuracyResponse>(`${API_BASE}/accuracy?${qs}`);
}

export async function fetchPublicationHistory(
  startTimeIso: string,
  cutoffTime: string,
  cutoffDaysBefore: number,
  dataMode: DataMode
): Promise<PublicationHistoryResponse> {
  const params = new URLSearchParams({
    cutoff_time: cutoffTime,
    cutoff_days_before: String(cutoffDaysBefore),
    data_mode: dataMode,
  });
  const encodedStart = encodeURIComponent(startTimeIso);
  return fetchJson<PublicationHistoryResponse>(
    `${API_BASE}/forecasts/${encodedStart}/history?${params.toString()}`
  );
}

export async function fetchDataQuality(
  filters: GlobalFilterState
): Promise<DataQualityResponse> {
  const params = new URLSearchParams({
    start_date:
      filters.scopeMode === "single_day" ? filters.deliveryDate : filters.startDate,
    end_date:
      filters.scopeMode === "single_day" ? filters.deliveryDate : filters.endDate,
    cutoff_time: filters.cutoffTime,
    cutoff_days_before: String(filters.cutoffDaysBefore),
    data_mode: filters.dataMode,
  });
  return fetchJson<DataQualityResponse>(`${API_BASE}/data-quality?${params.toString()}`);
}

export async function triggerDataRefresh(
  dataMode: DataMode,
  force = true
): Promise<RefreshResponse> {
  return fetchJson<RefreshResponse>(`${API_BASE}/refresh`, {
    method: "POST",
    body: JSON.stringify({ data_mode: dataMode, force }),
  });
}
