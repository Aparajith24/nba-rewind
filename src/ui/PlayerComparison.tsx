import type { PlayerFile, SeasonProfile } from "@/engine/types";
import { headshotUrl } from "@/lib/images";

/** The player going out next to the player coming in, with per-game numbers for the season used. */

export type ComparedPlayer = {
  file: PlayerFile;
  season: string;
  label: string;
  detail: string;
};

function perGame(p: SeasonProfile | undefined) {
  if (!p) return null;
  const gp = (p.gp as number) || 1;
  const fga = (p.fga as number) || 0;
  return {
    ppg: ((p.pts as number) / gp).toFixed(1),
    rpg: (((p.oreb as number) + (p.dreb as number)) / gp).toFixed(1),
    apg: ((p.ast as number) / gp).toFixed(1),
    fg: fga ? ((p.fgm as number) / fga).toFixed(3).replace(/^0/, "") : "–",
  };
}

function Card({ player }: { player: ComparedPlayer }) {
  const season = player.file.seasons[player.season];
  const playoffs = season?.playoffs && (season.playoffs.gp as number) > 0;
  const stats = perGame(playoffs ? season.playoffs : season?.regularSeason);
  return (
    <div className="flex flex-1 items-center gap-4 rounded-xl border border-border bg-surface-raised p-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- remote image; next/image can't optimize in a static export */}
      <img src={headshotUrl(player.file.id)} alt="" className="h-16 w-16 shrink-0 rounded-full border border-border object-cover object-top" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <div className="truncate font-semibold">{player.file.name}</div>
          <div className="text-xs text-muted">
            {player.detail} · {player.label}
          </div>
        </div>
        {stats ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>
              {stats.ppg} <span className="text-xs text-muted">PPG</span>
            </span>
            <span>
              {stats.rpg} <span className="text-xs text-muted">RPG</span>
            </span>
            <span>
              {stats.apg} <span className="text-xs text-muted">APG</span>
            </span>
            <span>
              {stats.fg} <span className="text-xs text-muted">FG%</span>
            </span>
            <span className="text-xs text-muted">{player.season} {playoffs ? "playoffs" : "regular season"}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PlayerComparison({ out, swapIn }: { out: ComparedPlayer; swapIn: ComparedPlayer }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-semibold">Player Comparison</h2>
      <div className="flex flex-col gap-3 md:flex-row">
        <Card player={out} />
        <Card player={swapIn} />
      </div>
    </section>
  );
}
