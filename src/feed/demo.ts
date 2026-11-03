import { scenarios } from "../replay/scenarios.ts";
import { STANDARD_BEST_OF_THREE } from "../engine/point-engine.ts";
import { FeedStore } from "./store.ts";

// This source is intentionally incapable of calling RapidAPI. Each step is a
// synthetic authoritative snapshot, including a duplicate and a correction.
export function createDemo(store: FeedStore) {
  const frames = scenarios.slice(0, 6);
  let index = -1,
    revision = 0;
  function apply(next: number) {
    index = next;
    revision++;
    const frame = frames[index];
    const result = store.ingest({
      snapshot: structuredClone(frame.snapshot),
      format: STANDARD_BEST_OF_THREE,
      source: {
        kind: "synthetic",
        revision,
        observedAt: new Date().toISOString(),
        providerUpdatedAt: null,
      },
    });
    return {
      step: index + 1,
      totalSteps: frames.length,
      title: frame.title,
      result,
      done: index === frames.length - 1,
    };
  }
  const initial = apply(0);
  let status = initial;
  return {
    step() {
      if (index < frames.length - 1) status = apply(index + 1);
      return status;
    },
    reset() {
      status = apply(0);
      return status;
    },
    status() {
      return status;
    },
  };
}
