/**
 * Runs thousands of timelines off the main thread and streams tallies back in batches,
 * so the results fill in live while the page stays smooth.
 *
 * Message in:  { id, input, baseline, runs }   (baseline = same moment with no swap)
 * Messages out: { id, kind: "progress", swapped, baseline } ... then { id, kind: "done", ... }
 */

import { addToTally, emptyTally, timelineResult } from "@/engine/analysis";
import { simulateTimeline, timelineSeed } from "@/engine/simulate";
import type { SimInput } from "@/engine/types";

type Request = { id: number; input: SimInput; baseline: SimInput; runs: number };

const BATCH = 250;
let current = 0;

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, input, baseline, runs } = event.data;
  current = id;
  const regulation = Math.max(4, input.moment.state.period);
  const offense = input.moment.state.possession;
  const swapped = emptyTally();
  const real = emptyTally();
  let done = 0;

  const step = () => {
    if (current !== id) return; // a newer run replaced this one
    const end = Math.min(runs, done + BATCH);
    for (let i = done; i < end; i++) {
      addToTally(swapped, timelineResult(simulateTimeline(input, timelineSeed(input.seed, i)), offense), regulation);
      addToTally(real, timelineResult(simulateTimeline(baseline, timelineSeed(baseline.seed, i)), offense), regulation);
    }
    done = end;
    self.postMessage({ id, kind: done >= runs ? "done" : "progress", swapped, baseline: real });
    if (done < runs) setTimeout(step, 0);
  };
  step();
};
