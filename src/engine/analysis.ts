/**
 * Read a timeline's event log and say how the moment's first trip down the floor went,
 * for the "key scenarios" breakdown. Pure; no UI.
 */

import type { Side, Timeline } from "./types";

export type FirstPlay = "made" | "missedDefensiveRebound" | "missedOffensiveRebound" | "turnoverOrFoul" | "noShot";

export type TimelineResult = {
  winner: Side;
  periods: number;
  historyChanged: boolean;
  firstPlay: FirstPlay;
  /** Who took the starting offense's first shot (null if they never shot). */
  firstShooter: number | null;
};

export function firstPlay(timeline: Timeline, offense: Side): { play: FirstPlay; shooter: number | null } {
  const events = timeline.events;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === "turnover" && e.team === offense) return { play: "turnoverOrFoul", shooter: null };
    if (e.type === "foul" && e.team !== offense && e.kind !== "shooting") return { play: "turnoverOrFoul", shooter: null };
    if (e.type === "possession" && e.team !== offense && i > 0) return { play: "noShot", shooter: null };
    if (e.type === "shot" && e.team === offense) {
      if (e.made) return { play: "made", shooter: e.player };
      const rebound = events.slice(i + 1).find((r) => r.type === "rebound");
      const offensive = rebound?.type === "rebound" && rebound.offensive;
      return { play: offensive ? "missedOffensiveRebound" : "missedDefensiveRebound", shooter: e.player };
    }
  }
  return { play: "noShot", shooter: null };
}

export function timelineResult(timeline: Timeline, offense: Side): TimelineResult {
  const { play, shooter } = firstPlay(timeline, offense);
  return { winner: timeline.winner, periods: timeline.periods, historyChanged: timeline.historyChanged, firstPlay: play, firstShooter: shooter };
}

export type Tally = {
  runs: number;
  historyChanged: number;
  wins: Record<Side, number>;
  overtime: number;
  firstPlay: Record<FirstPlay, number>;
  /** How often each player took the first shot. */
  firstShooter: Record<number, number>;
};

export function emptyTally(): Tally {
  return {
    runs: 0,
    historyChanged: 0,
    wins: { home: 0, away: 0 },
    overtime: 0,
    firstPlay: { made: 0, missedDefensiveRebound: 0, missedOffensiveRebound: 0, turnoverOrFoul: 0, noShot: 0 },
    firstShooter: {},
  };
}

export function addToTally(tally: Tally, r: TimelineResult, regulationPeriods: number): Tally {
  tally.runs += 1;
  if (r.historyChanged) tally.historyChanged += 1;
  tally.wins[r.winner] += 1;
  if (r.periods > regulationPeriods) tally.overtime += 1;
  tally.firstPlay[r.firstPlay] += 1;
  if (r.firstShooter !== null) tally.firstShooter[r.firstShooter] = (tally.firstShooter[r.firstShooter] ?? 0) + 1;
  return tally;
}
