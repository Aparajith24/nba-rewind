"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { buildFrames, frameAt, lerpPoint, type Frame, type Point, type ReplayPlayer } from "@/animation/frames";
import type { MomentFile, Side, Timeline } from "@/engine/types";
import type { Moment } from "@/lib/types";
import { Court, type CourtBall } from "./Court";
import { ScoreBug, type ScoreState } from "./ScoreBug";

/**
 * Freeze frame, then a timeline played back on the court.
 * With no swap it's what really happened (history holds by definition); swaps come next.
 */

type Status = "idle" | "playing" | "done";
const SPEEDS = [1, 2] as const;
/** The ball sits just off the holder's shoulder. */
const BALL_OFFSET = { x: 1.6, y: -1.6 };

function ballPoint(frame: Frame, positions: Record<number, Point>): CourtBall {
  if ("holder" in frame.ball) {
    const p = positions[frame.ball.holder] ?? { x: 47, y: 25 };
    return { x: p.x + BALL_OFFSET.x, y: p.y + BALL_OFFSET.y, inAir: false };
  }
  return { ...frame.ball.at, inAir: frame.ball.inAir };
}

function periodsLabel(periods: number) {
  return periods > 4 ? ` (${periods - 4 === 1 ? "OT" : `${periods - 4}OT`})` : "";
}

export function ReplayPanel({ moment }: { moment: Moment & MomentFile }) {
  const starters = useMemo(
    () => (["home", "away"] as Side[]).flatMap((side) => moment.lineups[side].map((p) => ({ playerId: p.playerId, name: p.name, side, x: p.x, y: p.y }))),
    [moment],
  );
  // Everyone who appears in the real ending (substitutes included), starters at their moment positions.
  const roster: ReplayPlayer[] = useMemo(() => {
    const byId = new Map(starters.map((p) => [p.playerId, p]));
    for (const [id, p] of Object.entries(moment.realTimeline.players)) {
      if (!byId.has(Number(id))) byId.set(Number(id), { playerId: Number(id), name: p.name, side: p.side, x: 47, y: -3 });
    }
    return [...byId.values()];
  }, [moment, starters]);

  const timeline: Timeline = moment.realTimeline;
  const frames = useMemo(
    () => buildFrames(roster, timeline, moment.state.possession, starters.map((p) => p.playerId)),
    [roster, timeline, moment, starters],
  );

  const [status, setStatus] = useState<Status>("idle");
  const [t, setT] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const raf = useRef<number | null>(null);

  // Advance replay time with the browser's animation clock.
  useEffect(() => {
    if (status !== "playing" || frames.length === 0) return;
    let last = performance.now();
    const end = frames[frames.length - 1].at;
    const tick = (now: number) => {
      const dt = ((now - last) / 1000) * speed;
      last = now;
      setT((prev) => {
        const next = prev + dt;
        if (next >= end) {
          setStatus("done");
          return end;
        }
        return next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [status, frames, speed]);

  // What to draw right now.
  let courtPlayers = starters;
  let ball: CourtBall | null = null;
  let live: ScoreState | undefined;
  let caption = moment.hook;
  let flash: Frame["flash"] = null;
  let offense: Side | null = moment.state.possession;

  if (status !== "idle" && frames.length > 0) {
    const { frame, next, progress } = frameAt(frames, t);
    const current: Record<number, Point> = {};
    for (const id of frame.onCourt) {
      const a = frame.players[id];
      current[id] = next ? lerpPoint(a, next.players[id] ?? a, progress) : a;
    }
    const byId = new Map(roster.map((p) => [p.playerId, p]));
    courtPlayers = frame.onCourt.map((id) => ({ ...byId.get(id)!, ...current[id] }));
    const fromBall = ballPoint(frame, frame.players);
    const toBall = next ? ballPoint(next, next.players) : fromBall;
    const sameHolder = "holder" in frame.ball && next && "holder" in next.ball && next.ball.holder === frame.ball.holder;
    ball = sameHolder ? ballPoint(frame, current) : { ...lerpPoint(fromBall, toBall, progress), inAir: next ? toBall.inAir : fromBall.inAir };
    const clock = next && next.period === frame.period ? frame.clock + (next.clock - frame.clock) * progress : frame.clock;
    live = { period: frame.period, clockSeconds: Math.max(0, clock), score: frame.score, possession: frame.offense };
    caption = frame.caption;
    flash = t - frame.at < 0.6 ? frame.flash : null;
    offense = frame.offense;
  }

  return (
    <div className="flex flex-col gap-4">
      <ScoreBug moment={moment} live={live} />
      <Court players={courtPlayers} offense={offense} ball={ball} flash={flash} animateIn={status === "idle"} />

      <div className="min-h-12 rounded-lg bg-surface px-4 py-3 font-mono text-sm tracking-wide" aria-live="polite">
        {caption}
      </div>

      {status === "done" ? (
        <div className="rounded-xl border-2 border-accent px-4 py-4 text-center font-mono text-lg font-bold tracking-[0.2em] text-accent animate-pop-in">
          WHAT REALLY HAPPENED
          <div className="mt-1 text-xs font-normal tracking-widest text-muted">
            {moment.teams.away.tricode} {timeline.final.away} – {moment.teams.home.tricode} {timeline.final.home}
            {periodsLabel(timeline.periods)}. Swap a player to see if history changes.
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setT(0);
            setStatus("playing");
          }}
          disabled={status === "playing"}
          className="rounded-lg bg-accent px-5 py-2.5 font-mono text-sm font-bold tracking-widest text-background disabled:opacity-50"
        >
          {status === "idle" ? "WATCH WHAT REALLY HAPPENED ▸" : "REPLAY ↻"}
        </button>
        <div className="ml-auto flex items-center gap-1 font-mono text-xs text-muted">
          SPEED
          {SPEEDS.map((s) => (
            <button key={s} type="button" onClick={() => setSpeed(s)} className={`rounded px-2 py-1 ${speed === s ? "bg-surface-raised text-foreground" : ""}`}>
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
