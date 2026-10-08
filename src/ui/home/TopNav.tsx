"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Logo } from "@/ui/Logo";

/** Top navigation for the homepage, with a search across all moments. */

export type SearchItem = { number: number; id: string | null; title: string; gameLabel: string; search: string };

const MAX_RESULTS = 6;


function Search({ items }: { items: SearchItem[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q.length < 2 ? [] : items.filter((i) => i.search.includes(q)).slice(0, MAX_RESULTS);
  }, [items, query]);

  return (
    <div className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search moments, players, or teams…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          aria-label="Search moments"
        />
      </div>
      {open && query.trim().length >= 2 ? (
        <ul className="absolute right-0 z-30 mt-2 w-full overflow-hidden rounded-xl border border-border bg-surface-raised py-1 shadow-2xl shadow-black">
          {results.length === 0 ? <li className="px-3 py-2 text-sm text-muted">No moments match.</li> : null}
          {results.map((r) => (
            <li key={r.number}>
              {r.id ? (
                <Link href={`/moments/${r.id}/`} className="block px-3 py-2 hover:bg-surface">
                  <span className="block text-sm">{r.title}</span>
                  <span className="block text-xs text-muted">{r.gameLabel}</span>
                </Link>
              ) : (
                <div className="px-3 py-2 opacity-70">
                  <span className="block text-sm">{r.title}</span>
                  <span className="block text-xs text-muted">{r.gameLabel} · coming soon</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function TopNav({ items, active }: { items: SearchItem[]; active: "home" | "moments" | "how" }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3 sm:gap-8 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm md:flex">
          {(
            [
              ["home", "/", "Home"],
              ["moments", "/moments/", "Moments"],
              ["how", "/how-it-works/", "How it works"],
            ] as const
          ).map(([key, href, label]) => (
            <Link key={key} href={href} className={`border-b-2 pb-1 ${active === key ? "border-foreground" : "border-transparent text-muted hover:text-foreground"}`}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-1 justify-end">
          <Search items={items} />
        </div>
      </div>
    </header>
  );
}
