/**
 * Build the playoff version of a player-season the sim plays with (rules in
 * docs/simulation-rules.md, "The players"):
 *
 *   projection  = regular season × league playoff adjustment × his career step-up
 *   profile     = blend of his real playoff stats and the projection, trusting each by sample size
 *
 * Full playoff run → essentially his real playoff stats. A game or two → mostly projection.
 * No playoff games → pure projection. The hot hand is separate (in-game, see hotHandBoost).
 */

import { TUNING } from "./tuning";
import type { Impact, InGameShooting, LeagueFile, PlayerFile, SeasonProfile, Side, SimPlayer, StepUp, Zone } from "./types";
import { THREE_ZONES, ZONES } from "./types";

const FT_TRIP = 0.44; // free throw attempts per "trip": converts FTA into possessions used

const num = (p: SeasonProfile | undefined, key: string): number => (p?.[key] ?? 0) as number;

/** (made + prior × k) / (attempts + k): trust a rate more the more attempts back it. */
function blendRate(made: number, attempts: number, prior: number, k: number): number {
  return (made + prior * k) / (attempts + k);
}

function seasonYear(season: string): number {
  return Number(season.slice(0, 4));
}

/** His step-up on one stat, from his *other* playoff runs: closer seasons count more, trusted by total minutes. */
export function careerStepUp(file: PlayerFile, season: string, stat: keyof StepUp): number {
  const [lo, hi] = TUNING.stepUpClamp;
  let weighted = 0;
  let weights = 0;
  let minutes = 0;
  for (const [s, entry] of Object.entries(file.seasons)) {
    const ratio = entry.stepUp?.[stat];
    if (s === season || ratio == null || !entry.stepUp) continue;
    const m = entry.stepUp.playoff_minutes;
    const w = m / (1 + Math.abs(seasonYear(s) - seasonYear(season)));
    weighted += w * Math.min(hi, Math.max(lo, ratio));
    weights += w;
    minutes += m;
  }
  if (weights === 0) return 1;
  const trust = minutes / (minutes + TUNING.stepUpTrustMinutes);
  return 1 + (weighted / weights - 1) * trust;
}

function zoneStats(p: SeasonProfile | undefined) {
  const made = {} as Record<Zone, number>;
  const att = {} as Record<Zone, number>;
  for (const z of ZONES) {
    made[z] = num(p, `${z}_fgm`);
    att[z] = num(p, `${z}_fga`);
  }
  return { made, att };
}

function shares(att: Record<Zone, number>): Record<Zone, number> {
  // Backcourt heaves are end-of-clock accidents, not part of a player's shot diet.
  const total = ZONES.filter((z) => z !== "backcourt").reduce((s, z) => s + att[z], 0);
  const out = {} as Record<Zone, number>;
  for (const z of ZONES) out[z] = z === "backcourt" || total === 0 ? 0 : att[z] / total;
  return out;
}

function leagueZonePct(league: LeagueFile, zone: Zone): number {
  return league.playoffs[`${zone}_fg_pct`] ?? league.regularSeason[`${zone}_fg_pct`] ?? 0.4;
}

function leagueZoneShare(league: LeagueFile): Record<Zone, number> {
  const out = {} as Record<Zone, number>;
  for (const z of ZONES) out[z] = z === "backcourt" ? 0 : league.regularSeason[`${z}_fga_share`] ?? 0;
  const total = ZONES.reduce((s, z) => s + out[z], 0) || 1;
  for (const z of ZONES) out[z] /= total;
  return out;
}

type Rates = {
  zoneShare: Record<Zone, number>;
  zonePct: Record<Zone, number>;
  shootingFoulRate: number;
  ftPct: number;
  turnoverRate: number;
  usage: number;
  offensiveReboundPct: number;
  defensiveReboundPct: number;
  defensiveRating: number;
};

