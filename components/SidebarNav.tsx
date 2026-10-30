"use client";

import React from "react";
import { AppSidebar, type AppSidebarProps } from "@/components/AppSidebar";

export type SidebarNavProps = AppSidebarProps;

export default function SidebarNav(props: SidebarNavProps) {
  return <AppSidebar {...props} />;
}
