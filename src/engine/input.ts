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
        }),
      );
    }
  }
  return { moment, players, league, seed };
}
