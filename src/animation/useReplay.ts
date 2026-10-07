"use client";

import { useEffect, useRef, useState } from "react";

import type { Side } from "@/engine/types";
import { frameAt, lerpPoint, type Frame, type Point, type ReplayPlayer } from "./frames";

/** Plays keyframes back with the browser's animation clock and hands out what to draw right now. */

export type ReplayStatus = "idle" | "playing" | "paused" | "done";

export type ReplayView = {
  players: (ReplayPlayer & { jersey?: string })[];
  ball: { x: number; y: number; inAir: boolean } | null;
  live: { period: number; clockSeconds: number; score: Record<Side, number>; possession: Side | null } | null;
  caption: string | null;
  flash: Frame["flash"];
  offense: Side | null;
};

/** The ball sits just off the holder's shoulder. */
const BALL_OFFSET = { x: 1.6, y: -1.6 };
const FLASH_SECONDS = 0.6;

function ballPoint(frame: Frame, positions: Record<number, Point>) {
  if ("holder" in frame.ball) {
    const p = positions[frame.ball.holder] ?? { x: 47, y: 25 };
    return { x: p.x + BALL_OFFSET.x, y: p.y + BALL_OFFSET.y, inAir: false };
  }
  return { ...frame.ball.at, inAir: frame.ball.inAir };
}

export function useReplay(frames: Frame[], roster: (ReplayPlayer & { jersey?: string })[], speed: number) {
  const [status, setStatus] = useState<ReplayStatus>("idle");
  const [t, setT] = useState(0);
  const raf = useRef<number | null>(null);

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

  const start = () => {
    setT(0);
    setStatus("playing");
  };
  const reset = () => {
    setT(0);
    setStatus("idle");
  };
  /** Freeze where it is; resume picks up from the same instant. */
  const pause = () => setStatus((s) => (s === "playing" ? "paused" : s));
  const resume = () => setStatus((s) => (s === "paused" ? "playing" : s));

  let view: ReplayView | null = null;
  if (status !== "idle" && frames.length > 0) {
    const { frame, next, progress } = frameAt(frames, t);
    const current: Record<number, Point> = {};
    for (const id of frame.onCourt) {
      const a = frame.players[id];
      current[id] = next ? lerpPoint(a, next.players[id] ?? a, progress) : a;
    }
    const byId = new Map(roster.map((p) => [p.playerId, p]));
    const fromBall = ballPoint(frame, frame.players);
    const toBall = next ? ballPoint(next, next.players) : fromBall;
    const sameHolder = "holder" in frame.ball && next && "holder" in next.ball && next.ball.holder === frame.ball.holder;
    const clock = next && next.period === frame.period ? frame.clock + (next.clock - frame.clock) * progress : frame.clock;
    view = {
      players: frame.onCourt.filter((id) => byId.has(id)).map((id) => ({ ...byId.get(id)!, ...current[id] })),
      ball: sameHolder ? ballPoint(frame, current) : { ...lerpPoint(fromBall, toBall, progress), inAir: next ? toBall.inAir : fromBall.inAir },
      live: { period: frame.period, clockSeconds: Math.max(0, clock), score: frame.score, possession: frame.offense },
      caption: frame.caption,
      flash: t - frame.at < FLASH_SECONDS ? frame.flash : null,
      offense: frame.offense,
    };
  }
  return { status, start, reset, pause, resume, view };
}
