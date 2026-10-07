/**
 * Possession-by-possession simulation of a moment, played to the end of the game
 * (overtime included). Pure and seeded: same input + seed = same timeline.
 *
 * Late-game rules (docs/simulation-rules.md):
 * - Who shoots: usage × hot hand (swapped-in player neutral).
 * - Fouling: what NBA teams do. Up 3: never with >10 s left, sometimes at 6-10 s, often at ≤6 s.
 *   Trailing late: foul to stop the clock when the game clock is under the shot clock.
 * - Offensive rebounds: the score decides (need 3 → kick out; otherwise a big puts it back).
 * - Timeouts: real counts; a trailing or tied team uses one late to advance the ball.
 */

import { createRng, type Rng } from "./rng";
import { TUNING } from "./tuning";
import type { SimEvent, SimInput, SimPlayer, Side, Summary, Timeline, Zone } from "./types";
import { THREE_ZONES, ZONES } from "./types";

const REGULATION_PERIODS = 4;
const OVERTIME_SECONDS = 300;
const OVERTIME_TIMEOUTS = 2;
const SHOT_CLOCK = 24;
const HOOP: readonly [number, number] = [88.75, 25];

const other = (side: Side): Side => (side === "home" ? "away" : "home");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Game = {
  rng: Rng;
  input: SimInput;
  period: number;
  clock: number;
  shotClock: number;
  score: Record<Side, number>;
  offense: Side;
  /** Ball is already past half court (after a timeout, offensive rebound, or frontcourt inbound). */
  frontcourt: boolean;
  timeouts: Record<Side, number>;
  /** Per-timeline shooting swing per player: the surprise element. */
  surprise: Map<number, number>;
  events: SimEvent[];
};

// ---------------------------------------------------------------- helpers

