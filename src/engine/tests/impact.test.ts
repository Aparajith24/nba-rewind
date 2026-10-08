/** Crunch-time usage and playmaking. */

import { describe, expect, it } from "vitest";

import { buildSimInput } from "../input";
import { clutchUsage } from "../profile";
import { TUNING } from "../tuning";
import type { LeagueFile, MomentFile, PlayerFile } from "../types";

describe("clutch usage", () => {
  it("falls back to regular-season usage without clutch data", () => {
    expect(clutchUsage(undefined, 0.25)).toBe(0.25);
    expect(clutchUsage({ clutchUsage: null, clutchMinutes: 0, offensiveLift: null, liftSource: "estimated" }, 0.25)).toBe(0.25);
  });

  it("trusts clutch usage more with more clutch minutes", () => {
    const few = clutchUsage({ clutchUsage: 0.43, clutchMinutes: 10, offensiveLift: 0, liftSource: "on/off" }, 0.31);
    const many = clutchUsage({ clutchUsage: 0.43, clutchMinutes: 126, offensiveLift: 0, liftSource: "on/off" }, 0.31);
    expect(few).toBeGreaterThan(0.31);
    expect(many).toBeGreaterThan(few);
    expect(many).toBeLessThan(0.43);
    // At exactly the trust minutes, the two count equally.
    expect(clutchUsage({ clutchUsage: 0.4, clutchMinutes: TUNING.clutch.trustMinutes, offensiveLift: 0, liftSource: "on/off" }, 0.2)).toBeCloseTo(0.3);
  });
});

describe("playmaking change", () => {
  const profile = { gp: 10, min: 300, fga: 100, fgm: 45, fta: 20, ftm: 15, tov: 10, usg_pct: 0.2, oreb_pct: 0.05, dreb_pct: 0.15, def_rating: 105 };
  const player = (id: number, lift: number): PlayerFile => ({
    id,
    name: `P${id}`,
    seasons: { "2015-16": { team: "T", team_id: 1, age: 25, regularSeason: profile, playoffs: profile, impact: { clutchUsage: null, clutchMinutes: 0, offensiveLift: lift, liftSource: "on/off" } } },
  });
  const league = {
    season: "2015-16",
    rules: {},
    playoffAdjustment: {},
    playoffs: { pts_per_100: 100, fta: 1, fga: 4, ft_pct: 0.75, tov_per_poss: 0.13, oreb_pct: 0.25 },
    regularSeason: {},
  } as unknown as LeagueFile;
  const lineup = (ids: number[]) => ids.map((playerId) => ({ playerId, name: `P${playerId}`, season: "2015-16", x: 50, y: 25 }));
  const moment = { rulesSeason: "2015-16", lineups: { home: lineup([1, 2, 3, 4, 5]), away: lineup([6, 7, 8, 9, 10]) }, inGame: {} } as unknown as MomentFile;
  const files = Object.fromEntries([...Array(11).keys()].slice(1).map((id) => [id, player(id, id === 1 ? 15 : 0)]));
  files[99] = player(99, -3);

  it("is zero with no swap", () => {
    const input = buildSimInput({ moment, playerFiles: files, leagues: { "2015-16": league }, seed: "x" });
    expect(input.playmakingChange).toEqual({ home: 0, away: 0 });
  });

  it("drops when a creator is swapped for a weaker one, only for his team", () => {
    const input = buildSimInput({ moment, playerFiles: files, leagues: { "2015-16": league }, seed: "x", swap: { out: 1, in: 99, season: "2015-16" } });
    expect(input.playmakingChange.home).toBeCloseTo((-3 - 15) / 100);
    expect(input.playmakingChange.away).toBe(0);
    expect(input.swappedIn).toBe(99);
  });
});
