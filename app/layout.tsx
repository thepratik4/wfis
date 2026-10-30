import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wind Forecast Intelligence",
  description:
    "UK wholesale day-ahead electricity procurement analytics platform comparing Elexon BMRS wind generation forecasts (WINDFOR) against half-hourly actuals (FUELHH) for January 2026.",
  openGraph: {
    title: "Wind Forecast Intelligence",
    description:
      "UK wholesale day-ahead electricity procurement analytics platform comparing Elexon BMRS wind generation forecasts (WINDFOR) against half-hourly actuals (FUELHH) for January 2026.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wind Forecast Intelligence",
    description:
      "UK wholesale day-ahead electricity procurement analytics platform comparing Elexon BMRS wind generation forecasts (WINDFOR) against half-hourly actuals (FUELHH) for January 2026.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-slate-50 text-slate-900" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
