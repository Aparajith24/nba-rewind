/**
 * Assemble the engine's input from the data files, applying a swap.
 * The UI (or a test) loads the JSON; this stays pure.
 */

import { buildSimPlayer } from "./profile";
import type { LeagueFile, MomentFile, PlayerFile, Side, SimInput, SimPlayer } from "./types";

export type Swap = {
  /** The player being replaced. */
  out: number;
  /** Who comes in, and which season of him. */
  in: number;
  season: string;
};

// Listed positions from smallest to biggest, for lining up matchups.
const POSITION_ORDER = ["G", "G-F", "F-G", "F", "F-C", "C-F", "C"];

/**
 * Who guards whom: each five sorted by listed position (guards first, centers last, ties in
 * lineup order), then paired off in that order. Returns attacker id → defender id for both sides.
 */
export function assignMatchups(players: Record<Side, SimPlayer[]>): Record<number, number> {
  const rank = (p: SimPlayer) => {
    const i = POSITION_ORDER.indexOf(p.position);
    return i === -1 ? POSITION_ORDER.indexOf("F") : i;
  };
  const sorted = (side: Side) => players[side].map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p);
  const home = sorted("home");
  const away = sorted("away");
  const matchups: Record<number, number> = {};
  home.forEach((p, i) => {
    matchups[p.playerId] = away[i].playerId;
    matchups[away[i].playerId] = p.playerId;
  });
  return matchups;
}

export function buildSimInput(args: {
  moment: MomentFile;
  /** Player files for everyone on the floor, plus the swapped-in player. */
  playerFiles: Record<number, PlayerFile>;
  /** League files by season: the moment's season, and each player's own season. */
  leagues: Record<string, LeagueFile>;
  swap?: Swap | null;
  seed: string;
}): SimInput {
  const { moment, playerFiles, leagues, swap, seed } = args;
  const league = leagues[moment.rulesSeason];
  if (!league) throw new Error(`missing league file for ${moment.rulesSeason}`);

  const players = { home: [] as SimPlayer[], away: [] as SimPlayer[] };
  for (const side of ["home", "away"] as Side[]) {
    for (const slot of moment.lineups[side]) {
      const swapped = swap?.out === slot.playerId;
      const id = swapped ? swap.in : slot.playerId;
      const season = swapped ? swap.season : slot.season;
      const file = playerFiles[id];
      if (!file) throw new Error(`missing player file for ${id}`);
      const ownLeague = leagues[season];
      if (!ownLeague) throw new Error(`missing league file for ${season}`);
      players[side].push(
        buildSimPlayer({
          file,
          season,
          side,
          ownLeague,
          // The swapped-in player comes in neutral (no hot hand): he didn't play in this game.
          inGame: swapped ? null : moment.inGame[String(slot.playerId)],
          // He takes over the role of the man he replaced, matchup included.
          position: slot.position,
        }),
      );
    }
  }
  // Playmaking: how the swap changes each lineup's offensive lift (0 with no swap).
  const lift = (id: number, season: string) => playerFiles[id]?.seasons[season]?.impact?.offensiveLift ?? 0;
  const playmakingChange = { home: 0, away: 0 };
  for (const side of ["home", "away"] as Side[]) {
    const out = moment.lineups[side].find((p) => p.playerId === swap?.out);
    if (swap && out) playmakingChange[side] = (lift(swap.in, swap.season) - lift(out.playerId, out.season)) / league.playoffs.pts_per_100;
  }
  return { moment, players, league, seed, playmakingChange, matchups: assignMatchups(players), swappedIn: swap?.in ?? null };
}
