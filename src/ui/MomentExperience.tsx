"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { buildFrames, type ReplayPlayer } from "@/animation/frames";
import { useReplay } from "@/animation/useReplay";
import type { Tally } from "@/engine/analysis";
import { buildSimInput } from "@/engine/input";
import { simulateTimeline, timelineSeed } from "@/engine/simulate";
import type { MomentFile, PlayerFile, Side, Timeline } from "@/engine/types";
import { loadLeagues, loadPlayer, loadPlayers } from "@/lib/data";
import type { Moment } from "@/lib/types";
import { Court } from "./Court";
import { OnCourtStrip, type StripPlayer } from "./OnCourtStrip";
import { PlayerComparison } from "./PlayerComparison";
import { ScoreBug } from "./ScoreBug";
import { HowItWorks, MomentDetails } from "./SideCards";
import { SimulationResults } from "./SimulationResults";
import { SwapCard, type SwapChoice } from "./SwapCard";

/**
 * The whole moment page: pick a swap, run thousands of timelines in a Web Worker,
 * and replay one on the court. With no swap, the replay is what really happened.
 */

const RUN_OPTIONS = [1000, 10000, 25000] as const;
const SPEEDS = [1, 2] as const;

type Roster = (ReplayPlayer & { jersey?: string })[];

function newSeed() {
  return Math.random().toString(36).slice(2, 10);
}

