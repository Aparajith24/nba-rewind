import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { addToTally, emptyTally, firstPlay, timelineResult } from "../analysis";
import { buildSimInput } from "../input";
import { simulateTimeline } from "../simulate";
import type { LeagueFile, MomentFile, PlayerFile, Timeline } from "../types";

const DATA = path.join(process.cwd(), "public", "data");
const hasData = fs.existsSync(path.join(DATA, "moments", "2013-finals-g6-allen.json"));
const read = <T>(...parts: string[]): T => JSON.parse(fs.readFileSync(path.join(DATA, ...parts), "utf8"));

const stamp = { period: 4, clock: 10, score: { home: 92, away: 95 } };
const timeline = (events: Timeline["events"]): Timeline => ({ seed: "t", events, final: { home: 92, away: 95 }, periods: 4, winner: "away", historyChanged: true });

describe("first play", () => {
  it("classifies the first trip down the floor", () => {
    const miss = { ...stamp, type: "shot", team: "home", player: 1, zone: "above_break3", value: 3, made: false, x: 70, y: 10, fouled: false } as const;
    expect(firstPlay(timeline([{ ...miss, made: true }]), "home")).toEqual({ play: "made", shooter: 1 });
    expect(firstPlay(timeline([miss, { ...stamp, type: "rebound", team: "home", player: 2, offensive: true }]), "home").play).toBe("missedOffensiveRebound");
    expect(firstPlay(timeline([miss, { ...stamp, type: "rebound", team: "away", player: 9, offensive: false }]), "home").play).toBe("missedDefensiveRebound");
    expect(firstPlay(timeline([{ ...stamp, type: "turnover", team: "home", player: 1, stolenBy: null }]), "home").play).toBe("turnoverOrFoul");
  });
});

describe.skipIf(!hasData)("tally", () => {
  it("adds up across real simulated timelines", () => {
    const moment = read<MomentFile>("moments", "2013-finals-g6-allen.json");
    const ids = [...moment.lineups.home, ...moment.lineups.away].map((p) => p.playerId);
    const playerFiles = Object.fromEntries(ids.map((id) => [id, read<PlayerFile>("players", `${id}.json`)]));
    const leagues = { [moment.rulesSeason]: read<LeagueFile>("leagues", `${moment.rulesSeason}.json`) };
    const input = buildSimInput({ moment, playerFiles, leagues, seed: "tally" });
    const tally = emptyTally();
    for (let i = 0; i < 300; i++) addToTally(tally, timelineResult(simulateTimeline(input, `tally:${i}`), "home"), 4);
    expect(tally.runs).toBe(300);
    expect(tally.wins.home + tally.wins.away).toBe(300);
    expect(Object.values(tally.firstPlay).reduce((a, b) => a + b, 0)).toBe(300);
  });
});
