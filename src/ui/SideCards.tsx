import type { Moment, Side } from "@/lib/types";
import { formatClock, periodLabel } from "./ScoreBug";

/** Small static cards for the right column. */

export function MomentDetails({ moment }: { moment: Moment }) {
  const { teams, state, lineups } = moment;
  const names = (side: Side) => lineups[side].map((p) => p.name.split(" ").slice(-1)[0]).join(", ");
  const rows: [string, string][] = [
    ["Game", moment.game],
    ["Score", `${teams.home.tricode} ${state.score.home} - ${state.score.away} ${teams.away.tricode}`],
    ["Time", `${formatClock(state.clockSeconds)} left (${periodLabel(state.period)})`],
    ["Possession", teams[state.possession].name],
    [`On Court (${teams.home.tricode})`, names("home")],
    [`On Court (${teams.away.tricode})`, names("away")],
  ];
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-semibold">Key Moment Details</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section className="flex gap-3 rounded-2xl border border-border bg-surface p-5">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mt-0.5 shrink-0 text-muted" aria-hidden>
        <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" />
      </svg>
      <div className="flex flex-col gap-1 text-sm">
        <h2 className="font-semibold">How it works</h2>
        <p className="text-muted">
          With no swap you watch what really happened, play by play. Swap a player and we replay the exact game situation thousands of times, possession by
          possession, using each player&apos;s real playoff numbers and tendencies.
        </p>
      </div>
    </section>
  );
}
