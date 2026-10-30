"use client";

import React from "react";
import {
  Activity,
  BarChart3,
  Clock,
  Compass,
  ShieldCheck,
  Wind,
} from "lucide-react";
import type { DataMode, NavSection } from "@/lib/types";

interface SidebarNavProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  dataMode: DataMode;
  cutoffTime: string;
  cutoffDaysBefore: number;
  backendVersion?: string;
}

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "overview",
    label: "Overview",
    subtitle: "Executive procurement KPIs",
    icon: BarChart3,
  },
  {
    id: "explorer",
    label: "Forecast Explorer",
    subtitle: "Half-hourly settlement table",
    icon: Compass,
  },
  {
    id: "accuracy",
    label: "Accuracy Analysis",
    subtitle: "Error distributions & bias",
    icon: Activity,
  },
  {
    id: "history",
    label: "Publication History",
    subtitle: "Revision audit at cutoff",
    icon: Clock,
  },
  {
    id: "quality",
    label: "Data Quality",
    subtitle: "Elexon schema & completeness",
    icon: ShieldCheck,
  },
];

export default function SidebarNav({
  activeSection,
  onSelectSection,
  dataMode,
  cutoffTime,
  cutoffDaysBefore,
  backendVersion,
}: SidebarNavProps) {
  return (
    <aside className="w-full lg:w-64 bg-slate-900 text-slate-100 shrink-0 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
      <div>
        {/* Brand Header */}
        <div className="px-5 py-5 border-b border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
            <Wind className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="block font-display text-sm font-semibold tracking-tight text-white truncate">
              Wind Forecast Intelligence
            </span>
            <span className="block text-xs text-slate-400 truncate">
              UK Day-Ahead Procurement
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav
          aria-label="Primary Analytics Navigation"
          className="p-3 flex lg:flex-col gap-1 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors whitespace-nowrap lg:whitespace-normal shrink-0 ${
                  isActive
                    ? "bg-slate-800 text-white font-medium border border-slate-700"
                    : "text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? "text-emerald-400" : "text-slate-400"
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-sm leading-tight whitespace-nowrap">
                    {item.label}
                  </div>
                  <div className="hidden lg:block text-xs text-slate-400 mt-0.5 truncate">
                    {item.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Procurement Rule Context */}
      <div className="hidden lg:block p-4 m-3 rounded-md bg-slate-800/70 border border-slate-700/80 text-xs text-slate-300 space-y-2">
        <div className="font-medium text-slate-200">Active Gate Closure Rule</div>
        <div className="font-mono tabular-nums text-emerald-400">
          {cutoffTime} UK · D-{cutoffDaysBefore}
        </div>
        <p className="text-slate-400 leading-relaxed">
          Selects latest Elexon WINDFOR publication at or before cutoff; excludes
          intraday revisions.
        </p>
        <div className="pt-2 border-t border-slate-700/80 flex items-center justify-between text-slate-400">
          <span>
            Mode:{" "}
            <strong className="text-slate-200">
              {dataMode === "live" ? "Live Elexon" : "Sample Data"}
            </strong>
          </span>
          {backendVersion && (
            <span className="font-mono tabular-nums">v{backendVersion}</span>
          )}
        </div>
      </div>
    </aside>
  );
}
