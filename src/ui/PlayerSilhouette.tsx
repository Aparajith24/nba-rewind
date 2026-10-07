import type { Side } from "@/lib/types";

/** Generated player art: a silhouette in our team color with the player's initials. No real photos. */
export function PlayerSilhouette({ name, side, size = 48 }: { name: string; side: Side; size?: number }) {
  const color = side === "home" ? "var(--home)" : "var(--away)";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={name}>
      <rect width="48" height="48" rx="10" fill="var(--surface-raised)" />
      <circle cx="24" cy="17" r="8" fill={color} opacity="0.9" />
      <path d="M8 46c0-10 7-16 16-16s16 6 16 16z" fill={color} opacity="0.9" />
      <text x="24" y="41" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--background)" fontFamily="var(--font-geist-mono)">
        {initials(name)}
      </text>
    </svg>
  );
}

/** "L. James" -> "LJ", "Metta World Peace" -> "MP". */
export function initials(name: string): string {
  const words = name.replace(/\./g, "").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}
