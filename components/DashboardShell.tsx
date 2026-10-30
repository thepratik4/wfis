"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import GlobalFilterBar from "@/components/GlobalFilterBar";
import OverviewView from "@/components/OverviewView";
import ForecastExplorerView from "@/components/ForecastExplorerView";
import AccuracyAnalysisView from "@/components/AccuracyAnalysisView";
import PublicationHistoryView from "@/components/PublicationHistoryView";
import DataQualityView from "@/components/DataQualityView";
import {
  fetchAccuracy,
  fetchDataQuality,
  fetchForecasts,
  fetchHealth,
  fetchOverview,
  fetchPublicationHistory,
  triggerDataRefresh,
} from "@/lib/api";
import type {
  AccuracyResponse,
  DataQualityResponse,
  ForecastsResponse,
  GlobalFilterState,
  HealthResponse,
  NavSection,
  OverviewResponse,
  PublicationHistoryResponse,
} from "@/lib/types";
import { validateFilterRange } from "@/lib/wind-utils";

const INITIAL_FILTERS: GlobalFilterState = {
  scopeMode: "range",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  deliveryDate: "2026-01-15",
  cutoffTime: "11:00",
  cutoffDaysBefore: 1,
  dataMode: "live",
};

const SECTION_LABELS: Record<NavSection, string> = {
  overview: "Overview",
  explorer: "Forecast Explorer",
  accuracy: "Accuracy Analysis",
  history: "Publication History",
  quality: "Data Quality",
};

