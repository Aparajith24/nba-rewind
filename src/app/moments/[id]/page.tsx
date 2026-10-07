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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-3">
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Back to moments
          </Link>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            {moment.title} <span className="text-muted">({series})</span>
          </h1>
          <p className="max-w-2xl text-foreground/85">{moment.intro} What happens if we swap in a different player?</p>
        </div>
        <span className="flex shrink-0 items-center gap-2 self-start rounded-xl border border-border px-4 py-2 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
          </svg>
          {moment.game}
        </span>
      </div>

      <MomentExperience moment={moment} />
    </div>
  );
}
