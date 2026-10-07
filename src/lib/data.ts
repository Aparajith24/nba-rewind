/**
 * Browser-side loading of the static data files in public/data/ (served at /data/).
 * Player files are fetched only when needed and cached for the session.
 */

import type { LeagueFile, PlayerFile } from "@/engine/types";

const cache = new Map<string, Promise<unknown>>();

function getJson<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${url}: ${r.status}`);
        return r.json();
      }),
    );
  }
  return cache.get(url) as Promise<T>;
}

export function loadPlayer(id: number): Promise<PlayerFile> {
  return getJson<PlayerFile>(`/data/players/${id}.json`);
}

export function loadLeague(season: string): Promise<LeagueFile> {
  return getJson<LeagueFile>(`/data/leagues/${season}.json`);
}

export async function loadPlayers(ids: number[]): Promise<Record<number, PlayerFile>> {
  const files = await Promise.all(ids.map(loadPlayer));
  return Object.fromEntries(files.map((f) => [f.id, f]));
}

export async function loadLeagues(seasons: string[]): Promise<Record<string, LeagueFile>> {
  const unique = [...new Set(seasons)];
  const files = await Promise.all(unique.map(loadLeague));
  return Object.fromEntries(files.map((f) => [f.season, f]));
}

/** One entry of public/data/index.json. */
export type IndexPlayer = { id: number; name: string; seasons: { season: string; team: string; playoffs: boolean }[] };

/** The search index (~90 KB compressed), loaded once when the swap search is first used. */
export function loadIndex(): Promise<IndexPlayer[]> {
  return getJson<IndexPlayer[]>("/data/index.json");
}
