/**
 * Engine inputs and outputs. Inputs mirror the JSON files the pipeline writes
 * (public/data/...); the output is an event log the animation plays back.
 * No UI or DOM types here.
 */

export type Side = "home" | "away";

export const ZONES = ["ra", "paint", "mid", "left_corner3", "right_corner3", "above_break3", "backcourt"] as const;
export type Zone = (typeof ZONES)[number];
export const THREE_ZONES: readonly Zone[] = ["left_corner3", "right_corner3", "above_break3", "backcourt"];

/** One profile (playoffs or regular season) from public/data/players/{id}.json. Totals plus NBA rates. */
export type SeasonProfile = Record<string, number | null>;

export type StepUp = {
  playoff_minutes: number;
  usage: number | null;
  true_shooting: number | null;
  three_rate: number | null;
  free_throw_rate: number | null;
  turnover_rate: number | null;
  offensive_rebound_rate: number | null;
  defensive_rebound_rate: number | null;
  defensive_rating: number | null;
  [stat: string]: number | null;
};

export type PlayerSeason = {
  team: string;
  team_id: number;
  age: number | null;
  playoffs?: SeasonProfile;
  regularSeason?: SeasonProfile;
  stepUp?: StepUp;
  impact?: Impact;
};

/** Crunch-time usage and on/off offensive lift (pipeline transform.player_impact). */
export type Impact = {
  /** Share of team plays in the last 5 minutes with the score within 5. */
  clutchUsage: number | null;
  clutchMinutes: number;
  /** Points per 100 possessions his team scored with him on vs. off the floor (estimated before 2007-08). */
  offensiveLift: number | null;
  liftSource: "on/off" | "estimated";
};

/** public/data/players/{id}.json */
export type PlayerFile = { id: number; name: string; seasons: Record<string, PlayerSeason> };

/** public/data/leagues/{season}.json */
export type LeagueFile = {
  season: string;
  rules: Record<string, number | boolean>;
  playoffAdjustment: Record<string, number>;
  playoffs: Record<string, number>;
  regularSeason: Record<string, number>;
};

export type InGameShooting = { fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number; pts: number };

/** public/data/moments/{id}.json (the parts the engine reads). */
export type MomentFile = {
  id: string;
  season: string;
  rulesSeason: string;
  state: { period: number; clockSeconds: number; score: Record<Side, number>; possession: Side };
  realFinal: { periods: number; score: Record<Side, number>; winner: Side };
  timeoutsLeft: Record<Side, number>;
  teams: Record<Side, { teamId: number; tricode: string }>;
  lineups: Record<Side, { playerId: number; name: string; season: string; x: number; y: number }[]>;
  inGame: Record<string, InGameShooting>;
  realTimeline: RealTimeline;
};

/** A player as the sim sees him: one season's playoff profile, ready to roll dice with. */
export type SimPlayer = {
  playerId: number;
  name: string;
  season: string;
  side: Side;
  /** Share of team plays he finishes while on the floor. */
  usage: number;
  /** Hot-hand multiplier on his share of shots (1 = neutral). */
  hotHand: number;
  /** Share of his shots from each zone (sums to 1). */
  zoneShare: Record<Zone, number>;
  /** Make % from each zone. */
  zonePct: Record<Zone, number>;
  /** Chance a two-point attempt draws a shooting foul. */
  shootingFoulRate: number;
  ftPct: number;
  /** Turnovers per possession he uses. */
  turnoverRate: number;
  offensiveReboundPct: number;
  defensiveReboundPct: number;
  /** Points allowed per 100 possessions while he's on the floor. */
  defensiveRating: number;
  /** How far his profile leaned on projection instead of real playoff stats (0 = all real). */
  projected: number;
  /** Playoff field goal attempts behind his profile (drives the surprise element). */
  playoffShots: number;
  /** His share of the offense in crunch time (last 5 minutes, within 5); his regular usage when there's no clutch data. */
  clutchUsage: number;
  /** Points per 100 his team scores with him on vs. off the floor. */
  offensiveLift: number;
  /** Share of his made shots that were assisted: how much he relies on someone setting him up. */
  assistedShare: number;
};

export type SimInput = {
  moment: MomentFile;
  /** All ten players, keyed by side, swaps already applied. */
  players: Record<Side, SimPlayer[]>;
  /** The moment's season: defense baseline. */
  league: LeagueFile;
  seed: string;
  /**
   * Playmaking change from the swap, per team: (sum of the five's offensive lift now −
   * with the real five) ÷ league points per 100. 0 for both teams with no swap.
   */
  playmakingChange: Record<Side, number>;
  /** The swapped-in player, whose own shooting already reflects his own game. */
  swappedIn: number | null;
};

type Stamp = { period: number; clock: number; score: Record<Side, number> };

export type SimEvent = Stamp &
  (
    | { type: "possession"; team: Side; frontcourt: boolean }
    | { type: "timeout"; team: Side }
    | { type: "pass"; team: Side; from: number; to: number }
    | { type: "shot"; team: Side; player: number; zone: Zone; value: 2 | 3; made: boolean; x: number; y: number; fouled: boolean }
    | { type: "freeThrow"; team: Side; player: number; made: boolean; n: number; of: number }
    | { type: "rebound"; team: Side; player: number; offensive: boolean }
    | { type: "turnover"; team: Side; player: number; stolenBy: number | null }
    | { type: "foul"; team: Side; player: number; on: number; kind: "intentional" | "shooting" | "personal" }
    | { type: "periodEnd" }
    | { type: "periodStart"; lineups?: Record<Side, number[]> }
    /** Real games only: the sim keeps the same ten players. */
    | { type: "substitution"; team: Side; out: number; in: number }
  );

/** In a rebound or turnover, player 0 means the team (a team rebound, a shot-clock violation). */
export type Timeline = {
  seed: string;
  events: SimEvent[];
  final: Record<Side, number>;
  periods: number;
  winner: Side;
  historyChanged: boolean;
};

/** What really happened after the moment's start (public/data/moments/{id}.json realTimeline). */
export type RealTimeline = Timeline & { players: Record<string, { name: string; side: Side }> };

export type Summary = {
  timelines: number;
  historyChanged: number;
  /** Share of timelines (0..1) for each way the game ended. */
  outcomes: Record<"realWinnerRegulation" | "realWinnerOvertime" | "realLoserRegulation" | "realLoserOvertime", number>;
};
