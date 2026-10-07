"use client";

import { useState } from "react";

import { headshotUrl } from "@/lib/images";
import type { Side } from "@/lib/types";
import { PlayerSilhouette } from "./PlayerSilhouette";

/**
 * Player headshot in a team-colored frame. Players the CDN doesn't know get its
 * generic silhouette image; if the request fails entirely, we fall back to ours.
 */
export function PlayerHeadshot({ playerId, name, side, size = 48 }: { playerId: number; name: string; side: Side; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <PlayerSilhouette name={name} side={side} size={size} />;

  return (
    <span
      className="inline-block overflow-hidden rounded-[10px] border-2 bg-surface-raised"
      style={{ width: size, height: size, borderColor: side === "home" ? "var(--home)" : "var(--away)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- remote image; next/image can't optimize in a static export */}
      <img src={headshotUrl(playerId)} alt={name} onError={() => setFailed(true)} className="h-full w-full object-cover object-top" />
    </span>
  );
}
