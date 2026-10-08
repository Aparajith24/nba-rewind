/** Four steps, and a multiverse illustration: one dot per replay of the moment. */

const STEPS: { title: string; text: string; icon: React.ReactNode }[] = [
  {
    title: "Pick a moment",
    text: "Choose from iconic NBA playoff moments since 1996–97.",
    icon: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m20 20-4-4" />
      </>
    ),
  },
  {
    title: "Swap a player",
    text: "Replace anyone on the floor with any player, any season.",
    icon: <path d="M4 8h13l-3-3M20 16H7l3 3" />,
  },
  {
    title: "Run simulations",
    text: "We replay the moment thousands of times with the new lineup.",
    icon: <path d="M8 5v14l11-7z" />,
  },
  {
    title: "See how history changes",
    text: "Compare against the real lineup, key scenarios, and the replay.",
    icon: <path d="M4 18 9 12l4 3 7-9M15 6h5v5" />,
  },
];

const DOTS = 120;

/** Decorative: a grid that fills in like the live results, with a share of dots "flipped". */
function MultiverseDots() {
  return (
    <div className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-1.5" aria-hidden>
      {Array.from({ length: DOTS }, (_, i) => {
        // A fixed, irregular pattern so it reads as "some timelines went the other way".
        const flipped = (i * 37) % 11 < 3;
        return (
          <span
            key={i}
            className={`animate-pop-in aspect-square rounded-full ${flipped ? "bg-foreground" : "bg-surface-raised"}`}
            style={{ animationDelay: `${i * 12}ms` }}
          />
        );
      })}
    </div>
  );
}

export function HowItWorks() {
  return (
    <section className="grid gap-8 rounded-3xl border border-border bg-surface p-6 sm:p-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-bold">How it works</h2>
        <ol className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-2 xl:border-r xl:border-border xl:pr-5 xl:last:border-r-0">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {s.icon}
                </svg>
              </span>
              <span className="pt-2 text-xs tracking-widest text-muted">0{i + 1}</span>
              <span className="font-semibold">{s.title}</span>
              <span className="text-sm text-muted">{s.text}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-col justify-center gap-4 lg:border-l lg:border-border lg:pl-8">
        <p className="font-semibold">One swap. Thousands of possibilities.</p>
        <MultiverseDots />
        <p className="text-sm text-muted">
          Every dot is one replay of the moment. The white ones are where history went the other way. Pick a swap to see your real number.
        </p>
      </div>
    </section>
  );
}
