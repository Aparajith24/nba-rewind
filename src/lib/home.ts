/**
 * Build-time data for the homepage: every moment as a card (built or coming soon),
 * the hero, the featured row, and the era breakdown. Server-only.
 *
 * Sources: content/moments/candidates.md (the list), content/moments/{id}.json (built
 * moments), content/home.json (homepage picks), and public/data/moment-previews.json
 * (real score, clock and key player per moment, from the pipeline; optional).
 */

import fs from "node:fs";
import path from "node:path";

import { DECADES, decadeOf, formatGame, type Decade } from "./eras";
import { getMoment, getMomentCandidates } from "./moments";
import type { Moment, MomentType } from "./types";

export { DECADES, decadeOf, formatGame, type Decade };

export type MomentPreview = {
  home: string;
  away: string;
  score: { home: number; away: number };
  period: number;
  startClock: number;
  keyPlayerId: number | null;
  keyPlayerName: string | null;
};

export type HomeCard = {
  number: number;
  /** Set when the moment is playable. */
  id: string | null;
  title: string;
  description: string;
  year: number;
  decade: Decade;
  /** "2013 NBA Finals, Game 6" */
  gameLabel: string;
  /** "2013 FINALS" */
  badge: string;
  type: MomentType;
  preview: MomentPreview | null;
};

type HomeConfig = {
  hero: { number: number; whatIf: string };
  featured: { number: number; title: string }[];
  eraFaces: Record<Decade, number>;
};

function readJson<T>(...parts: string[]): T | null {
  const file = path.join(process.cwd(), ...parts);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : null;
}

/** Everything the top-nav search looks through. */
export function searchItems(cards: HomeCard[]) {
  return cards.map((c) => ({
    number: c.number,
    id: c.id,
    title: c.title,
    gameLabel: c.gameLabel,
    search: [c.title, c.description, c.gameLabel, c.preview?.home, c.preview?.away, c.preview?.keyPlayerName].join(" ").toLowerCase(),
  }));
}

export function getHomeData() {
  const config = readJson<HomeConfig>("content", "home.json")!;
  const previews = readJson<Record<string, MomentPreview>>("public", "data", "moment-previews.json") ?? {};
  const featuredTitles = new Map(config.featured.map((f) => [f.number, f.title]));

  const cards: HomeCard[] = getMomentCandidates().map((c) => {
    const [gameLabel, badge] = formatGame(c.game);
    return {
      number: c.number,
      id: c.id,
      title: featuredTitles.get(c.number) ?? c.title ?? c.description,
      description: c.hook ?? c.description,
      year: c.year,
      decade: decadeOf(c.year),
      gameLabel,
      badge,
      type: c.type,
      preview: previews[String(c.number)] ?? null,
    };
  });
  const byNumber = new Map(cards.map((c) => [c.number, c]));

  const heroCard = byNumber.get(config.hero.number)!;
  const hero: { card: HomeCard; moment: Moment | null; whatIf: string } = {
    card: heroCard,
    moment: heroCard.id ? getMoment(heroCard.id) : null,
    whatIf: config.hero.whatIf,
  };

  const eras = DECADES.map((decade) => ({
    decade,
    count: cards.filter((c) => c.decade === decade).length,
    face: byNumber.get(config.eraFaces[decade])?.preview?.keyPlayerId ?? null,
  }));

  return {
    cards,
    hero,
    featured: config.featured.map((f) => byNumber.get(f.number)!).filter(Boolean),
    eras,
    playable: cards.filter((c) => c.id !== null),
  };
}
