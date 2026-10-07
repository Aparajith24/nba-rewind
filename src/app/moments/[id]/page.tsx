import type { Metadata } from "next";

import { getBuiltMomentIds, getMoment } from "@/lib/moments";
import type { Side } from "@/lib/types";
import { Court } from "@/ui/Court";
import { PlayerHeadshot } from "@/ui/PlayerHeadshot";
import { ScoreBug } from "@/ui/ScoreBug";

// Static export: one page per built moment, and nothing else.
export const dynamicParams = false;

export function generateStaticParams() {
  return getBuiltMomentIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/moments/[id]">): Promise<Metadata> {
  const { id } = await params;
  const moment = getMoment(id);
  return { title: `${moment.title} · NBA Rewind`, description: moment.hook };
}

export default async function MomentPage({ params }: PageProps<"/moments/[id]">) {
  const { id } = await params;
  const moment = getMoment(id);
  const { state, teams, lineups } = moment;
  const sides: Side[] = ["away", "home"];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs tracking-[0.3em] text-muted">
          #{moment.number} · {moment.season} PLAYOFFS
        </span>
        <h1 className="text-3xl font-bold sm:text-4xl">{moment.title}</h1>
        <p className="text-muted">{moment.hook}</p>
      </div>

      <ScoreBug moment={moment} />

      <Court lineups={lineups} offense={state.possession} />

      <p className="max-w-2xl leading-relaxed text-foreground/90">{moment.intro}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {sides.map((side) => (
          <section key={side} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
            <h2 className="font-mono text-xs tracking-[0.3em] text-muted">{teams[side].tricode} ON THE FLOOR</h2>
            <ul className="flex flex-col gap-2">
              {lineups[side].map((p) => (
                <li key={p.playerId} className="flex items-center gap-3">
                  <PlayerHeadshot playerId={p.playerId} name={p.name} side={side} size={40} />
                  <span className="text-sm">{p.name}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-border p-4 text-center font-mono text-xs tracking-widest text-muted">
        SWAP + SIMULATE · COMING NEXT
      </div>
    </div>
  );
}
