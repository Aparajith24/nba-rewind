import Link from "next/link";

import type { HomeCard } from "@/lib/home";
import { headshotUrl } from "@/lib/images";
import type { Moment, Side } from "@/lib/types";
import { Court } from "../Court";
import { scoreLine } from "./MomentCard";

/** Headline on the left; on the right, the hero moment's real freeze frame with a "what if" note. */

function Stage({ card, moment, whatIf }: { card: HomeCard; moment: Moment | null; whatIf: string }) {
  const face = card.preview?.keyPlayerId;
  const players = moment
    ? (["home", "away"] as Side[]).flatMap((side) => moment.lineups[side].map((p) => ({ playerId: p.playerId, name: p.name, side, x: p.x, y: p.y })))
    : [];
  const score = scoreLine(card);
  const target = card.id ? `/moments/${card.id}/` : "/moments/";

  return (
    <div className="relative min-h-[340px] overflow-hidden rounded-3xl border border-border bg-surface sm:min-h-[420px]">
      {/* The real freeze frame, dimmed, as the backdrop. */}
      <div className="absolute inset-0 flex items-center p-4 opacity-35">
        {players.length ? <Court players={players} offense={moment!.state.possession} /> : null}
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/40 to-transparent" />

      {face ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote image; next/image can't optimize in a static export
        <img
          src={headshotUrl(face, "large")}
          alt={card.preview?.keyPlayerName ?? ""}
          className="absolute right-[18%] bottom-0 h-[78%] object-contain object-bottom drop-shadow-[0_20px_40px_rgba(0,0,0,0.8)]"
        />
      ) : null}

      <div className="absolute top-8 right-6 flex flex-col items-end sm:top-12 sm:right-10">
        <span className="font-hand -rotate-6 text-3xl leading-none sm:text-4xl">
          What if it
          <br />
          was {whatIf}?
        </span>
        <svg width="90" height="60" viewBox="0 0 90 60" className="mr-16 -mt-1 text-foreground" aria-hidden>
          <path d="M80 4 C 70 40, 40 52, 8 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M8 48 l12 -8 M8 48 l13 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </div>

      <Link
        href={target}
        className="absolute right-4 bottom-4 left-4 flex items-center gap-4 rounded-2xl border border-border bg-background/85 p-4 backdrop-blur transition hover:border-foreground/60 sm:left-auto sm:w-80"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background">▶</span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{card.title}</span>
          <span className="text-xs text-muted">{card.gameLabel}</span>
          {score ? <span className="mt-1 text-xs tabular-nums text-foreground/80">{score}</span> : null}
        </span>
      </Link>
    </div>
  );
}

export function Hero({ card, moment, whatIf }: { card: HomeCard; moment: Moment | null; whatIf: string }) {
  return (
    <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
      <div className="flex flex-col gap-6">
        <p className="text-xs font-semibold tracking-[0.25em] text-muted">NBA PLAYOFF MOMENTS · 1996–97 → PRESENT</p>
        <h1 className="text-5xl leading-[1.02] font-bold tracking-tight sm:text-6xl xl:text-7xl">
          What if it was
          <br />
          <span className="bg-gradient-to-r from-foreground to-muted bg-clip-text text-transparent">someone else?</span>
        </h1>
        <p className="max-w-lg text-foreground/80">
          Take one of the greatest NBA playoff moments since 1996–97, swap any player from any season into it, and watch what happens. We replay the
          moment from its real game state (score, clock, possession, the ten players on the floor) thousands of times and show how often history
          changes.
        </p>
        <Link
          href="/moments/"
          className="flex w-fit items-center gap-3 rounded-xl bg-foreground px-6 py-3.5 font-semibold text-background transition hover:opacity-90"
        >
          Explore Moments <span aria-hidden>→</span>
        </Link>
      </div>
      <Stage card={card} moment={moment} whatIf={whatIf} />
    </section>
  );
}
