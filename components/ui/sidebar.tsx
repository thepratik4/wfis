"use client";

import * as React from "react";
import { PanelLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3.5rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarContextType = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean | ((value: boolean) => boolean)) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean | ((value: boolean) => boolean)) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextType | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);

  // Uncontrolled open state
  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp !== undefined ? openProp : _open;

  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }
      // Save state in cookie for persistent layout
      if (typeof document !== "undefined") {
        document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;
      }
    },
    [setOpenProp, open]
  );

  const toggleSidebar = React.useCallback(() => {
    return isMobile
      ? setOpenMobile((open) => !open)
      : setOpen((open) => !open);
  }, [isMobile, setOpen, setOpenMobile]);

  // Keyboard shortcut Ctrl+B / Cmd+B to toggle sidebar
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const state = open ? "expanded" : "collapsed";

  const contextValue = React.useMemo<SidebarContextType>(
    () => ({
      state,
      open,
      setOpen,
      isMobile: !!isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "group/sidebar-wrapper flex min-h-screen w-full has-[[data-variant=inset]]:bg-slate-50",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "icon",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (collapsible === "none") {
    return (
      <div
        className={cn(
          "flex h-screen w-(--sidebar-width) flex-col bg-slate-900 text-slate-100 shrink-0 border-r border-slate-800 sticky top-0",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  // Mobile Drawer
  if (isMobile) {
    if (!openMobile) return null;
    return (
      <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
          onClick={() => setOpenMobile(false)}
        />
        {/* Drawer Content */}
        <div
          className={cn(
            "relative flex h-full w-(--sidebar-width) max-w-[85vw] flex-col bg-slate-900 text-slate-100 shadow-2xl z-10 border-r border-slate-800",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </div>
    );
  }

  // Desktop Stationary Fixed Sidebar
  return (
    <div
      className="group peer hidden md:block text-slate-100 shrink-0"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
    >
      {/* Invisible anchor spacer to preserve layout flow without shifting */}
      <div
        className={cn(
          "duration-200 relative h-screen bg-transparent transition-[width] ease-linear shrink-0",
          state === "expanded" ? "w-(--sidebar-width)" : "w-(--sidebar-width-icon)"
        )}
      />

      {/* Fixed Stagnant Sidebar: Remains docked to viewport top-to-bottom while page scrolls */}
      <div
        className={cn(
          "duration-200 fixed inset-y-0 z-30 flex h-screen flex-col bg-slate-900 border-r border-slate-800 transition-[width,left,right] ease-linear overflow-hidden",
          side === "left" ? "left-0" : "right-0",
          state === "expanded" ? "w-(--sidebar-width)" : "w-(--sidebar-width-icon)",
          variant === "floating" && "m-2 h-[calc(100vh-1rem)] rounded-lg border",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          className="flex h-full w-full flex-col bg-slate-900 text-slate-100"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function SidebarHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-3.5 border-b border-slate-800 shrink-0", className)}
      {...props}
    />
  );
}

export function SidebarContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2 scrollbar-thin scrollbar-thumb-slate-700",
        className
      )}
      {...props}
    />
  );
}

export function SidebarGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-1.5", className)}
      {...props}
    />
  );
}

export function SidebarGroupLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { state } = useSidebar();
  if (state === "collapsed") {
    return null;
  }
  return (
    <div
      data-sidebar="group-label"
      className={cn(
        "flex h-7 shrink-0 items-center px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 select-none",
        className
      )}
      {...props}
    />
  );
}

export function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  );
}

export function SidebarMenu({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1 list-none p-0 m-0", className)}
      {...props}
    />
  );
}

export function SidebarMenuItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-sidebar="menu-item"
      className={cn("relative list-none", className)}
      {...props}
    />
  );
}

export function SidebarMenuButton({
  isActive = false,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  isActive?: boolean;
}) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <button
      data-sidebar="menu-button"
      data-active={isActive}
      className={cn(
        "group/menu-button flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors outline-none",
        isCollapsed ? "justify-center px-2" : "justify-start",
        isActive
          ? "bg-slate-800 text-white font-medium shadow-xs border border-slate-700"
          : "text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SidebarFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-sidebar="footer"
      className={cn(
        "flex flex-col gap-2 p-3 mt-auto border-t border-slate-800 shrink-0 bg-slate-900/95",
        className
      )}
      {...props}
    />
  );
}

export function SidebarRail({
  className,
  ...props
}: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      data-sidebar="rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "absolute inset-y-0 -right-2 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear sm:flex hover:after:bg-emerald-500 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] after:bg-slate-800",
        className
      )}
      {...props}
    />
  );
}

export function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      data-sidebar="trigger"
      type="button"
      aria-label="Toggle Sidebar"
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0",
        className
      )}
      {...props}
    >
      <PanelLeft className="h-4 w-4" />
      <span className="sr-only">Toggle Sidebar</span>
    </button>
  );
}

export function SidebarInset({
  className,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "relative flex min-h-screen flex-1 flex-col bg-slate-50 min-w-0 overflow-x-hidden",
        className
      )}
      {...props}
    />
  );
}