/** Rates from one profile, each blended toward `prior` by its own sample size. */
function profileRates(p: SeasonProfile | undefined, prior: Rates): Rates {
  const k = TUNING.zoneTrustAttempts;
  const { made, att } = zoneStats(p);
  const shots = ZONES.reduce((s, z) => s + att[z], 0);
  const zonePct = {} as Record<Zone, number>;
  for (const z of ZONES) zonePct[z] = blendRate(made[z], att[z], prior.zonePct[z], k);
  const own = shares(att);
  const shareTrust = shots / (shots + k);
  const zoneShare = {} as Record<Zone, number>;
  for (const z of ZONES) zoneShare[z] = shareTrust * own[z] + (1 - shareTrust) * prior.zoneShare[z];

  const fga = num(p, "fga");
  const fta = num(p, "fta");
  const tov = num(p, "tov");
  const uses = fga + FT_TRIP * fta + tov;
  const minutes = num(p, "min");
  const minuteTrust = minutes / (minutes + TUNING.playoffTrustMinutes);
  const orPrior = (v: number | null | undefined, priorValue: number) => (v == null ? priorValue : minuteTrust * v + (1 - minuteTrust) * priorValue);

  return {
    zoneShare,
    zonePct,
    shootingFoulRate: blendRate(FT_TRIP * fta * 0.5, fga, prior.shootingFoulRate, k),
    ftPct: blendRate(num(p, "ftm"), fta, prior.ftPct, k),
    turnoverRate: blendRate(tov, uses, prior.turnoverRate, k),
    usage: orPrior(p?.usg_pct, prior.usage),
    offensiveReboundPct: orPrior(p?.oreb_pct, prior.offensiveReboundPct),
    defensiveReboundPct: orPrior(p?.dreb_pct, prior.defensiveReboundPct),
    defensiveRating: orPrior(p?.def_rating, prior.defensiveRating),
  };
}

/**
 * A fringe player that season: the prior for small samples, since barely playing is itself
 * evidence of a weaker player. Defense stays at the league average (a fringe player's
 * defensive rating mostly reflects garbage-time opponents).
 */
function benchRates(league: LeagueFile): Rates {
  const average = leagueRates(league);
  if (!league.bench) return average;
  return { ...profileRates(league.bench, average), defensiveRating: average.defensiveRating };
}

function leagueRates(league: LeagueFile): Rates {
  const lp = league.playoffs;
  const zonePct = {} as Record<Zone, number>;
  for (const z of ZONES) zonePct[z] = leagueZonePct(league, z);
  return {
    zoneShare: leagueZoneShare(league),
    zonePct,
    shootingFoulRate: (FT_TRIP * lp.fta * 0.5) / lp.fga,
    ftPct: lp.ft_pct,
    turnoverRate: lp.tov_per_poss,
    usage: 0.2,
    offensiveReboundPct: lp.oreb_pct / 5,
    defensiveReboundPct: (1 - lp.oreb_pct) / 5,
    defensiveRating: lp.pts_per_100,
  };
}

/** Regular season → playoffs: × league adjustment that year × his career step-up. */
function project(rs: Rates, file: PlayerFile, season: string, ownLeague: LeagueFile): Rates {
  const adj = (key: string) => ownLeague.playoffAdjustment[key] ?? 1;
  const step = (key: keyof StepUp) => careerStepUp(file, season, key);

  const shooting = adj("true_shooting") * step("true_shooting");
  const zonePct = {} as Record<Zone, number>;
  for (const z of ZONES) zonePct[z] = Math.min(0.95, rs.zonePct[z] * shooting);

  const threes = adj("three_rate") * step("three_rate");
  const raw = {} as Record<Zone, number>;
  for (const z of ZONES) raw[z] = rs.zoneShare[z] * (THREE_ZONES.includes(z) ? threes : 1);
  const total = ZONES.reduce((s, z) => s + raw[z], 0) || 1;
  const zoneShare = {} as Record<Zone, number>;
  for (const z of ZONES) zoneShare[z] = raw[z] / total;

  return {
    zoneShare,
    zonePct,
    shootingFoulRate: rs.shootingFoulRate * adj("free_throw_rate") * step("free_throw_rate"),
    ftPct: rs.ftPct,
    turnoverRate: rs.turnoverRate * adj("turnover_rate") * step("turnover_rate"),
    usage: rs.usage * step("usage"),
    offensiveReboundPct: rs.offensiveReboundPct * adj("offensive_rebound_rate") * step("offensive_rebound_rate"),
    defensiveReboundPct: rs.defensiveReboundPct * adj("defensive_rebound_rate") * step("defensive_rebound_rate"),
    defensiveRating: rs.defensiveRating * adj("points_allowed_per_100") * step("defensive_rating"),
  };
}

