"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { loadIndex, type IndexPlayer } from "@/lib/data";
import { headshotUrl } from "@/lib/images";
import type { Side } from "@/lib/types";

/**
 * The swap, in one bar: who goes out → who comes in → which season of him.
 * Players already on the floor are left out of the search. The parent keys this by who
 * goes out, so changing that starts the search fresh.
 */

export type SwapChoice = { playerId: number; name: string; season: string; team: string; playoffs: boolean };
export type OnFloor = { playerId: number; name: string; side: Side; tricode: string };

const MAX_RESULTS = 8;

function normalize(s: string) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Default season: his latest playoff season, else his latest season. */
function defaultSeason(p: IndexPlayer) {
  return [...p.seasons].reverse().find((s) => s.playoffs) ?? p.seasons[p.seasons.length - 1];
}

function yearsLabel(p: IndexPlayer) {
  const first = p.seasons[0].season.slice(0, 4);
  const last = p.seasons[p.seasons.length - 1].season;
  return `${first}–${last.slice(0, 2)}${last.slice(5)}`;
}

function Headshot({ id, size = 40 }: { id: number | null; size?: number }) {
  if (!id) {
    return (
      <span className="flex shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted" style={{ width: size, height: size }}>
        ?
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote image; next/image can't optimize in a static export
    <img src={headshotUrl(id)} alt="" className="shrink-0 rounded-full border border-border bg-surface-raised object-cover object-top" style={{ width: size, height: size }} />
  );
}

export function SwapBar({
  onFloor,
  outId,
  onOut,
  choice,
  onChoose,
  onRemove,
  disabled,
}: {
  onFloor: OnFloor[];
  outId: number | null;
  /** null unselects. */
  onOut: (id: number | null) => void;
  choice: SwapChoice | null;
  onChoose: (c: SwapChoice | null) => void;
  /** Undo the whole swap, back to the moment as it really was. Shown only when there's something to undo. */
  onRemove?: () => void;
  disabled: boolean;
}) {
  const [index, setIndex] = useState<IndexPlayer[] | null>(null);
  const [query, setQuery] = useState(choice?.name ?? "");
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<IndexPlayer | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const out = onFloor.find((p) => p.playerId === outId) ?? null;

  useEffect(() => {
    loadIndex().then(setIndex);
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const floorIds = useMemo(() => new Set(onFloor.map((p) => p.playerId)), [onFloor]);
  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!index || q.length < 2) return [];
    return index.filter((p) => !floorIds.has(p.id) && normalize(p.name).includes(q)).slice(0, MAX_RESULTS);
  }, [index, query, floorIds]);

  const choose = (p: IndexPlayer) => {
    const s = defaultSeason(p);
    setPicked(p);
    setQuery(p.name);
    setOpen(false);
    onChoose({ playerId: p.id, name: p.name, season: s.season, team: s.team, playoffs: s.playoffs });
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Who goes out */}
        <label className="flex min-w-0 items-center gap-3 lg:w-64">
          <Headshot id={out?.playerId ?? null} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[11px] tracking-widest text-muted">OUT</span>
            <select
              value={outId ?? ""}
              disabled={disabled}
              onChange={(e) => onOut(e.target.value ? Number(e.target.value) : null)}
              className="min-w-0 truncate bg-transparent text-sm font-semibold outline-none disabled:opacity-60"
              aria-label="Player to swap out"
            >
              <option value="">{outId === null ? "Pick a player…" : "No one"}</option>
              {(["home", "away"] as Side[]).map((side) => {
                const team = onFloor.filter((p) => p.side === side);
                return (
                  <optgroup key={side} label={team[0]?.tricode ?? side}>
                    {team.map((p) => (
                      <option key={p.playerId} value={p.playerId}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </span>
        </label>

        <span className="hidden text-xl text-muted lg:block" aria-hidden>
          →
        </span>

        {/* Who comes in */}
        <div ref={box} className="relative min-w-0 flex-1">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2">
            <Headshot id={choice?.playerId ?? null} size={32} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11px] tracking-widest text-muted">IN</span>
              <input
                value={query}
                disabled={disabled || outId === null}
                onFocus={() => setOpen(true)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                  if (choice) onChoose(null);
                }}
                placeholder={outId === null ? "Pick who goes out first" : index ? "Search any player since 1996-97…" : "Loading players…"}
                className="min-w-0 bg-transparent text-sm outline-none placeholder:text-muted disabled:opacity-60"
                aria-label="Search the player to swap in"
              />
            </span>
            {choice ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setPicked(null);
                  onChoose(null);
                }}
                disabled={disabled}
                className="text-sm text-muted hover:text-foreground"
                aria-label="Clear swap"
              >
                ✕
              </button>
            ) : null}
          </div>

          {open && query.trim().length >= 2 && !choice ? (
            <ul className="absolute z-30 mt-2 max-h-80 w-full overflow-auto rounded-xl border border-border bg-surface-raised py-1 shadow-2xl shadow-black">
              {results.length === 0 ? <li className="px-3 py-2 text-sm text-muted">{index ? "No players match." : "Loading players…"}</li> : null}
              {results.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => choose(p)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface">
                    <Headshot id={p.id} size={32} />
                    <span className="flex-1 text-sm">{p.name}</span>
                    <span className="text-xs text-muted">{yearsLabel(p)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* Which season of him */}
        {choice && picked ? (
          <label className="flex items-center gap-2 text-sm lg:w-60">
            <span className="text-[11px] tracking-widest text-muted">SEASON</span>
            <select
              value={choice.season}
              disabled={disabled}
              onChange={(e) => {
                const s = picked.seasons.find((x) => x.season === e.target.value)!;
                onChoose({ ...choice, season: s.season, team: s.team, playoffs: s.playoffs });
              }}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
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
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {out && choice
            ? `${choice.name} (${choice.season} ${choice.team}) replaces ${out.name}. Press Run Simulation.`
            : out
              ? `Tap any player on the court to change who goes out (tap him again to unselect). Search anyone since 1996–97 to bring in.`
              : "Pick who goes out, then search who comes in."}
        </p>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-foreground/50 hover:text-foreground disabled:opacity-50"
          >
            ↺ Remove swap
          </button>
        ) : null}
      </div>
    </div>
  );
}
