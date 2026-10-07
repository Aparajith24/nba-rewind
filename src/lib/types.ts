/** Shapes of the data the app reads. They mirror what pipeline/export/*.py writes. */

export type MomentType = "Last shot" | "Clutch" | "Takeover";

/** One row of content/moments/candidates.md. */
export type MomentCandidate = {
  number: number;
  era: string;
  year: number;
  game: string;
  description: string;
  state: string;
  type: MomentType;
  /** Set once the moment has a content file and can be opened. */
  id: string | null;
  title: string | null;
  hook: string | null;
};

export type Side = "home" | "away";

export type LineupPlayer = {
  playerId: number;
  name: string;
  jersey: string;
  /** Listed position on that season's roster, e.g. "G", "F-C". */
  position: string;
  season: string;
  /** Feet from the offense's own baseline (0) to the basket it attacks (94). */
  x: number;
  /** Feet across the floor, 0 to 50. */
  y: number;
};

/** public/data/moments/{id}.json */
export type Moment = {
  id: string;
  number: number;
  title: string;
  /** e.g. "2013 NBA Finals · Game 6" */
  game: string;
  season: string;
  rulesSeason: string;
  hook: string;
  intro: string;
  realOutcome: string;
  gameId: string;
  state: {
    period: number;
    clockSeconds: number;
    score: Record<Side, number>;
    possession: Side;
  };
  realEnd: { period: number; score: Record<Side, number> };
  teams: Record<Side, { teamId: number; tricode: string; name: string; city: string }>;
  lineups: Record<Side, LineupPlayer[]>;
};
