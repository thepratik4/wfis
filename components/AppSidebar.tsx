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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { DataMode, NavSection } from "@/lib/types";

export interface AppSidebarProps {
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

export function AppSidebar({
  activeSection,
  onSelectSection,
  dataMode,
  cutoffTime,
  cutoffDaysBefore,
  backendVersion,
}: AppSidebarProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-slate-800">
      {/* Sticky Header: Brand & Context */}
      <SidebarHeader className="border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
            <Wind className="w-4 h-4" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0 transition-opacity duration-200">
              <span className="block font-display text-sm font-semibold tracking-tight text-white truncate">
                Wind Forecast Intelligence
              </span>
              <span className="block text-xs text-slate-400 truncate">
                UK Day-Ahead Procurement
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      {/* Scrollable Center: Navigation Menu */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Analytics &amp; Procurement</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => onSelectSection(item.id)}
                      title={isCollapsed ? `${item.label} — ${item.subtitle}` : undefined}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive ? "text-emerald-400" : "text-slate-400"
                        }`}
                      />
                      {!isCollapsed && (
                        <div className="min-w-0 text-left">
                          <div className="text-sm leading-tight text-slate-100 font-medium">
                            {item.label}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 truncate">
                            {item.subtitle}
                          </div>
                        </div>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Stagnant Sticky Footer: Active Gate Closure Rule & Live Elexon Status */}
      {/* Stays fixed at the bottom of the viewport regardless of page height */}
      <SidebarFooter className="border-t border-slate-800">
        {!isCollapsed ? (
          <div className="p-3 rounded-md bg-slate-800/80 border border-slate-700/80 text-xs text-slate-300 space-y-2">
            <div className="flex items-center justify-between text-slate-200 font-medium">
              <span>Gate Closure Rule</span>
              <span className="font-mono tabular-nums text-emerald-400">
                {cutoffTime} UK · D-{cutoffDaysBefore}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Selects latest Elexon WINDFOR publication at or before cutoff; excludes
              intraday revisions.
            </p>
            <div className="pt-2 border-t border-slate-700/80 flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    dataMode === "live" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                  }`}
                />
                <span>
                  Mode:{" "}
                  <strong className="text-slate-200">
                    {dataMode === "live" ? "Live Elexon" : "Sample Data"}
                  </strong>
                </span>
              </span>
              {backendVersion && (
                <span className="font-mono tabular-nums text-[10px] text-slate-400">
                  v{backendVersion}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center p-1"
            title={`Mode: ${dataMode === "live" ? "Live Elexon" : "Sample Data"} (${cutoffTime} D-${cutoffDaysBefore})`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                dataMode === "live" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
          </div>
        )}
      </SidebarFooter>

      {/* Resize / Collapse Rail */}
      <SidebarRail />
    </Sidebar>
  );
}

