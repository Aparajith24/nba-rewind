"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { loadIndex, type IndexPlayer } from "@/lib/data";
import { headshotUrl } from "@/lib/images";

/** Pick who comes in: search every player since 1996-97, then choose which season of him. */

export type SwapChoice = { playerId: number; name: string; season: string; team: string };

const MAX_RESULTS = 8;

function normalize(s: string) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Default season: his latest playoff season, else his latest season. */
function defaultSeason(p: IndexPlayer) {
  const playoff = [...p.seasons].reverse().find((s) => s.playoffs);
  return playoff ?? p.seasons[p.seasons.length - 1];
}

export function SwapCard({
  outName,
  choice,
  onChoose,
}: {
  outName: string | null;
  choice: SwapChoice | null;
  onChoose: (choice: SwapChoice | null) => void;
}) {
  const [index, setIndex] = useState<IndexPlayer[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<IndexPlayer | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!index || q.length < 2) return [];
    return index.filter((p) => normalize(p.name).includes(q)).slice(0, MAX_RESULTS);
  }, [index, query]);

  const ensureIndex = () => {
    if (!index) loadIndex().then(setIndex);
  };

  const choose = (p: IndexPlayer, season = defaultSeason(p)) => {
    setPicked(p);
    setQuery(p.name);
    setOpen(false);
    onChoose({ playerId: p.id, name: p.name, season: season.season, team: season.team });
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <div>
        <h2 className="text-lg font-semibold">Swap Player</h2>
        <p className="text-sm text-muted">{outName ? `Replace ${outName} with` : "Tap a player on the court strip to swap him out"}</p>
      </div>

      <div ref={box} className="relative">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-3 py-2.5">
          {choice ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote image; next/image can't optimize in a static export
            <img src={headshotUrl(choice.playerId)} alt="" className="h-10 w-10 rounded-full border border-border object-cover object-top" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-border text-muted">+</span>
          )}
          <input
            value={query}
            disabled={!outName}
            onFocus={() => {
              ensureIndex();
              setOpen(true);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              if (choice) onChoose(null);
            }}
            placeholder={outName ? "Search any player since 1996-97" : "Pick who to replace first"}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted disabled:opacity-50"
            aria-label="Search players"
          />
        </div>

        {open && results.length > 0 ? (
          <ul className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-xl border border-border bg-surface-raised py-1 shadow-2xl shadow-black">
            {results.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => choose(p)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote image */}
                  <img src={headshotUrl(p.id)} alt="" className="h-8 w-8 rounded-full object-cover object-top" />
                  <span className="flex-1 text-sm">{p.name}</span>
                  <span className="text-xs text-muted">
                    {p.seasons[0].season.slice(0, 4)}–{p.seasons[p.seasons.length - 1].season.slice(0, 2)}
                    {p.seasons[p.seasons.length - 1].season.slice(5)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {choice && picked ? (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Season</span>
          <select
            value={choice.season}
            onChange={(e) => {
              const s = picked.seasons.find((x) => x.season === e.target.value)!;
              onChoose({ ...choice, season: s.season, team: s.team });
            }}
            className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
          >
            {[...picked.seasons].reverse().map((s) => (
              <option key={s.season} value={s.season}>
                {s.season} · {s.team}
                {s.playoffs ? "" : " · no playoffs"}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </section>
  );
}
