/**
 * Every exported moment must be playable: the sim runs from its real state, and the real
 * ending replays on the court and lands on the real final score.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildFrames, type ReplayPlayer } from "@/animation/frames";
import { buildSimInput } from "../input";
import { simulateTimeline } from "../simulate";
import type { LeagueFile, MomentFile, PlayerFile, Side } from "../types";

const DATA = path.join(process.cwd(), "public", "data");
const MOMENTS = path.join(DATA, "moments");
const files = fs.existsSync(MOMENTS) ? fs.readdirSync(MOMENTS).filter((f) => f.endsWith(".json")) : [];
const read = <T>(...parts: string[]): T => JSON.parse(fs.readFileSync(path.join(DATA, ...parts), "utf8"));

describe.skipIf(files.length === 0)("every moment", () => {
  it.each(files)("%s plays", (file) => {
    const moment = read<MomentFile>("moments", file);
    const starters: ReplayPlayer[] = (["home", "away"] as Side[]).flatMap((side) =>
      moment.lineups[side].map((p) => ({ playerId: p.playerId, name: p.name, side, x: p.x, y: p.y })),
    );
    const ids = starters.map((p) => p.playerId);
    const playerFiles = Object.fromEntries(ids.map((id) => [id, read<PlayerFile>("players", `${id}.json`)]));
    const leagues = { [moment.rulesSeason]: read<LeagueFile>("leagues", `${moment.rulesSeason}.json`) };
    const input = buildSimInput({ moment, playerFiles, leagues, seed: "all" });

    for (let i = 0; i < 20; i++) {
      const t = simulateTimeline(input, `all:${i}`);
      expect(t.final.home).not.toBe(t.final.away);
      expect(t.final.home).toBeGreaterThanOrEqual(moment.state.score.home);
      expect(t.final.away).toBeGreaterThanOrEqual(moment.state.score.away);
    }

    const real = moment.realTimeline;
    const roster: ReplayPlayer[] = Object.entries(real.players).map(([id, p]) => {
      return starters.find((s) => s.playerId === Number(id)) ?? { playerId: Number(id), name: p.name, side: p.side, x: 47, y: -3 };
    });
    const frames = buildFrames(roster, real, moment.state.possession, ids);
    expect(frames[frames.length - 1].score).toEqual(moment.realFinal.score);
    for (const f of frames) expect(f.onCourt).toHaveLength(10);
  });
});
