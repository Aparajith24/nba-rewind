"use client";

import { headshotUrl } from "@/lib/images";
import type { Side } from "@/lib/types";

/** The ten players on the floor. Tap one to choose who gets swapped out. */

export type StripPlayer = { playerId: number; name: string; jersey: string; side: Side };

function lastName(name: string) {
  return name.split(" ").slice(-1)[0];
}

function Chip({ player, selected, replacement, onSelect }: { player: StripPlayer; selected: boolean; replacement: StripPlayer | null; onSelect: () => void }) {
  const shown = replacement ?? player;
  return (
    <button type="button" onClick={onSelect} className="group flex w-16 flex-col items-center gap-1" aria-pressed={selected}>
      <span
        className={`relative h-11 w-11 overflow-hidden rounded-full border-2 bg-surface-raised transition ${
          selected ? "border-foreground ring-2 ring-foreground/40" : shown.side === "home" ? "border-home/70" : "border-away"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- remote image; next/image can't optimize in a static export */}
        <img src={headshotUrl(shown.playerId)} alt="" className="h-full w-full object-cover object-top" />
      </span>
      <span className={`max-w-16 truncate text-xs ${selected ? "font-semibold text-foreground" : "text-foreground/85"}`}>{lastName(shown.name)}</span>
      <span className="text-[10px] text-muted">{replacement ? "IN" : shown.jersey || "–"}</span>
    </button>
  );
}

export function OnCourtStrip({
  players,
  selectedOut,
  replacement,
  onSelect,
}: {
  players: StripPlayer[];
  selectedOut: number | null;
  replacement: StripPlayer | null;
  onSelect: (playerId: number) => void;
}) {
  const side = (s: Side) => players.filter((p) => p.side === s);
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm text-foreground/90">
        On Court <span className="text-muted">(5v5)</span>
        <span className="ml-2 text-xs text-muted">Tap a player to swap him out</span>
      </span>
      <div className="flex flex-wrap items-start justify-between gap-y-3">
        {(["home", "away"] as Side[]).map((s, i) => (
          <div key={s} className={`flex flex-wrap gap-1 ${i === 1 ? "border-l border-border pl-3" : ""}`}>
            {side(s).map((p) => (
              <Chip
                key={p.playerId}
                player={p}
                selected={selectedOut === p.playerId}
                replacement={selectedOut === p.playerId ? replacement : null}
                onSelect={() => onSelect(p.playerId)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
