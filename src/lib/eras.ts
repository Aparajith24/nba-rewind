/**
 * Decades and game labels: pure helpers safe to use in the browser
 * (src/lib/home.ts reads files at build time and must stay server-only).
 */

export type Decade = "1990s" | "2000s" | "2010s" | "2020s";
export const DECADES: Decade[] = ["1990s", "2000s", "2010s", "2020s"];

const ROUNDS: Record<string, [string, string]> = {
  Finals: ["NBA Finals", "FINALS"],
  WCF: ["Western Conference Finals", "WCF"],
  ECF: ["Eastern Conference Finals", "ECF"],
  WCSF: ["West Semifinals", "WEST SEMIS"],
  ECSF: ["East Semifinals", "EAST SEMIS"],
  WCR1: ["West First Round", "WEST R1"],
  ECR1: ["East First Round", "EAST R1"],
};

/** "1998 Finals G6" -> ["1998 NBA Finals, Game 6", "1998 FINALS"] */
export function formatGame(game: string): [string, string] {
  const [year, round, g] = game.split(" ");
  const [long, short] = ROUNDS[round] ?? [round, round.toUpperCase()];
  return [`${year} ${long}${g ? `, Game ${g.replace("G", "")}` : ""}`, `${year} ${short}`];
}

export function decadeOf(year: number): Decade {
  return year < 2000 ? "1990s" : year < 2010 ? "2000s" : year < 2020 ? "2010s" : "2020s";
}
