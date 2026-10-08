"use client";

import { useEffect } from "react";

/**
 * Helpers for pages built from <details> sections: open the section named in the URL
 * hash (so links like #player land on an open section), and expand or collapse all.
 */

function openFromHash() {
  const id = decodeURIComponent(window.location.hash.slice(1));
  const target = id ? document.getElementById(id) : null;
  if (target instanceof HTMLDetailsElement) {
    target.open = true;
    target.scrollIntoView({ block: "start" });
  }
}

export function OpenOnHash() {
  useEffect(() => {
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);
  return null;
}

export function ExpandAll() {
  const setAll = (open: boolean) => document.querySelectorAll<HTMLDetailsElement>("details[data-section]").forEach((d) => (d.open = open));
  return (
    <div className="flex gap-2 text-sm">
      <button type="button" onClick={() => setAll(true)} className="rounded-lg border border-border px-3 py-1.5 text-muted hover:text-foreground">
        Expand all
      </button>
      <button type="button" onClick={() => setAll(false)} className="rounded-lg border border-border px-3 py-1.5 text-muted hover:text-foreground">
        Collapse all
      </button>
    </div>
  );
}
