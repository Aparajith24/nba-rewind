/**
 * Turn an event log into keyframes for the court replay: where every player and the ball
 * are, who's on the floor, the clock, the score, and a broadcast-style caption.
 *
 * Presentation only. It never decides what happens; it stages what the event log says,
 * whether the log came from the sim or from what really happened.
 * Court frame: feet, 94 x 50. The team with the ball at the start attacks the right basket.
 */

import type { SimEvent, Side, Timeline } from "@/engine/types";

export type Point = { x: number; y: number };

export type Frame = {
  /** Seconds into the replay (wall time at 1x). */
  at: number;
  period: number;
  clock: number;
  score: Record<Side, number>;
  /** Players on the floor right now. */
  onCourt: number[];
  players: Record<number, Point>;
  /** The ball: held by a player, or at an explicit point (in flight, at the rim). */
  ball: { holder: number } | { at: Point; inAir: boolean };
  caption: string;
  /** Something to flash: a make, a miss off the rim, a whistle. */
  flash: "make" | "miss" | "whistle" | null;
  /** Which side has the ball, for highlighting. */
  offense: Side | null;
};

/** Everyone who might appear. Starters carry their moment positions. */
export type ReplayPlayer = { playerId: number; name: string; side: Side; x: number; y: number };

const COURT_LENGTH = 94;
const COURT_WIDTH = 50;
const HOOP_OFFSET = 5.25;
/** Minimum on-screen time for an event, so free throws and timeouts at the same clock are visible. */
const MIN_EVENT_SECONDS = 0.9;
/** How long the ball flight to the rim takes on screen. */
const SHOT_FLIGHT_SECONDS = 0.7;
/** Where players wait off the floor: the scorer's table side. */
const BENCH: Point = { x: 47, y: -3 };

// Offensive spots relative to the basket being attacked: [feet out from the baseline, feet across from center].
const OFFENSE_SPOTS: [number, number][] = [
  [27, 0],
  [21, -15],
  [21, 15],
  [4, -21],
  [4, 21],
];

function attacksRight(side: Side, startingOffense: Side) {
  return side === startingOffense;
}

function hoop(side: Side, startingOffense: Side): Point {
  return attacksRight(side, startingOffense) ? { x: COURT_LENGTH - HOOP_OFFSET, y: 25 } : { x: HOOP_OFFSET, y: 25 };
}

/** Event coordinates are in the shooting team's frame (attacking right); flip them for the other team. */
function toCourt(p: Point, side: Side, startingOffense: Side): Point {
  return attacksRight(side, startingOffense) ? p : { x: COURT_LENGTH - p.x, y: COURT_WIDTH - p.y };
}

function spot(side: Side, startingOffense: Side, [out, across]: [number, number], backcourt = false): Point {
  const right = attacksRight(side, startingOffense);
  const depth = HOOP_OFFSET + out + (backcourt ? 45 : 0);
  return { x: right ? COURT_LENGTH - depth : depth, y: 25 + (right ? across : -across) };
}

function towardHoop(p: Point, h: Point, share: number): Point {
  return { x: p.x + (h.x - p.x) * share, y: p.y + (h.y - p.y) * share };
}

const lastName = (name: string) => name.split(" ").slice(-1)[0];