export default function DashboardShell() {
  const [activeSection, setActiveSection] = useState<NavSection>("overview");
  const [filters, setFilters] = useState<GlobalFilterState>(INITIAL_FILTERS);
  const [explorerDate, setExplorerDate] = useState<string>("2026-01-15");
  const [selectedHistoryStart, setSelectedHistoryStart] = useState<string>(
    "2026-01-15T12:00:00Z"
  );

  // Backend data states
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [overviewData, setOverviewData] = useState<OverviewResponse | null>(null);
  const [forecastsData, setForecastsData] = useState<ForecastsResponse | null>(
    null
  );
  const [accuracyData, setAccuracyData] = useState<AccuracyResponse | null>(
    null
  );
  const [historyData, setHistoryData] =
    useState<PublicationHistoryResponse | null>(null);
  const [qualityData, setQualityData] = useState<DataQualityResponse | null>(
    null
  );

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshBanner, setRefreshBanner] = useState<string | null>(null);

  const handleUpdateFilters = useCallback(
    (patch: Partial<GlobalFilterState>) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch };
        if (patch.deliveryDate) {
          setExplorerDate(patch.deliveryDate);
        }
        return next;
      });
    },
    []
  );

  const loadActiveSectionData = useCallback(async () => {
    const validation = validateFilterRange(
      filters.startDate,
      filters.endDate,
      filters.cutoffTime
    );
    if (!validation.valid) {
      setErrorMessage(validation.error || "Invalid filter parameters.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const healthPromise = fetchHealth().catch(() => null);

      if (activeSection === "overview") {
        const [h, ov] = await Promise.all([
          healthPromise,
          fetchOverview(filters),
        ]);
        if (h) setHealth(h);
        setOverviewData(ov);
      } else if (activeSection === "explorer") {
        const targetDate =
          filters.scopeMode === "single_day"
            ? filters.deliveryDate
            : explorerDate;
        const [h, fc] = await Promise.all([
          healthPromise,
          fetchForecasts(filters, targetDate, false),
        ]);
        if (h) setHealth(h);
        setForecastsData(fc);
      } else if (activeSection === "accuracy") {
        const [h, acc] = await Promise.all([
          healthPromise,
          fetchAccuracy(filters),
        ]);
        if (h) setHealth(h);
        setAccuracyData(acc);
      } else if (activeSection === "history") {
        const [h, hist] = await Promise.all([
          healthPromise,
          fetchPublicationHistory(
            selectedHistoryStart,
            filters.cutoffTime,
            filters.cutoffDaysBefore,
            filters.dataMode
          ),
        ]);
        if (h) setHealth(h);
        setHistoryData(hist);
      } else if (activeSection === "quality") {
        const [h, dq] = await Promise.all([
          healthPromise,
          fetchDataQuality(filters),
        ]);
        if (h) setHealth(h);
        setQualityData(dq);
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to retrieve analytics from the Python FastAPI backend.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [
    activeSection,
    filters.scopeMode,
    filters.startDate,
    filters.endDate,
    filters.deliveryDate,
    filters.cutoffTime,
    filters.cutoffDaysBefore,
    filters.dataMode,
    explorerDate,
    selectedHistoryStart,
  ]);

  useEffect(() => {
    void loadActiveSectionData();
  }, [loadActiveSectionData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshBanner(null);
    setErrorMessage(null);
    try {
      const res = await triggerDataRefresh(filters.dataMode, true);
      setRefreshBanner(res.message);
      await loadActiveSectionData();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to refresh dataset."
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleNavigateFromOverview = (
    section: NavSection,
    deliveryDate?: string
  ) => {
    if (deliveryDate) {
      setExplorerDate(deliveryDate);
    }
    setActiveSection(section);
  };

  const handleInspectPeriodHistory = (startTimeIso: string) => {
    setSelectedHistoryStart(startTimeIso);
    setActiveSection("history");
  };

  const lastRefreshUtc =
    overviewData?.last_refresh_utc ||
    forecastsData?.last_refresh_utc ||
    accuracyData?.last_refresh_utc ||
    qualityData?.last_successful_refresh_utc ||
    health?.last_refresh_utc ||
    null;

  return (
    <SidebarProvider defaultOpen={true}>
      {/* Fixed Stagnant Sidebar Navigation */}
      <AppSidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        dataMode={filters.dataMode}
        cutoffTime={filters.cutoffTime}
        cutoffDaysBefore={filters.cutoffDaysBefore}
        backendVersion={health?.version}
      />

      {/* Main Scrollable Content Inset */}
      <SidebarInset>
        {/* Top Bar Contract: Zone 1 Breadcrumb & Sidebar Trigger — Zone 2 Quick Links — Zone 3 Primary Action */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <div className="text-sm font-medium text-slate-800 whitespace-nowrap shrink-0">
              <span className="text-slate-500">UK National Grid (BMRS)</span>
              <span className="mx-2 text-slate-300">/</span>
              <span className="font-semibold text-slate-900">
                {SECTION_LABELS[activeSection]}
              </span>
            </div>
          </div>

          <nav
            aria-label="Quick View Switcher"
            className="hidden xl:flex items-center gap-6 text-xs font-medium text-slate-600"
          >
            {(
              [
                "overview",
                "explorer",
                "accuracy",
                "history",
                "quality",
              ] as NavSection[]
            ).map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setActiveSection(sec)}
                className={`transition-colors whitespace-nowrap shrink-0 ${
                  activeSection === sec
                    ? "text-slate-900 underline underline-offset-4 font-semibold"
                    : "hover:text-slate-900"
                }`}
              >
                {SECTION_LABELS[sec]}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActiveSection("history")}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              Inspect Cutoff Revisions
            </button>
          </div>
        </header>

        {/* Global Procurement Filter Bar */}
        <GlobalFilterBar
          filters={filters}
          onUpdateFilters={handleUpdateFilters}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          lastRefreshUtc={lastRefreshUtc}
        />

        {/* Optional Refresh Confirmation Toast */}
        {refreshBanner && (
          <div className="mx-6 mt-4 px-4 py-2.5 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-900">
            <span>{refreshBanner}</span>
            <button
              type="button"
              onClick={() => setRefreshBanner(null)}
              className="font-medium underline ml-4 whitespace-nowrap"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Viewport Workspace */}
        <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto">
          {errorMessage ? (
            <div
              role="alert"
              className="bg-white border border-red-200 rounded-md p-6 max-w-2xl mx-auto my-8 space-y-3"
            >
              <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Unable to Load Wind Forecast Analytics</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {errorMessage}
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => void loadActiveSectionData()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Request</span>
                </button>
                {filters.dataMode === "live" && (
                  <button
                    type="button"
                    onClick={() => handleUpdateFilters({ dataMode: "sample" })}
                    className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                  >
                    Switch to Sample Data Mode
                  </button>
                )}
              </div>
            </div>
          ) : isLoading ? (
            /* Clean Skeleton Placeholder State */
            <div
              aria-busy="true"
              aria-label="Loading analytics data"
              className="space-y-6 animate-pulse"
            >
              <div className="h-7 w-80 bg-slate-200 rounded" />
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-28 bg-white border border-slate-200 rounded-md p-5 space-y-3"
                  >
                    <div className="h-3 w-32 bg-slate-200 rounded" />
                    <div className="h-7 w-24 bg-slate-200 rounded" />
                    <div className="h-3 w-40 bg-slate-100 rounded" />
                  </div>
                ))}
              </div>
              <div className="h-80 bg-white border border-slate-200 rounded-md p-5" />
            </div>
          ) : (
            <>
              {activeSection === "overview" && overviewData && (
                <OverviewView
                  data={overviewData}
                  onNavigate={handleNavigateFromOverview}
                />
              )}

              {activeSection === "explorer" && forecastsData && (
                <ForecastExplorerView
                  data={forecastsData}
                  selectedDate={
                    filters.scopeMode === "single_day"
                      ? filters.deliveryDate
                      : explorerDate
                  }
                  onSelectDate={(newDate) => {
                    setExplorerDate(newDate);
                    if (filters.scopeMode === "single_day") {
                      handleUpdateFilters({ deliveryDate: newDate });
                    }
                  }}
                  onInspectPeriodHistory={handleInspectPeriodHistory}
                />
              )}

              {activeSection === "accuracy" && accuracyData && (
                <AccuracyAnalysisView
                  data={accuracyData}
                  onInspectPeriodHistory={handleInspectPeriodHistory}
                />
              )}

              {activeSection === "history" && historyData && (
                <PublicationHistoryView
                  data={historyData}
                  selectedStartTime={selectedHistoryStart}
                  onChangeStartTime={setSelectedHistoryStart}
                />
              )}

              {activeSection === "quality" && qualityData && (
                <DataQualityView
                  data={qualityData}
                  onRefresh={handleRefresh}
                  isRefreshing={isRefreshing}
                />
              )}
            </>
          )}
        </main>

        {/* Quiet Footer */}
        <footer className="bg-white border-t border-slate-200 px-6 py-3 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
          <div>
            Wind Forecast Intelligence · UK Wholesale Day-Ahead Electricity
            Procurement Analytics (January 2026)
          </div>
          <div>
            Official Data Source: Elexon Insights Solution (BMRS) ·{" "}
            <code className="font-mono">FUELHH</code> &amp;{" "}
            <code className="font-mono">WINDFOR</code>
          </div>
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
