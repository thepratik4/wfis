import type { Metadata } from "next";
import {
  Plus_Jakarta_Sans,
  Public_Sans,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

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
    <html
      lang="en"
      className={`${plusJakarta.variable} ${publicSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans antialiased bg-slate-50 text-slate-900" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
