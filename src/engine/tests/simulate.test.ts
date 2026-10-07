/**
 * Engine tests: determinism, bookkeeping, and sanity on the Ray Allen moment.
 * Real-data tests read public/data/ and skip if the pipeline hasn't been run.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildSimInput, type Swap } from "../input";
import { careerStepUp, hotHandBoost } from "../profile";
import { createRng } from "../rng";
import { simulateBatch, simulateTimeline } from "../simulate";
import type { LeagueFile, MomentFile, PlayerFile } from "../types";

const DATA = path.join(process.cwd(), "public", "data");
const MOMENT = path.join(DATA, "moments", "2013-finals-g6-allen.json");
const hasData = fs.existsSync(MOMENT);
const read = <T>(...parts: string[]): T => JSON.parse(fs.readFileSync(path.join(DATA, ...parts), "utf8"));

function allenInput(seed: string, swap?: Swap) {
  const moment = read<MomentFile>("moments", "2013-finals-g6-allen.json");
  const ids = [...moment.lineups.home, ...moment.lineups.away].map((p) => p.playerId);
  if (swap) ids.push(swap.in);
  const playerFiles = Object.fromEntries(ids.map((id) => [id, read<PlayerFile>("players", `${id}.json`)]));
  const seasons = new Set([moment.rulesSeason, ...(swap ? [swap.season] : [])]);
  const leagues = Object.fromEntries([...seasons].map((s) => [s, read<LeagueFile>("leagues", `${s}.json`)]));
  return buildSimInput({ moment, playerFiles, leagues, swap, seed });
}

describe("rng", () => {
  it("is reproducible from a seed", () => {
    const a = createRng("abc");
    const b = createRng("abc");
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
    expect(createRng("abd").next()).not.toEqual(createRng("abc").next());
  });
});

describe("hot hand", () => {
  it("is neutral without in-game shots and grows with the sample", () => {
    expect(hotHandBoost(null, 0.45)).toBe(1);
    expect(hotHandBoost({ fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pts: 0 }, 0.45)).toBe(1);
    const small = hotHandBoost({ fgm: 2, fga: 2, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pts: 4 }, 0.45);
    const big = hotHandBoost({ fgm: 8, fga: 10, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pts: 16 }, 0.45);
    expect(small).toBeGreaterThan(1);
    expect(big).toBeGreaterThan(small); // 8/10 counts more than 2/2
    expect(hotHandBoost({ fgm: 1, fga: 8, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pts: 2 }, 0.45)).toBeLessThan(1);
  });
});

describe.skipIf(!hasData)("Ray Allen moment", () => {
  it("is deterministic: same seed, same timeline", () => {
    const a = simulateTimeline(allenInput("seed-1"), "seed-1:0");
    const b = simulateTimeline(allenInput("seed-1"), "seed-1:0");
    expect(a).toEqual(b);
  });

  it("keeps the score consistent with the events", () => {
    for (let i = 0; i < 200; i++) {
      const t = simulateTimeline(allenInput("books"), `books:${i}`);
      const points = { home: 92, away: 95 };
      for (const e of t.events) {
        if (e.type === "shot" && e.made) points[e.team] += e.value;
        if (e.type === "freeThrow" && e.made) points[e.team] += 1;
        expect(e.score).toEqual(points);
      }
      expect(t.final).toEqual(points);
      expect(t.final.home).not.toEqual(t.final.away);
      // The clock only runs down within a period.
      for (let k = 1; k < t.events.length; k++) {
        if (t.events[k].period === t.events[k - 1].period) expect(t.events[k].clock).toBeLessThanOrEqual(t.events[k - 1].clock);
      }
    }
  });

  it("never fouls up 3 with more than 10 seconds left", () => {
    for (let i = 0; i < 300; i++) {
      const t = simulateTimeline(allenInput("fouls"), `fouls:${i}`);
      for (const e of t.events) {
        if (e.type !== "foul" || e.kind !== "intentional") continue;
        const defenseLead = e.score[e.team] - e.score[e.team === "home" ? "away" : "home"];
        if (defenseLead === 3) expect(e.clock).toBeLessThanOrEqual(10);
      }
    }
  });

  it("produces a plausible no-swap result", () => {
    const { summary } = simulateBatch(allenInput("plausible"), 0, 2000);
    // Down 3 with 19 s and no timeouts, the Heat tie or win only some of the time.
    // History "holds" (Heat win) needs a tie then an OT win, or a regulation win.
    expect(summary.historyChanged).toBeGreaterThan(0.55);
    expect(summary.historyChanged).toBeLessThan(0.97);
  });
});

describe("career step-up", () => {
  it("ignores the season being projected and trusts more minutes", () => {
    const file: PlayerFile = {
      id: 1,
      name: "Test",
      seasons: {
        "2010-11": { team: "T", team_id: 1, age: 25, stepUp: { playoff_minutes: 600, usage: 1.2, true_shooting: 1, three_rate: 1, free_throw_rate: 1, turnover_rate: 1, offensive_rebound_rate: 1, defensive_rebound_rate: 1, defensive_rating: 1 } },
        "2011-12": { team: "T", team_id: 1, age: 26, stepUp: { playoff_minutes: 600, usage: 0.5, true_shooting: 1, three_rate: 1, free_throw_rate: 1, turnover_rate: 1, offensive_rebound_rate: 1, defensive_rebound_rate: 1, defensive_rating: 1 } },
      },
    };
    const step = careerStepUp(file, "2011-12", "usage");
    expect(step).toBeGreaterThan(1); // only 2010-11 counts
    expect(step).toBeLessThan(1.2); // and it's trusted partially (600 of 1200)
  });
});
