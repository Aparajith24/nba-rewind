import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildSimInput } from "@/engine/input";
import { simulateTimeline } from "@/engine/simulate";
import type { LeagueFile, MomentFile, PlayerFile, Side } from "@/engine/types";
import { buildFrames, frameAt, type ReplayPlayer } from "./frames";

const DATA = path.join(process.cwd(), "public", "data");
const hasData = fs.existsSync(path.join(DATA, "moments", "2013-finals-g6-allen.json"));
const read = <T>(...parts: string[]): T => JSON.parse(fs.readFileSync(path.join(DATA, ...parts), "utf8"));

describe.skipIf(!hasData)("replay frames", () => {
  const moment = read<MomentFile>("moments", "2013-finals-g6-allen.json");
  const players: ReplayPlayer[] = (["home", "away"] as Side[]).flatMap((side) =>
    moment.lineups[side].map((p) => ({ playerId: p.playerId, name: p.name, side, x: p.x, y: p.y })),
  );
  const playerFiles = Object.fromEntries(players.map((p) => [p.playerId, read<PlayerFile>("players", `${p.playerId}.json`)]));
  const leagues = { [moment.rulesSeason]: read<LeagueFile>("leagues", `${moment.rulesSeason}.json`) };

  it("stages every timeline in order, on the court, ending on the final score", () => {
    for (let i = 0; i < 100; i++) {
      const input = buildSimInput({ moment, playerFiles, leagues, seed: "frames" });
      const timeline = simulateTimeline(input, `frames:${i}`);
      const frames = buildFrames(players, timeline, moment.state.possession, players.map((p) => p.playerId));

      expect(frames.length).toBeGreaterThan(0);
      for (let k = 1; k < frames.length; k++) expect(frames[k].at).toBeGreaterThan(frames[k - 1].at);
      expect(frames[frames.length - 1].score).toEqual(timeline.final);
      for (const f of frames) {
        expect(f.onCourt).toHaveLength(10);
        for (const p of players) {
          const pos = f.players[p.playerId];
          expect(pos.x).toBeGreaterThanOrEqual(-4);
          expect(pos.x).toBeLessThanOrEqual(98);
          expect(pos.y).toBeGreaterThanOrEqual(-4);
          expect(pos.y).toBeLessThanOrEqual(54);
        }
      }
    }
  });

  it("stages what really happened, substitutions and overtime included", () => {
    const real = moment.realTimeline;
    const roster: ReplayPlayer[] = Object.entries(real.players).map(([id, p]) => {
      const starter = players.find((s) => s.playerId === Number(id));
      return starter ?? { playerId: Number(id), name: p.name, side: p.side, x: 47, y: -3 };
    });
    const frames = buildFrames(roster, real, moment.state.possession, players.map((p) => p.playerId));
    expect(frames[frames.length - 1].score).toEqual(real.final);
    expect(real.final).toEqual(moment.realFinal.score);
    for (const f of frames) {
      expect(f.onCourt).toHaveLength(10);
      for (const id of f.onCourt) expect(f.players[id]).toBeDefined();
    }
    // Ray Allen's three ties it at 95.
    expect(frames.some((f) => f.caption.includes("Allen for three... BANG!") && f.score.home === 95)).toBe(true);
  });

  it("interpolates between keyframes", () => {
    const input = buildSimInput({ moment, playerFiles, leagues, seed: "lerp" });
    const frames = buildFrames(players, simulateTimeline(input, "lerp:0"), moment.state.possession, players.map((p) => p.playerId));
    const mid = (frames[0].at + frames[1].at) / 2;
    const { frame, next, progress } = frameAt(frames, mid);
    expect(frame).toBe(frames[0]);
    expect(next).toBe(frames[1]);
    expect(progress).toBeCloseTo(0.5);
  });
});

describe.skipIf(!hasData)("defense", () => {
  const moment = read<MomentFile>("moments", "2013-finals-g6-allen.json");
  const starters: ReplayPlayer[] = (["home", "away"] as Side[]).flatMap((side) =>
    moment.lineups[side].map((p) => ({ playerId: p.playerId, name: p.name, side, x: p.x, y: p.y })),
  );

  it("keeps every attacker guarded, closing out on the shooter", () => {
    const real = moment.realTimeline;
    const roster: ReplayPlayer[] = Object.entries(real.players).map(([id, p]) => {
      const starter = starters.find((s) => s.playerId === Number(id));
      return starter ?? { playerId: Number(id), name: p.name, side: p.side, x: 47, y: -3 };
    });
    const frames = buildFrames(roster, real, moment.state.possession, starters.map((p) => p.playerId));
    const allenShot = frames.find((f) => f.caption === "Allen for three...")!;
    const allen = allenShot.players[951];
    const spurs = allenShot.onCourt.filter((id) => roster.find((p) => p.playerId === id)!.side === "away");
    const closest = Math.min(...spurs.map((id) => Math.hypot(allenShot.players[id].x - allen.x, allenShot.players[id].y - allen.y)));
    expect(closest).toBeLessThan(3); // someone is in his face
  });
});
