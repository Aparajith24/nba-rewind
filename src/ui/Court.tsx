import { headshotUrl } from "@/lib/images";
import type { Side } from "@/lib/types";
import { initials } from "./PlayerSilhouette";

/**
 * Top-down full court in feet (94 x 50). The team with the ball at the start of the
 * moment attacks the right basket at (88.75, 25).
 *
 * A pure renderer: it draws players and the ball wherever it's told. The freeze frame
 * passes the moment's positions; the replay passes interpolated positions every frame.
 */

const LENGTH = 94;
const WIDTH = 50;
const HOOP_FROM_BASELINE = 5.25;
const THREE_RADIUS = 23.75;
const CORNER_THREE_Y = 3; // the corner three is 22' from the hoop: 25 - 22
const ARC_START = Math.sqrt(THREE_RADIUS ** 2 - (WIDTH / 2 - CORNER_THREE_Y) ** 2); // ~8.95' out from the hoop
const DOT_RADIUS = 2.2;
const HEADSHOT_ASPECT = 260 / 190;

export type CourtPlayer = { playerId: number; name: string; side: Side; x: number; y: number; jersey?: string };
export type CourtBall = { x: number; y: number; inAir: boolean };

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
      <circle cx={hoopX} cy={25} r={0.75} stroke="var(--ball)" />
    </g>
  );
}

/** An orange ball with black seams: one across, one down, and the two curved side seams. */
function Basketball({ x, y, radius, inAir }: { x: number; y: number; radius: number; inAir: boolean }) {
  const r = radius;
  const seam = { fill: "none", stroke: "#1a1206", strokeWidth: r * 0.12, strokeLinecap: "round" as const };
  return (
    <g transform={`translate(${x} ${y})`} style={{ filter: inAir ? "drop-shadow(0 0.8px 0.8px rgba(0,0,0,0.6))" : undefined }}>
      <circle r={r} fill="var(--ball)" stroke="#1a1206" strokeWidth={r * 0.1} />
      <line x1={-r} y1={0} x2={r} y2={0} {...seam} />
      <line x1={0} y1={-r} x2={0} y2={r} {...seam} />
      <path d={`M ${-r * 0.7} ${-r * 0.7} Q ${-r * 0.25} 0 ${-r * 0.7} ${r * 0.7}`} {...seam} />
      <path d={`M ${r * 0.7} ${-r * 0.7} Q ${r * 0.25} 0 ${r * 0.7} ${r * 0.7}`} {...seam} />
    </g>
  );
}

function PlayerDot({
  player,
  onOffense,
  index,
  animateIn,
  selected,
  onSelect,
}: {
  player: CourtPlayer;
  onOffense: boolean;
  index: number;
  animateIn: boolean;
  selected: boolean;
  onSelect?: (playerId: number) => void;
}) {
  const clipId = `headshot-${player.playerId}`;
  return (
    // Children are drawn around (0, 0) and the group is moved, so a moving player only changes one transform.
    <g
      transform={`translate(${player.x} ${player.y})`}
      onClick={onSelect ? () => onSelect(player.playerId) : undefined}
      className={onSelect ? "cursor-pointer" : undefined}
      role={onSelect ? "button" : undefined}
      aria-label={onSelect ? `Swap out ${player.name}` : undefined}
    >
      {selected ? <circle r={DOT_RADIUS + 1.1} fill="none" stroke="var(--foreground)" strokeWidth={0.3} strokeDasharray="0.8 0.6" /> : null}
      <g className={animateIn ? "animate-pop-in" : undefined} style={animateIn ? { animationDelay: `${150 + index * 50}ms` } : undefined}>
        <clipPath id={clipId}>
          <circle r={DOT_RADIUS} />
        </clipPath>
        <circle r={DOT_RADIUS} fill="var(--surface-raised)" />
        {/* Initials sit under the headshot and show through if the image can't load. */}
        <text y={0.55} textAnchor="middle" fontSize={1.4} fontWeight={700} fill="var(--muted)" fontFamily="var(--font-geist-mono)">
          {initials(player.name)}
        </text>
        <image
          href={headshotUrl(player.playerId)}
          x={-DOT_RADIUS * HEADSHOT_ASPECT}
          y={-DOT_RADIUS}
          width={2 * DOT_RADIUS * HEADSHOT_ASPECT}
          height={2 * DOT_RADIUS}
          clipPath={`url(#${clipId})`}
        >
          <title>{player.name}</title>
        </image>
        <circle r={DOT_RADIUS} fill="none" stroke={player.side === "home" ? "var(--home)" : "var(--away)"} strokeWidth={0.35} />
        {onOffense ? <circle r={DOT_RADIUS + 0.45} fill="none" stroke="var(--accent)" strokeWidth={0.18} /> : null}
        {player.jersey ? (
          <text y={DOT_RADIUS + 1.9} textAnchor="middle" fontSize={1.5} fontWeight={600} fill="var(--foreground)" fontFamily="var(--font-geist-sans)">
            {player.jersey}
          </text>
        ) : null}
      </g>
    </g>
  );
}

export function Court({
  players,
  offense,
  ball = null,
  flash = null,
  animateIn = false,
  selectedId = null,
  onSelectPlayer,
}: {
  players: CourtPlayer[];
  offense: Side | null;
  ball?: CourtBall | null;
  /** Brief highlight at the rim nearest the ball: a make or a miss. */
  flash?: "make" | "miss" | "whistle" | null;
  animateIn?: boolean;
  /** A ring around this player (e.g. the one being swapped). */
  selectedId?: number | null;
  /** Makes the dots tappable. */
  onSelectPlayer?: (playerId: number) => void;
}) {
  const rimX = ball && ball.x < LENGTH / 2 ? HOOP_FROM_BASELINE : LENGTH - HOOP_FROM_BASELINE;
  return (
    <svg viewBox={`-2 -2 ${LENGTH + 4} ${WIDTH + 4}`} className="w-full rounded-xl border border-border bg-court" role="img" aria-label="Court with player positions">
      <g fill="none" stroke="var(--court-line)" strokeWidth={0.25}>
        <rect x={0} y={0} width={LENGTH} height={WIDTH} />
        <line x1={LENGTH / 2} y1={0} x2={LENGTH / 2} y2={WIDTH} />
        <circle cx={LENGTH / 2} cy={WIDTH / 2} r={6} />
        <HalfCourtLines mirrored={false} />
        <HalfCourtLines mirrored />
      </g>
      {flash === "make" || flash === "miss" ? (
        <circle
          key={`${flash}-${rimX}`}
          cx={rimX}
          cy={25}
          r={flash === "make" ? 3.2 : 1.6}
          fill="none"
          stroke={flash === "make" ? "var(--foreground)" : "var(--muted)"}
          strokeWidth={0.4}
          className="animate-pop-in"
        />
      ) : null}
      {players.map((p, i) => (
        <PlayerDot
          key={p.playerId}
          player={p}
          onOffense={p.side === offense}
          index={i}
          animateIn={animateIn}
          selected={p.playerId === selectedId}
          onSelect={onSelectPlayer}
        />
      ))}
      {ball ? <Basketball x={ball.x} y={ball.y} radius={ball.inAir ? 1.25 : 0.95} inAir={ball.inAir} /> : null}
    </svg>
  );
}
