import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NBA Rewind",
  description: "Swap any player into the greatest NBA playoff moments and see if history changes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b border-border px-4 py-3 sm:px-8">
          <Link href="/" className="font-mono text-sm font-semibold tracking-[0.3em] text-accent">
            NBA REWIND
          </Link>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border px-4 py-4 text-xs text-muted sm:px-8">
          Stats from stats.nba.com via nba_api. Not affiliated with the NBA.
        </footer>
      </body>
    </html>
  );
}