export function buildFrames(roster: ReplayPlayer[], timeline: Timeline, startingOffense: Side, startingOnCourt: number[]): Frame[] {
  const byId = new Map(roster.map((p) => [p.playerId, p]));
  const who = (id: number) => (id ? lastName(byId.get(id)?.name ?? "?") : "team");

  const frames: Frame[] = [];
  let onCourt = [...startingOnCourt];
  const positions: Record<number, Point> = Object.fromEntries(
    roster.map((p) => [p.playerId, startingOnCourt.includes(p.playerId) ? { x: p.x, y: p.y } : { ...BENCH }]),
  );
  const team = (side: Side) => onCourt.filter((id) => byId.get(id)?.side === side);
  const holderOr = (id: number, side: Side) => (id && onCourt.includes(id) ? id : team(side)[0]);

  let at = 0;
  let lastClock = timeline.events[0]?.clock ?? 0;
  let lastPeriod = timeline.events[0]?.period ?? 4;

  /** Who each defender is guarding: defender id → attacker id. */
  let matchups = new Map<number, number>();

  /**
   * Keep every attacker guarded. Existing pairs stay; anyone unpaired picks up the nearest
   * open man (on a change of possession, defenders find whoever is closest).
   */
  const ensureMatchups = (offenseSide: Side) => {
    const defenseSide: Side = offenseSide === "home" ? "away" : "home";
    const attackers = team(offenseSide);
    const defenders = team(defenseSide);
    const valid = new Map([...matchups].filter(([d, a]) => defenders.includes(d) && attackers.includes(a)));
    const freeD = defenders.filter((d) => !valid.has(d));
    const freeA = attackers.filter((a) => ![...valid.values()].includes(a));
    const pairs = freeD.flatMap((d) => freeA.map((a) => ({ d, a, dist: Math.hypot(positions[d].x - positions[a].x, positions[d].y - positions[a].y) })));
    pairs.sort((p, q) => p.dist - q.dist);
    for (const { d, a } of pairs) {
      if (valid.has(d) || [...valid.values()].includes(a)) continue;
      valid.set(d, a);
    }
    matchups = valid;
  };

  /**
   * Man-to-man: each defender stays between his man and the basket. The shooter's (or pass
   * receiver's) defender closes out; with the ball in the backcourt they pick up loosely.
   */
  const guard = (offenseSide: Side | null, contest?: number, backcourt = false) => {
    if (!offenseSide) return;
    ensureMatchups(offenseSide);
    const h = hoop(offenseSide, startingOffense);
    for (const [defender, man] of matchups) {
      const share = man === contest ? 0.08 : backcourt ? 0.15 : 0.28;
      positions[defender] = towardHoop(positions[man], h, share);
    }
  };

  /**
   * Add a keyframe for an event. Defenders re-position against `guarding` (default: the team
   * with the ball), closing out on `contest` if given.
   */
  const emit = (e: SimEvent, patch: Partial<Frame> & Pick<Frame, "ball" | "caption">, opts: { contest?: number; guarding?: Side | null } = {}) => {
    guard(opts.guarding !== undefined ? opts.guarding : patch.offense ?? null, opts.contest);
    const gameSeconds = e.period === lastPeriod ? Math.max(0, lastClock - e.clock) : 0;
    at += Math.max(MIN_EVENT_SECONDS, gameSeconds);
    lastClock = e.clock;
    lastPeriod = e.period;
    frames.push({ at, period: e.period, clock: e.clock, score: e.score, onCourt: [...onCourt], players: { ...positions }, flash: null, offense: null, ...patch });
  };

  /** Offense in its spots (or still in the backcourt), the defense picking them up. */
  const setFormation = (offense: Side, backcourt: boolean, first?: number) => {
    const attackers = team(offense);
    if (first !== undefined) attackers.sort((a, b) => (a === first ? -1 : b === first ? 1 : 0));
    attackers.forEach((id, i) => (positions[id] = spot(offense, startingOffense, OFFENSE_SPOTS[i % 5], backcourt)));
    guard(offense, undefined, backcourt);
  };

  /** Who has the ball when a possession starts: whoever passes or shoots first in it. */
  const handlerAfter = (index: number, side: Side): number => {
    for (const e of timeline.events.slice(index + 1)) {
      if (e.type === "possession") break;
      if (e.type === "pass" && e.team === side) return holderOr(e.from, side);
      if ((e.type === "shot" || e.type === "turnover" || e.type === "freeThrow") && e.team === side) return holderOr(e.player, side);
      if (e.type === "foul" && e.on && byId.get(e.on)?.side === side) return holderOr(e.on, side);
    }
    return team(side)[0];
  };

  let offense: Side = startingOffense;
  timeline.events.forEach((e, index) => {
    switch (e.type) {
      case "possession": {
        offense = e.team;
        matchups = new Map(); // change of possession: everyone picks up the nearest man
        const handler = handlerAfter(index, e.team);
        setFormation(e.team, !e.frontcourt, handler);
        emit(e, { ball: { holder: handler }, caption: `${e.team === "home" ? "Home" : "Away"} ball`, offense });
        if (!e.frontcourt) setFormation(e.team, false, handler); // next frame: up the floor
        break;
      }
      case "timeout":
        emit(e, { ball: { holder: handlerAfter(index, offense) }, caption: "Timeout", flash: "whistle", offense });
        setFormation(offense, false, handlerAfter(index, offense));
        break;
      case "substitution": {
        positions[e.in] = positions[e.out] ?? { ...BENCH };
        positions[e.out] = { ...BENCH };
        onCourt = onCourt.map((id) => (id === e.out ? e.in : id));
        // The new man takes over his teammate's assignment, or the man his teammate was guarding.
        matchups = new Map([...matchups].map(([d, a]) => [d === e.out ? e.in : d, a === e.out ? e.in : a]));
        emit(e, { ball: { holder: handlerAfter(index, offense) }, caption: `${who(e.in)} checks in for ${who(e.out)}`, offense });
        break;
      }
      case "pass":
        emit(e, { ball: { holder: e.to }, caption: `${who(e.from)} finds ${who(e.to)}`, offense }, { contest: e.to });
        break;
      case "shot": {
        const where = toCourt({ x: e.x, y: e.y }, e.team, startingOffense);
        positions[e.player] = where;
        const range = e.zone === "backcourt" ? "from way downtown" : e.value === 3 ? "for three" : e.zone === "ra" ? "at the rim" : "from " + (e.zone === "mid" ? "mid-range" : "the paint");
        emit(e, { ball: { holder: e.player }, caption: `${who(e.player)} ${range}...`, offense }, { contest: e.player });
        frames.push({
          ...frames[frames.length - 1],
          at: at + SHOT_FLIGHT_SECONDS,
          ball: { at: hoop(e.team, startingOffense), inAir: true },
          caption: `${who(e.player)} ${range}... ${e.made ? (e.value === 3 ? "BANG!" : "GOOD!") : "no good"}${e.fouled ? " (and the foul)" : ""}`,
          flash: e.made ? "make" : "miss",
        });
        at += SHOT_FLIGHT_SECONDS;
        break;
      }
      case "freeThrow": {
        const h = hoop(e.team, startingOffense);
        positions[e.player] = { x: h.x + (h.x > 47 ? -15 : 15), y: 25 };
        emit(e, { ball: { at: h, inAir: true }, caption: `${who(e.player)} free throw ${e.n} of ${e.of}: ${e.made ? "good" : "missed"}`, flash: e.made ? "make" : "miss", offense });
        break;
      }
      case "rebound": {
        const shootingSide: Side = e.offensive ? e.team : e.team === "home" ? "away" : "home";
        const h = hoop(shootingSide, startingOffense);
        const rebounder = holderOr(e.player, e.team);
        if (rebounder !== undefined) positions[rebounder] = { x: h.x + (h.x > 47 ? -6 : 6), y: 25 + ((rebounder % 7) - 3) * 1.5 };
        const caption = e.player ? `${e.offensive ? "Offensive rebound" : "Rebound"}, ${who(e.player)}` : `${e.offensive ? "Offensive" : "Team"} rebound`;
        // As the board comes down, the defense is still guarding the team that shot.
        emit(e, { ball: { holder: rebounder }, caption, offense: e.team }, { guarding: shootingSide });
        break;
      }
      case "turnover":
        emit(e, {
          ball: { holder: e.stolenBy ? holderOr(e.stolenBy, e.team === "home" ? "away" : "home") : holderOr(e.player, e.team) },
          caption: e.stolenBy ? `Stolen by ${who(e.stolenBy)}!` : e.player ? `Turnover, ${who(e.player)}` : "Turnover",
          flash: "whistle",
          offense,
        });
        break;
      case "foul": {
        const caption =
          e.kind === "intentional" ? `${who(e.player)} fouls ${who(e.on)} to stop the clock` : e.kind === "shooting" ? `Shooting foul on ${who(e.player)}` : `Foul on ${who(e.player)}`;
        const fouledSide = e.on ? byId.get(e.on)?.side ?? offense : offense;
        emit(e, { ball: { holder: holderOr(e.on, fouledSide) }, caption, flash: "whistle", offense: fouledSide });
        break;
      }
      case "periodEnd": {
        const tied = e.score.home === e.score.away;
        emit(e, { ball: { at: { x: 47, y: 25 }, inAir: false }, caption: tied ? "Tied at the buzzer. Overtime!" : "Final", offense: null });
        break;
      }
      case "periodStart": {
        if (e.lineups) {
          for (const id of onCourt) positions[id] = { ...BENCH };
          onCourt = [...e.lineups.home, ...e.lineups.away];
        }
        matchups = new Map();
        // Jump ball: everyone around the center circle.
        onCourt.forEach((id, i) => {
          const angle = (i / onCourt.length) * 2 * Math.PI;
          positions[id] = { x: 47 + Math.cos(angle) * 8, y: 25 + Math.sin(angle) * 8 };
        });
        emit(e, { ball: { at: { x: 47, y: 25 }, inAir: true }, caption: "Overtime tip-off", offense: null });
        break;
      }
    }
  });
  return frames;
}

/** The two keyframes around replay time t, and how far between them it is. */
export function frameAt(frames: Frame[], t: number): { frame: Frame; next: Frame | null; progress: number } {
  if (frames.length === 0) throw new Error("no frames");
  if (t <= frames[0].at) return { frame: frames[0], next: null, progress: 0 };
  for (let i = 1; i < frames.length; i++) {
    if (t < frames[i].at) {
      const prev = frames[i - 1];
      const next = frames[i];
      return { frame: prev, next, progress: (t - prev.at) / (next.at - prev.at) };
    }
  }
  return { frame: frames[frames.length - 1], next: null, progress: 0 };
}

export function lerpPoint(a: Point, b: Point, p: number): Point {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}
