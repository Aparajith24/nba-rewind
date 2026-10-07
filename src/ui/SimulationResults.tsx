import type { FirstPlay, Tally } from "@/engine/analysis";
import type { Side } from "@/lib/types";

/** The multiverse result: how often history changed, who won, and how the first trip went. */

type Team = { tricode: string; name: string };

function pct(n: number, of: number) {
  return of ? (100 * n) / of : 0;
}

function fmt(p: number) {
  return `${p.toFixed(1)}%`;
}

function Donut({ value }: { value: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0 -rotate-90" aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-raised)" strokeWidth="10" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="var(--foreground)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        style={{ transition: "stroke-dasharray 200ms linear" }}
      />
    </svg>
  );
}

function Bar({ label, value, count, strong }: { label: string; value: number; count: number; strong: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${strong ? "bg-foreground" : "bg-muted"}`} />
          {label}
        </span>
        <span className="tabular-nums">
          {fmt(value)} <span className="ml-3 text-muted">{count.toLocaleString()}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
        <div className={`h-full rounded-full ${strong ? "bg-foreground" : "bg-muted"}`} style={{ width: `${value}%`, transition: "width 200ms linear" }} />
      </div>
    </div>
  );
}

export function SimulationResults({
  tally,
  baseline,
  target,
  teams,
  offense,
  realWinner,
  swapName,
  swapId,
  running,
}: {
  tally: Tally | null;
  baseline: Tally | null;
  target: number;
  teams: Record<Side, Team>;
  offense: Side;
  realWinner: Side;
  swapName: string | null;
  swapId: number | null;
  running: boolean;
}) {
  if (!tally) {
    return (
      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold">Simulation Results</h2>
        <p className="text-sm text-muted">Swap a player and run the simulation to see how often history changes.</p>
      </section>
    );
  }

  const realLoser: Side = realWinner === "home" ? "away" : "home";
  const defense: Side = offense === "home" ? "away" : "home";
  const changed = pct(tally.historyChanged, tally.runs);
  const baselineChanged = baseline ? pct(baseline.historyChanged, baseline.runs) : null;
  const shooterShare = swapId !== null ? pct(tally.firstShooter[swapId] ?? 0, tally.runs) : 0;

  const scenarios: [FirstPlay, string][] = [
    ["made", `${teams[offense].name} score on their first shot`],
    ["missedDefensiveRebound", `First shot misses, ${teams[defense].name} rebound`],
    ["missedOffensiveRebound", `First shot misses, ${teams[offense].name} offensive rebound`],
    ["turnoverOrFoul", "Turnover or foul before a shot"],
  ];

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-semibold">Simulation Results</h2>

      <div className="flex items-center gap-5">
        <div className="relative">
          <Donut value={changed} />
          <span className="absolute inset-0 flex items-center justify-center text-xl font-bold tabular-nums">{fmt(changed)}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-lg leading-snug font-semibold">
            History changed in <span className="underline decoration-2 underline-offset-4">{fmt(changed)}</span> of simulations
          </p>
          <p className="text-sm text-muted">
            In {tally.historyChanged.toLocaleString()} of {tally.runs.toLocaleString()} runs{running ? ` (of ${target.toLocaleString()})` : ""}, the {teams[realLoser].name} won
            {swapName ? ` with ${swapName} on the floor` : ""}.
          </p>
          {baselineChanged !== null ? (
            <p className="text-xs text-muted">
              With the real lineup: {fmt(baselineChanged)} ({changed >= baselineChanged ? "+" : ""}
              {(changed - baselineChanged).toFixed(1)} points from your swap)
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Outcome Breakdown</h3>
        <Bar label={`${teams[realWinner].name} win (as in real life)`} value={pct(tally.wins[realWinner], tally.runs)} count={tally.wins[realWinner]} strong={false} />
        <Bar label={`${teams[realLoser].name} win`} value={pct(tally.wins[realLoser], tally.runs)} count={tally.wins[realLoser]} strong />
        <p className="text-xs text-muted">Went to overtime in {fmt(pct(tally.overtime, tally.runs))} of runs.</p>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Key Scenarios: the first trip down the floor</h3>
        {scenarios.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-foreground/90">
              <span className="h-2 w-2 rounded-full bg-muted" />
              {label}
            </span>
            <span className="tabular-nums">
              {fmt(pct(tally.firstPlay[key], tally.runs))}
              <span className="ml-3 inline-block w-14 text-right text-muted">{tally.firstPlay[key].toLocaleString()}</span>
            </span>
          </div>
        ))}
        {swapName && shooterShare > 0 ? <p className="pt-1 text-xs text-muted">{swapName} took the first shot in {fmt(shooterShare)} of runs.</p> : null}
      </div>
    </section>
  );
}
