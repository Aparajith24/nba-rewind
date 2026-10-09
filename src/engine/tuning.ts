/**
 * Every adjustable number in the simulation, in one place.
 *
 * The basketball rules behind them are in docs/simulation-rules.md. Numbers marked
 * START are first guesses, to be tuned once
 * no-swap simulations can be checked against how real games ended.
 */

export const TUNING = {
  /** Playoff profile blend: weight on his real playoff stats = minutes / (minutes + this). START */
  playoffTrustMinutes: 300,
  /** Shot-level blend: zone % = (makes + prior% × this) / (attempts + this), prior = his other profile or the league. START */
  zoneTrustAttempts: 15,
  /** Step-up ratios are trusted by total playoff minutes behind them, same shape as above. START */
  stepUpTrustMinutes: 600,
  /** Step-up ratios outside this range are treated as noise. START */
  stepUpClamp: [0.6, 1.6] as const,

  /** Surprise element: per-timeline shooting swing, bigger for small samples, capped at ±5 points. */
  surpriseMaxPoints: 0.05,
  /** Playoff shots at which the surprise swing is half its max. START */
  surpriseHalfShots: 40,

  /** Hot hand: in-game shooting vs season shifts who gets the ball. START */
  hotHand: {
    /** How strongly shooting above/below his season shifts his share of shots. */
    strength: 1,
    /** In-game shots at which the hot-hand signal is half trusted (2/2 counts less than 8/10). */
    halfShots: 5,
    /** Limits on the shot-share multiplier: a nudge, so stars still lead. */
    minBoost: 0.7,
    maxBoost: 1.4,
    /** Small effect on whether it goes in: make% shifts by this × (boost − 1). */
    makeBump: 0.03,
  },

  /** Crunch time (the NBA's clutch definition): last 5 minutes of the 4th or OT, score within 5. */
  clutch: {
    seconds: 300,
    margin: 5,
    /** Clutch minutes at which his clutch usage and his regular-season usage count equally. START */
    trustMinutes: 60,
  },

  /** Playmaking: losing (or adding) a creator changes how easily teammates score. START */
  playmaking: {
    /** How strongly the change in the lineup's offensive lift moves teammates' make %. */
    strength: 1,
    /** League-typical share of made shots that are assisted; players above it rely more on creators. */
    typicalAssistedShare: 0.6,
    /** Limits on the multiplier on a teammate's make %. */
    clamp: [0.85, 1.15] as const,
  },

  /** Defense on the floor: make% × (defenders' defensive rating / league), clamped. START */
  defenseClamp: [0.9, 1.1] as const,
  /** Last shot: in the final seconds of a close game the ball goes to the top option. */
  lastShot: {
    /** Inside this many seconds of the 4th quarter or overtime... */
    seconds: 24,
    /** ...with the score this close... */
    margin: 5,
    /** ...shot share follows usage raised to this power (2: a 33% option takes about half). START */
    usagePower: 2,
  },

  /** Fouling: what NBA teams actually do (sources in docs/simulation-rules.md). */
  fouling: {
    /** Up 3 on defense: chance of fouling, by seconds left. */
    upThreeMidWindow: 10,
    upThreeMidChance: 0.15,
    upThreeLateWindow: 6,
    upThreeLateChance: 0.5,
    /** Trailing with the other team in possession: foul when within this many seconds. START */
    trailingWindow: 60,
    /** ...and only if the deficit is reachable: points per remaining possession, roughly. START */
    reachablePointsPerPossession: 3,
    secondsPerPossessionWhenFouling: 6,
  },

  /** Time costs, in seconds, sampled uniformly between [min, max]. START */
  time: {
    bringUpBackcourt: [4, 6] as const,
    /** Trailing late: they push the ball up as fast as they can. */
    urgentBringUp: [2.5, 4] as const,
    /** Trailing late: they shoot leaving at least this much on the clock (for a rebound or a foul). */
    trailingReserve: [2, 4] as const,
    inboundFrontcourt: [0.8, 1.6] as const,
    /** Trailing late: how long they work before shooting, after crossing half court. */
    trailingWork: [3, 8] as const,
    /** Tied late: shoot with this much left (holding for the last shot). */
    lastShotLeft: [1.2, 3.5] as const,
    /** Normal possession length. */
    normalPossession: [8, 18] as const,
    /** Leading late: shoot with this much left on the shot clock. */
    leadingShotClockLeft: [1, 5] as const,
    intentionalFoul: [1, 3] as const,
    putback: [0.5, 1.2] as const,
    kickOut: [1, 2] as const,
    reboundGather: [0.3, 0.8] as const,
  },

  /** "Late game": inside this many seconds of the 4th quarter or overtime. */
  lateGameSeconds: 120,
  /** Below this many seconds a heave from the backcourt is the only shot. */
  heaveSeconds: 1.5,

  /** Shooting fouls: chance a shot draws a foul, from his free-throw trips per shot. 3s are fouled far less. START */
  threeFoulFactor: 0.3,
  andOneMakeFactor: 0.4,
  /** Turnovers that are steals (ball stays live). START */
  stealShare: 0.5,
  /** Offensive rebound chance on a missed free throw. START */
  freeThrowOrebChance: 0.12,
  /** A rebounder counts as a big (putback) above this restricted-area share of his shots. START */
  bigRestrictedAreaShare: 0.35,
  maxOvertimes: 4,
} as const;
