import type { Moment, Side } from "@/lib/types";
import { TeamLogo } from "./TeamLogo";

/**
 * Broadcast-style scoreboard: home on the left, away on the right, clock in the middle.
 * A light card on the dark page so team logos (many are dark) read clearly.
 */

export function formatClock(seconds: number): string {
  if (seconds < 60) return seconds.toFixed(1);
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.floor(seconds - m * 60)).padStart(2, "0")}`;
}

export function periodLabel(period: number): string {
  return period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`;
}

/** The live parts of the scoreboard: during a replay these change every frame. */
export type ScoreState = { period: number; clockSeconds: number; score: Record<Side, number>; possession: Side | null };

function TeamSide({ moment, state, side }: { moment: Moment; state: ScoreState; side: Side }) {
  const team = moment.teams[side];
  const right = side === "away";
  return (
    <div className={`flex flex-1 items-center gap-3 sm:gap-4 ${right ? "flex-row-reverse text-right" : ""}`}>
      <TeamLogo teamId={team.teamId} tricode={team.tricode} size={56} />
      <div className="flex flex-col">
        <span className="text-sm font-medium tracking-wide text-scorebug-muted">{team.tricode}</span>
        <span className="text-4xl font-bold leading-none tabular-nums sm:text-5xl">{state.score[side]}</span>
        <span className="mt-1 text-xs text-scorebug-muted">{team.name}</span>
      </div>
    </div>
  );
}

export function ScoreBug({ moment, live }: { moment: Moment; live?: ScoreState }) {
  const state: ScoreState = live ?? moment.state;
  const ball = state.possession ? moment.teams[state.possession].tricode : null;
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-scorebug px-4 py-4 text-scorebug-ink sm:px-6">
      <TeamSide moment={moment} state={state} side="home" />
      <div className="flex min-w-32 flex-col items-center gap-1.5">
        <span className="text-xs font-semibold tracking-widest text-scorebug-muted">{periodLabel(state.period)}</span>
        <span className="text-3xl font-bold tabular-nums sm:text-4xl">{formatClock(state.clockSeconds)}</span>
        <div className="flex h-1 w-28 overflow-hidden rounded-full sm:w-40">
          <div className="flex-1 bg-scorebug-ink" />
          <div className="flex-1 bg-scorebug-muted" />
        </div>
        <span className="h-4 text-xs text-scorebug-muted">{ball ? `${ball} ball ●` : ""}</span>
      </div>
      <TeamSide moment={moment} state={state} side="away" />
    </div>
  );
}
