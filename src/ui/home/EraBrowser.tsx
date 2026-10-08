"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DECADES, type Decade } from "@/lib/eras";
import type { HomeCard } from "@/lib/home";
import { headshotUrl } from "@/lib/images";
import { CourtLines, MomentCard } from "./MomentCard";

/**
 * EraTiles: the homepage's "Browse by Era" tiles, each linking to the moments page filtered.
 * MomentsBrowser: the moments page's era chips over the full grid; the era lives in the URL
 * hash (/moments/#1990s) so tiles can deep-link and the filter survives a refresh.
 */

export type Era = { decade: Decade; count: number; face: number | null };

function EraTile({ era }: { era: Era }) {
  return (
    <Link
      href={`/moments/#${era.decade}`}
      className="group relative block h-36 overflow-hidden rounded-2xl border border-border bg-surface transition hover:border-foreground/50 sm:h-44"
    >
      <CourtLines className="opacity-60" />
      {era.face ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote image; next/image can't optimize in a static export
        <img
          src={headshotUrl(era.face, "large")}
          alt=""
          loading="lazy"
          className="absolute right-0 bottom-0 h-[92%] object-contain object-bottom opacity-90 transition duration-300 group-hover:scale-105"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/60 to-transparent" />
      <div className="absolute bottom-4 left-5">
        <div className="text-3xl font-bold tracking-tight">{era.decade}</div>
        <div className="text-sm text-muted">{era.count} moments</div>
      </div>
      <span className="absolute right-4 bottom-4 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/70 text-sm">→</span>
    </Link>
  );
}

export function EraTiles({ eras }: { eras: Era[] }) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold sm:text-3xl">Browse by Era</h2>
          <p className="text-muted">Relive the biggest moments from every era.</p>
        </div>
        <Link href="/moments/" className="text-sm text-muted hover:text-foreground">
          All moments →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {eras.map((e) => (
          <EraTile key={e.decade} era={e} />
        ))}
      </div>
    </section>
  );
}

function eraFromHash(): Decade | "All" {
  const hash = decodeURIComponent(window.location.hash.slice(1));
  return (DECADES as string[]).includes(hash) ? (hash as Decade) : "All";
}

export function MomentsBrowser({ cards }: { cards: HomeCard[] }) {
  const [era, setEra] = useState<Decade | "All">("All");

  // Read the era from the URL after mount (the page is static, so not at build time).
  useEffect(() => {
    const sync = () => setEra(eraFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const choose = (next: Decade | "All") => {
    setEra(next);
    history.replaceState(null, "", next === "All" ? window.location.pathname : `#${next}`);
  };
  const shown = era === "All" ? cards : cards.filter((c) => c.decade === era);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {(["All", ...DECADES] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => choose(d)}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${era === d ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/50"}`}
          >
            {d}
            <span className="ml-1.5 text-xs opacity-60">{d === "All" ? cards.length : cards.filter((c) => c.decade === d).length}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((c) => (
          <MomentCard key={c.number} card={c} size="grid" />
        ))}
      </div>
    </section>
  );
}
