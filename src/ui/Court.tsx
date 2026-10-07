import { headshotUrl } from "@/lib/images";
import type { LineupPlayer, Side } from "@/lib/types";
import { initials } from "./PlayerSilhouette";

/**
 * Top-down full court in feet (94 x 50), from the offense's point of view:
 * the offense attacks the basket on the right at (88.75, 25).
 * Static freeze frame for now; event-log playback comes later in src/animation.
 */

const LENGTH = 94;
const WIDTH = 50;
const HOOP_FROM_BASELINE = 5.25;
const THREE_RADIUS = 23.75;
const CORNER_THREE_Y = 3; // the corner three is 22' from the hoop: 25 - 22
const ARC_START = Math.sqrt(THREE_RADIUS ** 2 - (WIDTH / 2 - CORNER_THREE_Y) ** 2); // ~8.95' out from the hoop
const DOT_RADIUS = 2.2;
const HEADSHOT_ASPECT = 260 / 190;

function HalfCourtLines({ mirrored }: { mirrored: boolean }) {
  // Drawn for the right basket; the left one is the same shape mirrored.
  const hoopX = LENGTH - HOOP_FROM_BASELINE;
  const arcX = hoopX - ARC_START;
  return (
    <g transform={mirrored ? `translate(${LENGTH} 0) scale(-1 1)` : undefined}>
      <rect x={LENGTH - 19} y={17} width={19} height={16} />
      <circle cx={LENGTH - 19} cy={25} r={6} />
      <path d={`M ${LENGTH} ${CORNER_THREE_Y} L ${arcX} ${CORNER_THREE_Y} A ${THREE_RADIUS} ${THREE_RADIUS} 0 0 0 ${arcX} ${WIDTH - CORNER_THREE_Y} L ${LENGTH} ${WIDTH - CORNER_THREE_Y}`} />
      <path d={`M ${hoopX} 21 A 4 4 0 0 0 ${hoopX} 29`} />
      <line x1={LENGTH - 4} y1={22} x2={LENGTH - 4} y2={28} />
      <circle cx={hoopX} cy={25} r={0.75} className="stroke-accent" />
    </g>
  );
}

export function Court({ lineups, offense }: { lineups: Record<Side, LineupPlayer[]>; offense: Side }) {
  const players = (["home", "away"] as const).flatMap((side) => lineups[side].map((p) => ({ ...p, side })));
  return (
    <svg viewBox={`-2 -2 ${LENGTH + 4} ${WIDTH + 4}`} className="w-full rounded-xl bg-court" role="img" aria-label="Court with player positions">
      <g fill="none" stroke="var(--court-line)" strokeWidth={0.25}>
        <rect x={0} y={0} width={LENGTH} height={WIDTH} />
        <line x1={LENGTH / 2} y1={0} x2={LENGTH / 2} y2={WIDTH} />
        <circle cx={LENGTH / 2} cy={WIDTH / 2} r={6} />
        <HalfCourtLines mirrored={false} />
        <HalfCourtLines mirrored />
      </g>
      {players.map((p, i) => (
        <g key={p.playerId} className="animate-pop-in" style={{ animationDelay: `${150 + i * 50}ms` }}>
          <clipPath id={`headshot-${p.playerId}`}>
            <circle cx={p.x} cy={p.y} r={DOT_RADIUS} />
          </clipPath>
          <circle cx={p.x} cy={p.y} r={DOT_RADIUS} fill="var(--surface-raised)" />
          {/* Initials sit under the headshot and show through if the image can't load. */}
          <text x={p.x} y={p.y + 0.55} textAnchor="middle" fontSize={1.4} fontWeight={700} fill="var(--muted)" fontFamily="var(--font-geist-mono)">
            {initials(p.name)}
          </text>
          <image
            href={headshotUrl(p.playerId)}
            x={p.x - DOT_RADIUS * HEADSHOT_ASPECT}
            y={p.y - DOT_RADIUS}
            width={2 * DOT_RADIUS * HEADSHOT_ASPECT}
            height={2 * DOT_RADIUS}
            clipPath={`url(#headshot-${p.playerId})`}
          >
            <title>{p.name}</title>
          </image>
          <circle
            cx={p.x}
            cy={p.y}
            r={DOT_RADIUS}
            fill="none"
            stroke={p.side === "home" ? "var(--home)" : "var(--away)"}
            strokeWidth={0.35}
          />
          {p.side === offense ? <circle cx={p.x} cy={p.y} r={DOT_RADIUS + 0.45} fill="none" stroke="var(--accent)" strokeWidth={0.18} /> : null}
        </g>
      ))}
    </svg>
  );
}
