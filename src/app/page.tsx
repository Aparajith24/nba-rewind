import Link from "next/link";

import { getHomeData, searchItems } from "@/lib/home";
import { EraTiles } from "@/ui/home/EraBrowser";
import { Hero } from "@/ui/home/Hero";
import { HowItWorks } from "@/ui/home/HowItWorks";
import { MomentCard } from "@/ui/home/MomentCard";
import { TopNav } from "@/ui/home/TopNav";

export default function Home() {
  const { cards, hero, featured, eras } = getHomeData();

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav items={searchItems(cards)} active="home" />
      <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-14 px-4 py-10 sm:px-8 sm:py-14">
        <Hero card={hero.card} moment={hero.moment} whatIf={hero.whatIf} />

        <section className="flex flex-col gap-6">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold sm:text-3xl">Featured Moments</h2>
              <p className="text-muted">Iconic plays. Timeless questions.</p>
            </div>
            <Link href="/moments/" className="text-sm text-muted hover:text-foreground">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {featured.map((c) => (
              <MomentCard key={c.number} card={c} />
            ))}
          </div>
        </section>

        <EraTiles eras={eras} />

        <HowItWorks />
      </main>
      <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted sm:px-8">
        Stats from stats.nba.com via nba_api. Logos and headshots are the property of the NBA and its teams. Not affiliated with the NBA.
      </footer>
    </div>
  );
}
