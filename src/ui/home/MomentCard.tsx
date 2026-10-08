import Link from "next/link";

import type { HomeCard } from "@/lib/home";
import { headshotUrl } from "@/lib/images";
import { formatClock } from "../ScoreBug";

/** Half-court lines as a backdrop for player art (our own drawing, no photos). */
export function CourtLines({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 50 47" preserveAspectRatio="xMidYMid slice" className={`absolute inset-0 h-full w-full ${className}`} aria-hidden>
      <g fill="none" stroke="var(--court-line)" strokeWidth="0.35">
        <rect x="0.5" y="0.5" width="49" height="46" />
        <rect x="17" y="0.5" width="16" height="19" />
        <circle cx="25" cy="19.5" r="6" />
        <path d="M3 0.5 V14 A23.75 23.75 0 0 0 47 14 V0.5" />
        <circle cx="25" cy="5.25" r="0.75" />
        <path d="M19 46.5 A6 6 0 0 1 31 46.5" />
      </g>
    </svg>
  );
}

export function scoreLine(card: HomeCard): string | null {
  const p = card.preview;
  if (!p) return null;
  return `${p.away} ${p.score.away} – ${p.home} ${p.score.home} · ${formatClock(p.startClock)}${p.startClock < 60 ? "s" : ""} left`;
}

function Arrow() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-sm transition group-hover:border-foreground">→</span>
  );
}

/** A moment card with player art. Playable moments link to their page; the rest say "Soon". */
export function MomentCard({ card, size = "featured" }: { card: HomeCard; size?: "featured" | "grid" }) {
  const ready = card.id !== null;
  const face = card.preview?.keyPlayerId;
  const score = scoreLine(card);

  const body = (
    <article
      className={`group flex h-full flex-col overflow-hidden rounded-2xl border bg-surface transition ${
        ready ? "border-border hover:border-foreground/60" : "border-border"
      }`}
    >
      <div className={`relative overflow-hidden bg-surface-raised ${size === "featured" ? "h-40" : "h-32"}`}>
        <CourtLines />
        {face ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote image; next/image can't optimize in a static export
          <img
            src={headshotUrl(face, "large")}
            alt=""
            loading="lazy"
            className={`absolute bottom-0 left-1/2 h-full -translate-x-1/2 object-contain object-bottom transition duration-300 group-hover:scale-105 ${ready ? "" : "grayscale"}`}
          />
        ) : null}
        <span className="absolute top-3 left-3 rounded-md border border-border bg-background/80 px-2 py-1 text-[10px] font-semibold tracking-wider">{card.badge}</span>
        {!ready ? (
          <span className="absolute top-3 right-3 rounded-md bg-background/80 px-2 py-1 text-[10px] tracking-wider text-muted">SOON</span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className={`font-semibold leading-snug ${size === "grid" ? "line-clamp-2 text-sm" : ""}`}>{card.title}</h3>
          {ready ? <Arrow /> : null}
        </div>
        <p className="text-xs text-muted">{card.gameLabel}</p>
        {score ? <p className="mt-auto pt-1 text-xs text-foreground/80 tabular-nums">{score}</p> : null}
      </div>
    </article>
  );
  return ready ? (
    <Link href={`/moments/${card.id}/`} className="block h-full">
      {body}
    </Link>
  ) : (
    <div className="h-full opacity-80">{body}</div>
  );
}
