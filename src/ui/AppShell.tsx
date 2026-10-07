import Link from "next/link";
import type { ReactNode } from "react";

/** Left sidebar on wide screens, a top bar on phones. */

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
        <circle cx="13" cy="13" r="12" fill="var(--accent)" />
        <path d="M1 13h24M13 1v24M4.5 4.5c5 4 5 13 0 17M21.5 4.5c-5 4-5 13 0 17" stroke="var(--background)" strokeWidth="1.6" fill="none" />
      </svg>
      NBA Rewind
    </Link>
  );
}

function NavItem({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground/90 hover:bg-surface-raised">
      <span className="text-muted">{icon}</span>
      {label}
    </Link>
  );
}

const HomeIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </svg>
);

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex items-center justify-between border-b border-border px-4 py-3 lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:shrink-0 lg:flex-col lg:items-stretch lg:justify-start lg:gap-8 lg:border-r lg:border-b-0 lg:px-4 lg:py-6">
        <Logo />
        <nav className="hidden flex-col gap-1 lg:flex">
          <NavItem href="/" label="Home" icon={HomeIcon} />
        </nav>
        <div className="mt-auto hidden rounded-xl border border-border bg-surface p-4 lg:block">
          <p className="text-sm font-semibold leading-snug">
            Change a moment.
            <br />
            See a different history.
          </p>
          <p className="mt-2 text-xs text-muted">Same game. Same rules. Different player.</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1">{children}</main>
        <footer className="px-4 py-4 text-xs text-muted sm:px-8">Stats from stats.nba.com via nba_api. Not affiliated with the NBA.</footer>
      </div>
    </div>
  );
}
