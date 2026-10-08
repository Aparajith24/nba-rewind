/**
 * NBA image URLs. Logos and headshots are loaded from the NBA's CDN at runtime
 * and never stored in this repo (see README: Data source and credits).
 */

/**
 * Player headshot on a transparent background. "small" (260x190) for dots and lists,
 * "large" (1040x760) for hero and card art. Unknown IDs get the CDN's generic silhouette.
 */
export function headshotUrl(playerId: number, size: "small" | "large" = "small"): string {
  const dims = size === "large" ? "1040x760" : "260x190";
  return `https://cdn.nba.com/headshots/nba/latest/${dims}/${playerId}.png`;
}

/** Team logo (SVG). The CDN only has each franchise's current logo. */
export function logoUrl(teamId: number): string {
  return `https://cdn.nba.com/logos/nba/${teamId}/global/L/logo.svg`;
}