export function MomentExperience({ moment, header }: { moment: Moment & MomentFile; header: ReactNode }) {
  const starters: Roster = useMemo(
    () =>
      (["home", "away"] as Side[]).flatMap((side) =>
        moment.lineups[side].map((p) => ({ playerId: p.playerId, name: p.name, side, x: p.x, y: p.y, jersey: (p as { jersey?: string }).jersey })),
      ),
    [moment],
  );

  const [outId, setOutId] = useState<number | null>(null);
  const [choice, setChoice] = useState<SwapChoice | null>(null);
  const [runs, setRuns] = useState<(typeof RUN_OPTIONS)[number]>(10000);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [tally, setTally] = useState<Tally | null>(null);
  const [baseline, setBaseline] = useState<Tally | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featured, setFeatured] = useState<{ timeline: Timeline; roster: Roster } | null>(null);
  const [files, setFiles] = useState<{ out: PlayerFile; in: PlayerFile } | null>(null);
  const worker = useRef<Worker | null>(null);
  const runId = useRef(0);

  const swapReady = outId !== null && choice !== null;
  const outPlayer = starters.find((p) => p.playerId === outId) ?? null;

  // Load both players' files for the comparison as soon as a swap is chosen.
  useEffect(() => {
    if (!swapReady) return;
    let cancelled = false;
    Promise.all([loadPlayer(outId), loadPlayer(choice.playerId)]).then(([out, inn]) => {
      if (!cancelled) setFiles({ out, in: inn });
    });
    return () => {
      cancelled = true;
    };
  }, [swapReady, outId, choice]);

  useEffect(() => () => worker.current?.terminate(), []);

  // What the court replays: the featured simulated timeline, or what really happened.
  const replaySource = useMemo(() => {
    if (featured) return { timeline: featured.timeline, roster: featured.roster, onCourt: featured.roster.map((p) => p.playerId) };
    const roster: Roster = [...starters];
    for (const [id, p] of Object.entries(moment.realTimeline.players)) {
      if (!roster.some((r) => r.playerId === Number(id))) roster.push({ playerId: Number(id), name: p.name, side: p.side, x: 47, y: -3, jersey: (p as { jersey?: string }).jersey });
    }
    return { timeline: moment.realTimeline as Timeline, roster, onCourt: starters.map((p) => p.playerId) };
  }, [featured, moment, starters]);

  const frames = useMemo(
    () => buildFrames(replaySource.roster, replaySource.timeline, moment.state.possession, replaySource.onCourt),
    [replaySource, moment],
  );
  const replay = useReplay(frames, replaySource.roster, speed);

  const resetResults = () => {
    runId.current += 1;
    setTally(null);
    setBaseline(null);
    setFeatured(null);
    setRunning(false);
    replay.reset();
  };

  const runSimulation = async () => {
    if (!swapReady) return;
    const id = ++runId.current;
    setError(null);
    setRunning(true);
    setTally(null);
    setBaseline(null);
    try {
      const seed = newSeed();
      const ids = [...starters.map((p) => p.playerId), choice.playerId];
      const [playerFiles, leagues] = await Promise.all([loadPlayers(ids), loadLeagues([moment.rulesSeason, choice.season])]);
      const swap = { out: outId, in: choice.playerId, season: choice.season };
      const input = buildSimInput({ moment, playerFiles, leagues, swap, seed });
      const base = buildSimInput({ moment, playerFiles, leagues, seed });

      // One featured timeline to watch, on the main thread.
      const timeline = simulateTimeline(input, timelineSeed(seed, 0));
      const roster: Roster = starters.map((p) =>
        p.playerId === outId ? { ...p, playerId: choice.playerId, name: playerFiles[choice.playerId].name, jersey: undefined } : p,
      );
      setFeatured({ timeline, roster });

      // Thousands more in the background, streaming in.
      if (!worker.current) {
        worker.current = new Worker(new URL("../workers/sim.worker.ts", import.meta.url), { type: "module" });
      }
      worker.current.onmessage = (e: MessageEvent<{ id: number; kind: string; swapped: Tally; baseline: Tally }>) => {
        if (e.data.id !== id) return;
        setTally(e.data.swapped);
        setBaseline(e.data.baseline);
        if (e.data.kind === "done") setRunning(false);
      };
      worker.current.postMessage({ id, input, baseline: base, runs });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRunning(false);
    }
  };

  // Start the featured replay once it's ready.
  const featuredTimeline = featured?.timeline;
  useEffect(() => {
    if (featuredTimeline) replay.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a new featured timeline arrives
  }, [featuredTimeline]);

  const view = replay.view;
  const stripPlayers: StripPlayer[] = starters.map((p) => ({ playerId: p.playerId, name: p.name, jersey: p.jersey ?? "", side: p.side }));
  const replacement: StripPlayer | null = choice && outPlayer ? { playerId: choice.playerId, name: choice.name, jersey: "", side: outPlayer.side } : null;
  const realWinner = moment.realFinal.winner;
  const ended = replay.status === "done";

  const pauseButton = (
    <button
      type="button"
      onClick={replay.status === "paused" ? replay.resume : replay.pause}
      className="flex items-center gap-2 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background"
    >
      {replay.status === "paused" ? "▶ Resume" : "❚❚ Pause"}
    </button>
  );

  // All playback controls live at the top right, so they're on screen without scrolling.
  const replaying = replay.status === "playing" || replay.status === "paused";
  const primaryAction = replaying ? (
    pauseButton
  ) : swapReady ? (
    <button
      type="button"
      onClick={runSimulation}
      disabled={running}
      className="flex items-center gap-2 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background disabled:opacity-60"
    >
      ▶ {running ? "Simulating…" : tally ? "Run Again" : "Run Simulation"}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => {
        setFeatured(null);
        replay.start();
      }}
      className="flex items-center gap-2 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background"
    >
      ▶ {replay.status === "idle" ? "Watch What Really Happened" : "Replay"}
    </button>
  );
  const secondaryButton = "flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm";
  const secondaryActions = (
    <>
      {featured && ended ? (
        <button type="button" onClick={replay.start} className={secondaryButton}>
          ▶ Replay
        </button>
      ) : null}
      {replay.status !== "idle" ? (
        <button type="button" onClick={replay.reset} className={secondaryButton}>
          ↺ Reset
        </button>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {header}
        <div className="flex shrink-0 flex-wrap items-center gap-3 self-start">
          <span className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
            </svg>
            {moment.game}
          </span>
          {primaryAction}
          {secondaryActions}
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <ScoreBug moment={moment} live={view?.live ?? undefined} />

          <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <OnCourtStrip
              players={stripPlayers}
              selectedOut={outId}
              replacement={replacement}
              onSelect={(id) => {
                setOutId(id === outId ? null : id);
                setChoice(null);
                setFiles(null);
                resetResults();
              }}
            />
            <Court
              players={view?.players ?? starters}
              offense={view ? view.offense : moment.state.possession}
              ball={view?.ball ?? null}
              flash={view?.flash ?? null}
              animateIn={replay.status === "idle"}
            />
            <div className="min-h-11 rounded-lg bg-surface-raised px-4 py-3 text-sm" aria-live="polite">
              {error ? `Couldn't run the simulation: ${error}` : (view?.caption ?? moment.hook)}
            </div>

            {ended ? (
              <div className="rounded-xl border border-foreground/40 px-4 py-3 text-center animate-pop-in">
                <div className="text-sm font-bold tracking-[0.25em]">
                  {featured ? (featured.timeline.historyChanged ? "HISTORY CHANGED" : "HISTORY HOLDS") : "WHAT REALLY HAPPENED"}
                </div>
                <div className="mt-1 text-xs text-muted">
                  {moment.teams.home.tricode} {replaySource.timeline.final.home} – {replaySource.timeline.final.away} {moment.teams.away.tricode}
                  {replaySource.timeline.periods > 4 ? ` (${replaySource.timeline.periods - 4 === 1 ? "OT" : `${replaySource.timeline.periods - 4}OT`})` : ""}
                  {featured ? ` · really: ${moment.teams[realWinner].name} won` : " · swap a player to see if history changes"}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <label className="flex items-center gap-2 text-sm text-muted">
                Simulations
                <select
                  value={runs}
                  onChange={(e) => setRuns(Number(e.target.value) as (typeof RUN_OPTIONS)[number])}
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-foreground"
                >
                  {RUN_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n.toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
              <div className="ml-auto flex items-center gap-1 text-sm text-muted">
                Speed
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeed(s)}
                    className={`rounded-lg border px-3 py-1.5 ${speed === s ? "border-foreground text-foreground" : "border-border"}`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </section>

          {swapReady && files && outPlayer ? (
            <PlayerComparison
              out={{ file: files.out, season: moment.season, label: `${moment.teams[outPlayer.side].name} (original)`, detail: `#${outPlayer.jersey ?? ""}` }}
              swapIn={{ file: files.in, season: choice.season, label: `${choice.team} ${choice.season} (swapped in)`, detail: "Hypothetical" }}
            />
          ) : null}
        </div>

        <aside className="flex flex-col gap-5">
          <SwapCard
            outName={outPlayer?.name ?? null}
            choice={choice}
            onChoose={(c) => {
              setChoice(c);
              setFiles(null);
              resetResults();
            }}
          />
          <MomentDetails moment={moment} />
          <SimulationResults
            tally={tally}
            baseline={baseline}
            target={runs}
            teams={{ home: moment.teams.home, away: moment.teams.away }}
            offense={moment.state.possession}
            realWinner={realWinner}
            swapName={choice?.name ?? null}
            swapId={choice?.playerId ?? null}
            running={running}
          />
          <HowItWorks />
        </aside>
      </div>
    </div>
  );
}
