"use client";

import { useState } from "react";

import { logoUrl } from "@/lib/images";

/**
 * Team logo, loaded from the NBA's CDN at runtime so no logo files live in this repo.
 * The CDN has each franchise's current logo only. Falls back to the tricode if it fails.
 */
export function TeamLogo({ teamId, tricode, size = 40 }: { teamId: number; tricode: string; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full border border-border font-mono text-[10px] font-bold text-muted"
        style={{ width: size, height: size }}
      >
        {tricode}
      </span>
    );
  }
  return (
    // next/image's default loader doesn't work in a static export, and this is a remote SVG anyway.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl(teamId)}
      alt={`${tricode} logo`}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="object-contain"
    />
  );
}