/**
 * Crunch-time usage: his clutch usage, trusted by his clutch minutes, else his regular-season
 * usage (clutch samples are small; the regular season is the steadier fallback).
 */
export function clutchUsage(impact: Impact | undefined, regularUsage: number): number {
  if (!impact || impact.clutchUsage == null || impact.clutchMinutes <= 0) return regularUsage;
  const trust = impact.clutchMinutes / (impact.clutchMinutes + TUNING.clutch.trustMinutes);
  return trust * impact.clutchUsage + (1 - trust) * regularUsage;
}

/** Share of his made shots that were assisted, playoffs and regular season blended like the rest of his profile. */
function assistedShare(playoffs: SeasonProfile | undefined, regular: SeasonProfile | undefined, w: number): number {
  const fallback = TUNING.playmaking.typicalAssistedShare;
  const share = (p: SeasonProfile | undefined) => (p?.pct_fgm_unassisted == null ? null : 1 - (p.pct_fgm_unassisted as number));
  const po = share(playoffs);
  const rs = share(regular) ?? fallback;
  return po == null ? rs : w * po + (1 - w) * rs;
}

/** The hot hand shifts who gets the ball. Neutral (1) for a swapped-in player. */
export function hotHandBoost(inGame: InGameShooting | null | undefined, seasonFgPct: number): number {
  const h = TUNING.hotHand;
  if (!inGame || inGame.fga === 0) return 1;
  const diff = inGame.fgm / inGame.fga - seasonFgPct;
  const trust = inGame.fga / (inGame.fga + h.halfShots);
  return Math.min(h.maxBoost, Math.max(h.minBoost, 1 + h.strength * diff * trust));
}

export function buildSimPlayer(args: {
  file: PlayerFile;
  season: string;
  side: Side;
  /** League file for the player's own season (for the projection). */
  ownLeague: LeagueFile;
  /** His shooting earlier in this game; omit for a swapped-in player. */
  inGame?: InGameShooting | null;
}): SimPlayer {
  const { file, season, side, ownLeague, inGame } = args;
  const entry = file.seasons[season];
  if (!entry) throw new Error(`${file.name} has no ${season} season`);

  const bench = benchRates(ownLeague);
  const regular = profileRates(entry.regularSeason, bench);
  const projected = entry.regularSeason ? project(regular, file, season, ownLeague) : bench;

  const poMinutes = num(entry.playoffs, "min");
  const w = poMinutes / (poMinutes + TUNING.playoffTrustMinutes);
  const playoff = profileRates(entry.playoffs, projected);
  const mix = (a: number, b: number) => w * a + (1 - w) * b;

  const zoneShare = {} as Record<Zone, number>;
  for (const z of ZONES) zoneShare[z] = mix(playoff.zoneShare[z], projected.zoneShare[z]);
  // Zone % is already blended shot-by-shot toward the projection inside profileRates.
  const zonePct = playoff.zonePct;
  const seasonFgPct = ZONES.reduce((s, z) => s + zoneShare[z] * zonePct[z], 0);

  return {
    playerId: file.id,
    name: file.name,
    season,
    side,
    usage: mix(playoff.usage, projected.usage),
    hotHand: hotHandBoost(inGame, seasonFgPct),
    zoneShare,
    zonePct,
    shootingFoulRate: mix(playoff.shootingFoulRate, projected.shootingFoulRate),
    ftPct: playoff.ftPct,
    turnoverRate: mix(playoff.turnoverRate, projected.turnoverRate),
    offensiveReboundPct: mix(playoff.offensiveReboundPct, projected.offensiveReboundPct),
    defensiveReboundPct: mix(playoff.defensiveReboundPct, projected.defensiveReboundPct),
    defensiveRating: mix(playoff.defensiveRating, projected.defensiveRating),
    projected: 1 - w,
    playoffShots: num(entry.playoffs, "fga"),
    clutchUsage: clutchUsage(entry.impact, regular.usage),
    offensiveLift: entry.impact?.offensiveLift ?? 0,
    assistedShare: assistedShare(entry.playoffs, entry.regularSeason, w),
  };
}
