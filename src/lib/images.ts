/**
 * NBA image URLs. Logos and headshots are loaded from the NBA's CDN at runtime
 * and never stored in this repo (see README: Data source and credits).
 */

/** Small player headshot (260x190). Unknown IDs get the CDN's generic silhouette. */
export function headshotUrl(playerId: number): string {
  return `https://cdn.nba.com/headshots/nba/latest/260x190/${playerId}.png`;
}

/** Team logo (SVG). The CDN only has each franchise's current logo. */
export function logoUrl(teamId: number): string {
  return `https://cdn.nba.com/logos/nba/${teamId}/global/L/logo.svg`;
}
