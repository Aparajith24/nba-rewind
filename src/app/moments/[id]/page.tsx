import type { Metadata } from "next";
import Link from "next/link";

import type { MomentFile } from "@/engine/types";
import { getBuiltMomentIds, getMoment } from "@/lib/moments";
import type { Moment } from "@/lib/types";
import { MomentExperience } from "@/ui/MomentExperience";

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
  const moment = getMoment(id) as Moment & MomentFile;
  const series = moment.game.split(" · ")[0]; // "2013 NBA Finals"

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-8">
      <MomentExperience
        moment={moment}
        header={
          <div className="flex flex-col gap-3">
            <Link href="/" className="text-sm text-muted hover:text-foreground">
              ← Back to moments
            </Link>
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
              {moment.title} <span className="text-muted">({series})</span>
            </h1>
            <p className="max-w-2xl text-foreground/85">{moment.intro} What happens if we swap in a different player?</p>
          </div>
        }
      />
    </div>
  );
}
