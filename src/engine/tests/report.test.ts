/**
 * A readable report of what the engine does on the Ray Allen moment, for reviewing the
 * basketball. Not a pass/fail test; skipped unless asked for:
 *
 *     SIM_REPORT=1 npx vitest run report
 */

import fs from "node:fs";
import path from "node:path";
import { it } from "vitest";

import { buildSimInput, type Swap } from "../input";
import { simulateBatch, simulateTimeline } from "../simulate";
import type { LeagueFile, MomentFile, PlayerFile, SimEvent } from "../types";

const DATA = path.join(process.cwd(), "public", "data");
const read = <T>(...parts: string[]): T => JSON.parse(fs.readFileSync(path.join(DATA, ...parts), "utf8"));
const RUNS = 5000;

function input(seed: string, swap?: Swap) {
  const moment = read<MomentFile>("moments", "2013-finals-g6-allen.json");
  const ids = [...moment.lineups.home, ...moment.lineups.away].map((p) => p.playerId);
  if (swap) ids.push(swap.in);
  const playerFiles = Object.fromEntries(ids.map((id) => [id, read<PlayerFile>("players", `${id}.json`)]));
  const seasons = [...new Set([moment.rulesSeason, ...(swap ? [swap.season] : [])])];
  const leagues = Object.fromEntries(seasons.map((s) => [s, read<LeagueFile>("leagues", `${s}.json`)]));
  return buildSimInput({ moment, playerFiles, leagues, swap, seed });
}

function describeEvent(e: SimEvent, names: Map<number, string>): string {
  const who = (id: number) => names.get(id) ?? String(id);
  const head = `Q${e.period} ${e.clock.toFixed(1).padStart(5)}  ${e.score.away}-${e.score.home}  `;
  switch (e.type) {
    case "possession": return head + `${e.team} ball${e.frontcourt ? " (frontcourt)" : ""}`;
    case "timeout": return head + `${e.team} timeout`;
    case "pass": return head + `${who(e.from)} → ${who(e.to)}`;
    case "shot": return head + `${who(e.player)} ${e.value}PT ${e.zone} ${e.made ? "GOOD" : "miss"}${e.fouled ? " (fouled)" : ""}`;
    case "freeThrow": return head + `${who(e.player)} FT ${e.n}/${e.of} ${e.made ? "good" : "miss"}`;
    case "rebound": return head + `${who(e.player)} ${e.offensive ? "OFFENSIVE" : "defensive"} rebound`;
    case "turnover": return head + `${who(e.player)} turnover${e.stolenBy ? ` (stolen by ${who(e.stolenBy)})` : ""}`;
    case "foul": return head + `${who(e.player)} ${e.kind} foul on ${who(e.on)}`;
    case "periodEnd": return head + "— end of period —";
    case "periodStart": return head + "— overtime —";
    case "substitution": return head + `${who(e.in)} in for ${who(e.out)}`;
  }
}

it.skipIf(!process.env.SIM_REPORT)("Ray Allen moment report", () => {
  const scenarios: [string, Swap | undefined][] = [
    ["No swap (real 2013 Heat)", undefined],
    ["Stephen Curry 2015-16 for Ray Allen", { out: 951, in: 201939, season: "2015-16" }],
    ["Tim Duncan 2012-13 back in for Boris Diaw", { out: 2564, in: 1495, season: "2012-13" }],
    ["Shaquille O'Neal 1999-00 for Ray Allen", { out: 951, in: 406, season: "1999-00" }],
  ];
  for (const [label, swap] of scenarios) {
    const sim = input("report", swap);
    const { summary } = simulateBatch(sim, 0, RUNS);
    const o = summary.outcomes;
    console.log(`\n${label}: history changed in ${(summary.historyChanged * 100).toFixed(1)}% of ${RUNS} timelines`);
    console.log(`  Heat win in regulation ${(o.realWinnerRegulation * 100).toFixed(1)}%, Heat win in OT ${(o.realWinnerOvertime * 100).toFixed(1)}%, ` +
      `Spurs win in regulation ${(o.realLoserRegulation * 100).toFixed(1)}%, Spurs win in OT ${(o.realLoserOvertime * 100).toFixed(1)}%`);
    const shooters = new Map<string, number>();
    let firstShots = 0;
    for (let i = 0; i < RUNS; i++) {
      const t = simulateTimeline(sim, `report:${i}`);
      const first = t.events.find((e) => e.type === "shot" && e.team === "home");
      if (first?.type === "shot") {
        firstShots++;
        const name = [...sim.players.home].find((p) => p.playerId === first.player)?.name ?? "?";
        shooters.set(name, (shooters.get(name) ?? 0) + 1);
      }
    }
    const top = [...shooters.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${((c / firstShots) * 100).toFixed(0)}%`);
    console.log(`  Who takes Miami's first shot: ${top.join(", ")}`);
  }

  const sim = input("featured");
  const names = new Map([...sim.players.home, ...sim.players.away].map((p) => [p.playerId, p.name]));
  console.log("\nProfiles (home first):");
  for (const p of [...sim.players.home, ...sim.players.away]) {
    const three = ((p.zoneShare.left_corner3 + p.zoneShare.right_corner3 + p.zoneShare.above_break3) * 100).toFixed(0);
    console.log(`  ${p.name.padEnd(14)} usage ${(p.usage * 100).toFixed(1)}%  hot hand ×${p.hotHand.toFixed(2)}  threes ${three}% of shots, ` +
      `corner3 ${(p.zonePct.right_corner3 * 100).toFixed(0)}%, ATB3 ${(p.zonePct.above_break3 * 100).toFixed(0)}%  FT ${(p.ftPct * 100).toFixed(0)}%  projected ${(p.projected * 100).toFixed(0)}%`);
  }
  for (const seed of ["featured:0", "featured:1", "featured:2"]) {
    const t = simulateTimeline(sim, seed);
    console.log(`\nTimeline ${seed} → final SAS ${t.final.away} - MIA ${t.final.home}${t.historyChanged ? "  HISTORY CHANGED" : "  history holds"}`);
    for (const e of t.events) console.log("  " + describeEvent(e, names));
  }
});