function push(g: Game, e: Record<string, unknown>) {
  g.events.push({ period: g.period, clock: round(g.clock), score: { ...g.score }, ...e } as SimEvent);
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

function elapse(g: Game, seconds: number) {
  const s = Math.max(0, Math.min(seconds, g.clock));
  g.clock -= s;
  g.shotClock -= s;
}

function lead(g: Game, side: Side) {
  return g.score[side] - g.score[other(side)];
}

function isLate(g: Game) {
  return g.period >= REGULATION_PERIODS && g.clock <= TUNING.lateGameSeconds;
}

function five(g: Game, side: Side): SimPlayer[] {
  return g.input.players[side];
}

function newPossession(g: Game, side: Side, frontcourt: boolean, shotClock = SHOT_CLOCK) {
  g.offense = side;
  g.frontcourt = frontcourt;
  g.shotClock = shotClock;
  if (g.clock > 0) push(g, { type: "possession", team: side, frontcourt });
}

/** Offensive-rebound shot clock: 14 since 2018-19, otherwise a full 24. */
function offensiveReboundShotClock(g: Game) {
  return g.input.league.rules.offensive_rebound_reset_14 ? 14 : SHOT_CLOCK;
}

function defenseFactor(g: Game, defense: Side) {
  const players = five(g, defense);
  const rating = players.reduce((s, p) => s + p.defensiveRating, 0) / players.length;
  const [lo, hi] = TUNING.defenseClamp;
  return clamp(rating / g.input.league.playoffs.pts_per_100, lo, hi);
}

/** A point inside a zone, in the offense's frame (feet; basket at 88.75, 25; "left" corner is y ≈ 2). */
function shotLocation(rng: Rng, zone: Zone): [number, number] {
  const polar = (rMin: number, rMax: number, maxAngleDeg: number): [number, number] => {
    const r = rng.between([rMin, rMax]);
    const a = ((rng.next() * 2 - 1) * maxAngleDeg * Math.PI) / 180;
    return [round(HOOP[0] - r * Math.cos(a)), round(HOOP[1] + r * Math.sin(a))];
  };
  switch (zone) {
    case "ra":
      return polar(0.5, 4, 80);
    case "paint":
      return [round(rng.between([75, 85])), round(rng.between([19, 31]))];
    case "mid":
      return polar(10, 21, 70);
    case "left_corner3":
      return [round(rng.between([80, 92])), 1.8];
    case "right_corner3":
      return [round(rng.between([80, 92])), 48.2];
    case "above_break3":
      return polar(24, 27, 65);
    case "backcourt":
      return [round(rng.between([15, 45])), round(rng.between([10, 40]))];
  }
}

// ---------------------------------------------------------------- decisions

/** Usage × hot hand decides who takes the shot. */
function pickShooter(g: Game, side: Side, needThree: boolean): SimPlayer {
  return g.rng.weighted(five(g, side), (p) => {
    const threes = THREE_ZONES.reduce((s, z) => s + p.zoneShare[z], 0);
    return p.usage * p.hotHand * (needThree ? Math.max(threes, 0.02) : 1);
  });
}

function pickZone(g: Game, shooter: SimPlayer, needThree: boolean): Zone {
  if (g.clock <= TUNING.heaveSeconds && !g.frontcourt) return "backcourt";
  const zones = ZONES.filter((z) => z !== "backcourt" && (!needThree || THREE_ZONES.includes(z)));
  return g.rng.weighted(zones, (z) => shooter.zoneShare[z] + (needThree ? 0.01 : 0));
}

/** Down 3 with one possession's time left, or down 4+ at the very end: only a three will do. */
function needsThree(g: Game, side: Side) {
  const l = lead(g, side);
  return isLate(g) && ((l === -3 && g.clock <= SHOT_CLOCK) || (l <= -4 && g.clock <= 10));
}

/** Fouling (what NBA teams do), decided when a possession starts. */
function defenseFoulsNow(g: Game, defense: Side): boolean {
  if (!isLate(g)) return false;
  const f = TUNING.fouling;
  const defenseLead = lead(g, defense);
  if (defenseLead === 3 && g.clock <= f.upThreeMidWindow) {
    return g.rng.chance(g.clock <= f.upThreeLateWindow ? f.upThreeLateChance : f.upThreeMidChance);
  }
  if (defenseLead < 0 && g.clock <= f.trailingWindow && g.clock < g.shotClock) {
    const possessionsLeft = Math.max(1, g.clock / f.secondsPerPossessionWhenFouling);
    return -defenseLead <= possessionsLeft * f.reachablePointsPerPossession;
  }
  return false;
}

// ---------------------------------------------------------------- actions

function freeThrows(g: Game, shooter: SimPlayer, count: number) {
  const side = shooter.side;
  for (let n = 1; n <= count; n++) {
    const made = g.rng.chance(shooter.ftPct);
    if (made) g.score[side] += 1;
    push(g, { type: "freeThrow", team: side, player: shooter.playerId, made, n, of: count });
    if (n === count) {
      if (made) newPossession(g, other(side), false);
      else rebound(g, side, TUNING.freeThrowOrebChance);
    }
  }
}

function intentionalFoul(g: Game, defense: Side) {
  const offense = other(defense);
  elapse(g, g.rng.between(TUNING.time.intentionalFoul));
  // The offense gets the ball to good free-throw shooters; the defense grabs whoever has it.
  const fouled = g.rng.weighted(five(g, offense), (p) => p.usage * p.ftPct ** 3);
  const fouler = g.rng.weighted(five(g, defense), () => 1);
  push(g, { type: "foul", team: defense, player: fouler.playerId, on: fouled.playerId, kind: "intentional" });
  freeThrows(g, fouled, 2);
}

function rebound(g: Game, shootingSide: Side, offensiveChance?: number) {
  const defense = other(shootingSide);
  const orebSum = five(g, shootingSide).reduce((s, p) => s + p.offensiveReboundPct, 0);
  const drebSum = five(g, defense).reduce((s, p) => s + p.defensiveReboundPct, 0);
  const pOffensive = offensiveChance ?? orebSum / (orebSum + drebSum);

  if (g.clock <= 0) return;
  elapse(g, g.rng.between(TUNING.time.reboundGather));

  if (!g.rng.chance(pOffensive)) {
    const rebounder = g.rng.weighted(five(g, defense), (p) => p.defensiveReboundPct);
    push(g, { type: "rebound", team: defense, player: rebounder.playerId, offensive: false });
    newPossession(g, defense, false);
    return;
  }

  const rebounder = g.rng.weighted(five(g, shootingSide), (p) => p.offensiveReboundPct);
  push(g, { type: "rebound", team: shootingSide, player: rebounder.playerId, offensive: true });
  g.shotClock = offensiveReboundShotClock(g);

  // The score decides. Need a three → kick it out. Otherwise a big puts it back.
  if (needsThree(g, shootingSide) && g.clock > TUNING.time.kickOut[0]) {
    elapse(g, g.rng.between(TUNING.time.kickOut));
    const shooter = pickShooter(g, shootingSide, true);
    if (shooter.playerId !== rebounder.playerId) {
      push(g, { type: "pass", team: shootingSide, from: rebounder.playerId, to: shooter.playerId });
    }
    shoot(g, shooter, pickZone(g, shooter, true));
    return;
  }
  const isBig = rebounder.zoneShare.ra >= TUNING.bigRestrictedAreaShare;
  if (isBig && g.clock > TUNING.time.putback[0]) {
    elapse(g, g.rng.between(TUNING.time.putback));
    shoot(g, rebounder, "ra");
    return;
  }
  g.frontcourt = true; // reset the offense from the frontcourt; the possession loop continues
}

function shoot(g: Game, shooter: SimPlayer, zone: Zone) {
  const side = shooter.side;
  const defense = other(side);
  const value: 2 | 3 = THREE_ZONES.includes(zone) ? 3 : 2;

  let pMake: number;
  if (zone === "backcourt") {
    pMake = 0.03;
  } else {
    const hot = (shooter.hotHand - 1) * TUNING.hotHand.makeBump;
    pMake = clamp(shooter.zonePct[zone] * defenseFactor(g, defense) + hot + (g.surprise.get(shooter.playerId) ?? 0), 0.01, 0.95);
  }
  const foulChance = zone === "backcourt" ? 0 : shooter.shootingFoulRate * (value === 3 ? TUNING.threeFoulFactor : 1);
  const fouled = g.rng.chance(foulChance);
  const made = g.rng.chance(fouled ? pMake * TUNING.andOneMakeFactor : pMake);
  const [x, y] = shotLocation(g.rng, zone);

  if (fouled) {
    const fouler = g.rng.weighted(five(g, defense), () => 1);
    push(g, { type: "foul", team: defense, player: fouler.playerId, on: shooter.playerId, kind: "shooting" });
  }
  if (made) g.score[side] += value;
  push(g, { type: "shot", team: side, player: shooter.playerId, zone, value, made, x, y, fouled });

  if (fouled) return freeThrows(g, shooter, made ? 1 : value);
  if (made) return newPossession(g, defense, false);
  return rebound(g, side);
}

function possession(g: Game) {
  const offense = g.offense;
  const defense = other(offense);
  const t = TUNING.time;

  if (defenseFoulsNow(g, defense)) return intentionalFoul(g, defense);

  // Trailing or tied late, a team uses a timeout to advance the ball.
  if (!g.frontcourt && isLate(g) && lead(g, offense) <= 0 && g.timeouts[offense] > 0) {
    g.timeouts[offense] -= 1;
    push(g, { type: "timeout", team: offense });
    g.frontcourt = true;
  }

  const l = lead(g, offense);
  // Leading late with the shot clock longer than the game clock: dribble it out.
  if (isLate(g) && l > 0 && g.clock <= g.shotClock) {
    elapse(g, g.clock);
    return;
  }

  // Getting into the offense. A trailing team pushes it. If there isn't time to cross half court, it's a heave.
  const hurry = isLate(g) && l < 0;
  const setup = g.rng.between(g.frontcourt ? t.inboundFrontcourt : hurry ? t.urgentBringUp : t.bringUpBackcourt);
  if (!g.frontcourt && g.clock <= setup) {
    elapse(g, Math.max(0, g.clock - 0.3));
    const shooter = pickShooter(g, offense, true);
    return shoot(g, shooter, "backcourt");
  }
  elapse(g, setup);
  g.frontcourt = true;

  // How long they work before shooting.
  let work: number;
  if (hurry) work = Math.min(g.rng.between(t.trailingWork), g.clock - g.rng.between(t.trailingReserve));
  else if (isLate(g) && l === 0 && g.clock <= g.shotClock) work = g.clock - g.rng.between(t.lastShotLeft);
  else if (isLate(g) && l > 0) work = g.shotClock - g.rng.between(t.leadingShotClockLeft);
  else work = g.rng.between(t.normalPossession) - setup;
  work = clamp(work, 0, Math.min(g.shotClock - 0.5, g.clock - 0.3));

  // Up 3: the defense may foul before the shot once the clock gets into the fouling window.
  const f = TUNING.fouling;
  const shotAt = g.clock - work;
  if (isLate(g) && lead(g, defense) === 3 && shotAt <= f.upThreeMidWindow && g.clock > f.upThreeMidWindow) {
    if (g.rng.chance(shotAt <= f.upThreeLateWindow ? f.upThreeLateChance : f.upThreeMidChance)) {
      elapse(g, g.clock - Math.max(shotAt, 0.5));
      return intentionalFoul(g, defense);
    }
  }
  elapse(g, work);

  // Turnover?
  const players = five(g, offense);
  const turnoverRate = players.reduce((s, p) => s + p.turnoverRate * p.usage, 0) / players.reduce((s, p) => s + p.usage, 0);
  if (g.rng.chance(turnoverRate)) {
    const loser = g.rng.weighted(players, (p) => p.usage * p.turnoverRate);
    const stolen = g.rng.chance(TUNING.stealShare);
    const stealer = stolen ? g.rng.weighted(five(g, defense), () => 1) : null;
    push(g, { type: "turnover", team: offense, player: loser.playerId, stolenBy: stealer?.playerId ?? null });
    return newPossession(g, defense, stolen);
  }

  const needThree = needsThree(g, offense);
  const shooter = pickShooter(g, offense, needThree);
  // Someone else usually brings it up and finds him.
  const handler = g.rng.weighted(players, (p) => p.usage);
  if (handler.playerId !== shooter.playerId) {
    push(g, { type: "pass", team: offense, from: handler.playerId, to: shooter.playerId });
  }
  shoot(g, shooter, pickZone(g, shooter, needThree));
}

// ---------------------------------------------------------------- timelines

function startGame(input: SimInput, seed: string): Game {
  const { moment } = input;
  const rng = createRng(seed);
  const offense = moment.state.possession;
  // Where the ball starts: if the offense is lined up in its own half, it has to bring it up.
  const offenseX = moment.lineups[offense].reduce((s, p) => s + p.x, 0) / moment.lineups[offense].length;

  const surprise = new Map<number, number>();
  for (const p of [...input.players.home, ...input.players.away]) {
    // Surprise element: a per-timeline swing, bigger for small playoff samples, capped.
    const sigma = (TUNING.surpriseMaxPoints * TUNING.surpriseHalfShots) / (TUNING.surpriseHalfShots + p.playoffShots);
    surprise.set(p.playerId, clamp(rng.normal() * sigma, -TUNING.surpriseMaxPoints, TUNING.surpriseMaxPoints));
  }

  const g: Game = {
    rng,
    input,
    period: moment.state.period,
    clock: moment.state.clockSeconds,
    shotClock: SHOT_CLOCK,
    score: { ...moment.state.score },
    offense,
    frontcourt: offenseX > 47,
    timeouts: { ...moment.timeoutsLeft },
    surprise,
    events: [],
  };
  push(g, { type: "possession", team: offense, frontcourt: g.frontcourt });
  return g;
}

export function simulateTimeline(input: SimInput, seed: string): Timeline {
  const g = startGame(input, seed);
  const lastPeriod = Math.max(g.period, REGULATION_PERIODS) + TUNING.maxOvertimes;

  while (true) {
    if (g.clock <= 0) {
      push(g, { type: "periodEnd" });
      const tied = g.score.home === g.score.away;
      if (!tied || g.period >= lastPeriod || g.period < REGULATION_PERIODS) break;
      // Overtime: 5 minutes, fresh timeouts, jump ball.
      g.period += 1;
      g.clock = OVERTIME_SECONDS;
      g.timeouts = { home: g.timeouts.home + OVERTIME_TIMEOUTS, away: g.timeouts.away + OVERTIME_TIMEOUTS };
      push(g, { type: "periodStart" });
      newPossession(g, g.rng.chance(0.5) ? "home" : "away", false);
      continue;
    }
    possession(g);
  }

  const winner: Side = g.score.home > g.score.away ? "home" : g.score.away > g.score.home ? "away" : g.rng.chance(0.5) ? "home" : "away";
  return {
    seed,
    events: g.events,
    final: { ...g.score },
    periods: g.period,
    winner,
    historyChanged: winner !== input.moment.realFinal.winner,
  };
}

export function timelineSeed(seed: string, index: number) {
  return `${seed}:${index}`;
}

/** Run timelines [start, start + count) and tally them; used in batches by the Web Worker. */
export function simulateBatch(input: SimInput, start: number, count: number): { summary: Summary; results: Pick<Timeline, "winner" | "periods" | "historyChanged">[] } {
  const results = [];
  for (let i = start; i < start + count; i++) {
    const t = simulateTimeline(input, timelineSeed(input.seed, i));
    results.push({ winner: t.winner, periods: t.periods, historyChanged: t.historyChanged });
  }
  return { summary: summarize(input, results), results };
}

export function summarize(input: SimInput, results: Pick<Timeline, "winner" | "periods" | "historyChanged">[]): Summary {
  const regulationEnd = Math.max(REGULATION_PERIODS, input.moment.state.period);
  const outcomes = { realWinnerRegulation: 0, realWinnerOvertime: 0, realLoserRegulation: 0, realLoserOvertime: 0 };
  for (const r of results) {
    const overtime = r.periods > regulationEnd;
    const key = r.historyChanged ? (overtime ? "realLoserOvertime" : "realLoserRegulation") : overtime ? "realWinnerOvertime" : "realWinnerRegulation";
    outcomes[key] += 1;
  }
  const n = results.length || 1;
  for (const k of Object.keys(outcomes) as (keyof typeof outcomes)[]) outcomes[k] /= n;
  return { timelines: results.length, historyChanged: results.filter((r) => r.historyChanged).length / n, outcomes };
}
