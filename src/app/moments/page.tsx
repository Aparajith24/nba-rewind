import type { Metadata } from "next";

import { getHomeData, searchItems } from "@/lib/home";
import { MomentsBrowser } from "@/ui/home/EraBrowser";
import { TopNav } from "@/ui/home/TopNav";

export const metadata: Metadata = {
  title: "Moments · NBA Rewind",
  description: "Every playoff moment you can rewrite, from 1996-97 to today.",
};

export default function MomentsPage() {
  const { cards } = getHomeData();
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav items={searchItems(cards)} active="moments" />
      <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-4 py-10 sm:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Moments</h1>
          <p className="max-w-2xl text-muted">
            {cards.length} of the greatest playoff moments since 1996–97. Each one starts from its real game state. Pick one, swap a player, and see if
            history changes.
          </p>
        </div>
        <MomentsBrowser cards={cards} />
      </main>
      <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted sm:px-8">
        Stats from stats.nba.com via nba_api. Logos and headshots are the property of the NBA and its teams. Not affiliated with the NBA.
      </footer>
    </div>
  );
}
