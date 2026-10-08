import Link from "next/link";

/**
 * The NBA Rewind mark: a basketball wrapped in a counter-clockwise replay arrow.
 * The favicon (src/app/icon.svg) is the ball alone.
 */

/** Just the ball: orange, black seams. Drawn in a 40x40 box centered at (20, 20). */
function Ball({ r }: { r: number }) {
  const seam = { fill: "none", stroke: "#141414", strokeWidth: r * 0.13, strokeLinecap: "round" as const };
  return (
    <g>
      <circle cx="20" cy="20" r={r} fill="#e8762b" stroke="#141414" strokeWidth={r * 0.1} />
      <line x1={20 - r} y1="20" x2={20 + r} y2="20" {...seam} />
      <line x1="20" y1={20 - r} x2="20" y2={20 + r} {...seam} />
      <path d={`M ${20 - r * 0.62} ${20 - r * 0.78} Q ${20 - r * 0.15} 20 ${20 - r * 0.62} ${20 + r * 0.78}`} {...seam} />
      <path d={`M ${20 + r * 0.62} ${20 - r * 0.78} Q ${20 + r * 0.15} 20 ${20 + r * 0.62} ${20 + r * 0.78}`} {...seam} />
    </g>
  );
}

export function LogoMark({ size = 32 }: { size?: number }) {
  // Replay ring: from 1 o'clock, counter-clockwise around the ball, ending at 5 o'clock with an arrowhead.
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <path d="M 28.5 5.3 A 17 17 0 1 0 28.5 34.7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M 26.6 31.4 L 33.4 33.6 L 28.7 38.6 Z" fill="currentColor" />
      <Ball r={12} />
    </svg>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
      <LogoMark size={size} />
      NBA Rewind
    </Link>
  );
}
