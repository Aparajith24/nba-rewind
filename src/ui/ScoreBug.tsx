import type { Moment, Side } from "@/lib/types";
import { TeamLogo } from "./TeamLogo";

/** Broadcast-style score bug on a light card, so team logos (many are dark) read clearly. */

export function formatClock(seconds: number): string {
  if (seconds < 60) return seconds.toFixed(1);
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.floor(seconds - m * 60)).padStart(2, "0")}`;
}

function periodLabel(period: number): string {
  return period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`;
}

/** The live parts of the score bug: during a replay these change every frame. */
export type ScoreState = { period: number; clockSeconds: number; score: Record<Side, number>; possession: Side | null };

function TeamSide({ moment, state, side }: { moment: Moment; state: ScoreState; side: Side }) {
  const team = moment.teams[side];
  const hasBall = state.possession === side;
  const isHome = side === "home";
  return (
    <div className={`flex flex-1 items-center gap-3 sm:gap-4 ${isHome ? "flex-row-reverse" : ""}`}>
      <TeamLogo teamId={team.teamId} tricode={team.tricode} size={52} />
      <div className={`flex flex-col ${isHome ? "items-end" : "items-start"}`}>
        <span className="flex items-center gap-1.5 font-mono text-xs font-semibold tracking-widest text-scorebug-muted">
          {isHome ? null : team.tricode}
          {hasBall ? <span className="rounded-sm bg-scorebug-ink px-1 text-[9px] text-scorebug">BALL</span> : null}
          {isHome ? team.tricode : null}
        </span>
        <span className="font-mono text-4xl font-bold leading-none tabular-nums text-scorebug-ink sm:text-5xl">{state.score[side]}</span>
      </div>
    </div>
  );
}

export function ScoreBug({ moment, live }: { moment: Moment; live?: ScoreState }) {
  const state: ScoreState = live ?? moment.state;
  return (
    <div className="overflow-hidden rounded-xl bg-scorebug shadow-lg shadow-black/30">
      <div className="flex items-center gap-2 px-4 py-4 sm:px-6">
        <TeamSide moment={moment} state={state} side="away" />
        <div className="flex flex-col items-center px-2 sm:px-6">
          <span className="font-mono text-xs font-semibold tracking-widest text-scorebug-muted">{periodLabel(state.period)}</span>
          <span className="font-mono text-3xl font-bold tabular-nums text-clock sm:text-4xl">{formatClock(state.clockSeconds)}</span>
        </div>
        <TeamSide moment={moment} state={state} side="home" />
      </div>
      {/* Team color strip: our own away/home colors, not official team colors. */}
      <div className="flex h-1.5">
        <div className="flex-1 bg-away" />
        <div className="flex-1 bg-home" />
      </div>
    </div>
  );
}
