"use client";

import { motion } from "framer-motion";
import Link from "next/link";

import type { MomentCandidate } from "@/lib/types";

const TYPE_LABEL: Record<MomentCandidate["type"], string> = {
  "Last shot": "LAST SHOT",
  Clutch: "CLUTCH",
  Takeover: "TAKEOVER",
};

function MomentCard({ moment, index }: { moment: MomentCandidate; index: number }) {
  const ready = moment.id !== null;
  const card = (
    <motion.article
      whileHover={ready ? { y: -4, scale: 1.02 } : undefined}
      style={{ animationDelay: `${Math.min(index * 30, 600)}ms` }}
      className={`animate-rise-in flex h-full flex-col gap-2 rounded-xl border p-4 ${
        ready ? "border-accent/60 bg-surface-raised" : "border-border bg-surface brightness-75"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-3xl font-bold text-foreground">{moment.year}</span>
        <span className="font-mono text-[10px] tracking-widest text-muted">{TYPE_LABEL[moment.type]}</span>
      </div>
      <span className="text-xs text-muted">{moment.game}</span>
      <p className="text-sm leading-snug">{moment.title ? <strong>{moment.title}. </strong> : null}{moment.hook ?? moment.description}</p>
      <span className="mt-auto pt-2 font-mono text-[10px] tracking-widest text-accent">{ready ? "PLAY ▸" : "COMING SOON"}</span>
    </motion.article>
  );
  return ready ? <Link href={`/moments/${moment.id}`}>{card}</Link> : card;
}

export function MomentWall({ moments }: { moments: MomentCandidate[] }) {
  const eras = [...new Set(moments.map((m) => m.era))];
  return (
    <div className="flex flex-col gap-10">
      {eras.map((era) => (
        <section key={era} className="flex flex-col gap-4">
          <h2 className="font-mono text-xs tracking-[0.3em] text-muted">{era.toUpperCase()}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {moments
              .filter((m) => m.era === era)
              .map((m, i) => (
                <MomentCard key={m.number} moment={m} index={i} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
