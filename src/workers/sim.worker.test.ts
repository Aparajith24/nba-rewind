/**
 * Drives the real worker file the way the page does, to prove the "Simulations" choice
 * is honored: asking for N runs returns exactly N timelines, for the swap and the baseline.
 */

import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import type { Tally } from "@/engine/analysis";
import { buildSimInput } from "@/engine/input";
import type { LeagueFile, MomentFile, PlayerFile } from "@/engine/types";

const DATA = path.join(process.cwd(), "public", "data");
const hasData = fs.existsSync(path.join(DATA, "moments", "2013-finals-g6-allen.json"));
const read = <T>(...parts: string[]): T => JSON.parse(fs.readFileSync(path.join(DATA, ...parts), "utf8"));

type Reply = { id: number; kind: string; swapped: Tally; baseline: Tally };
const replies: Reply[] = [];
const fakeSelf = { postMessage: (m: Reply) => replies.push(m), onmessage: null as null | ((e: { data: unknown }) => void) };

describe.skipIf(!hasData)("simulation worker", () => {
  beforeAll(async () => {
    (globalThis as unknown as { self: typeof fakeSelf }).self = fakeSelf;
    await import("./sim.worker");
  });

  function inputs() {
    const moment = read<MomentFile>("moments", "2013-finals-g6-allen.json");
    const swap = { out: 951, in: 201939, season: "2015-16" }; // Curry for Ray Allen
    const ids = [...moment.lineups.home, ...moment.lineups.away].map((p) => p.playerId).concat(swap.in);
    const playerFiles = Object.fromEntries(ids.map((id) => [id, read<PlayerFile>("players", `${id}.json`)]));
    const leagues = Object.fromEntries(["2012-13", "2015-16"].map((s) => [s, read<LeagueFile>("leagues", `${s}.json`)]));
    return {
      input: buildSimInput({ moment, playerFiles, leagues, swap, seed: "w" }),
      baseline: buildSimInput({ moment, playerFiles, leagues, seed: "w" }),
    };
  }

  async function run(id: number, runs: number): Promise<Reply> {
    fakeSelf.onmessage!({ data: { id, ...inputs(), runs } });
    for (let i = 0; i < 500; i++) {
      const done = replies.find((r) => r.id === id && r.kind === "done");
      if (done) return done;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("worker never finished");
  }

  it.each([250, 1000])("runs exactly %i timelines when asked for %i", async (runs) => {
    const done = await run(runs, runs);
    expect(done.swapped.runs).toBe(runs);
    expect(done.baseline.runs).toBe(runs);
    // Results streamed in batches before the final message.
    expect(replies.filter((r) => r.id === runs && r.kind === "progress").length).toBe(Math.ceil(runs / 250) - 1);
  });
});
