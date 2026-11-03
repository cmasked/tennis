import { randomUUID } from "node:crypto";
import { buildMoments, reconcileMoments } from "../engine/moments.ts";
import { reconstructHistory } from "../engine/history.ts";
import {
  pointLabel,
  pressureFor,
  type ScoringFormat,
} from "../engine/point-engine.ts";
import { analyzeGames } from "../scoring.ts";
import type { MatchSnapshot } from "../engine/model.ts";
import type { FeedSnapshot, FeedUpdate, FeedEvent } from "./contract.ts";

export interface IngestInput {
  snapshot: MatchSnapshot;
  format: ScoringFormat;
  source: FeedSnapshot["source"];
}
interface Entry {
  snapshot: FeedSnapshot;
  updates: FeedUpdate[];
  fingerprint: string;
  highestRevision: number;
}

// One in-memory authority per process. Production will need durable ingestion
// ordering and a shared store; this intentionally does not pretend to provide it.
export class FeedStore {
  readonly epoch: string;
  private entries = new Map<string, Entry>();
  private listeners = new Map<string, Set<(event: FeedUpdate) => void>>();
  private historyLimit: number;
  constructor(historyLimit = 50, epoch: string = randomUUID()) {
    this.historyLimit = historyLimit;
    if (!Number.isSafeInteger(historyLimit) || historyLimit < 1)
      throw new Error("History limit must be positive.");
    if (!/^[A-Za-z0-9-]+$/.test(epoch))
      throw new Error("Invalid stream epoch.");
    this.epoch = epoch;
  }
  get(matchId: string): FeedSnapshot | null {
    return structuredClone(this.entries.get(matchId)?.snapshot ?? null);
  }
  list(): FeedSnapshot[] {
    return [...this.entries.values()].map((entry) =>
      structuredClone(entry.snapshot),
    );
  }
  ingest(input: IngestInput): "applied" | "duplicate" | "out-of-order" {
    const { snapshot, format, source } = input;
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(snapshot.matchKey))
      throw new Error("Invalid public match ID.");
    if (!["synthetic", "provider"].includes(source.kind))
      throw new Error("Invalid source kind.");
    if (!Number.isSafeInteger(source.revision) || source.revision < 1)
      throw new Error("Revision must be a positive integer.");
    if (
      !Number.isFinite(Date.parse(source.observedAt)) ||
      (source.providerUpdatedAt !== null &&
        !Number.isFinite(Date.parse(source.providerUpdatedAt)))
    )
      throw new Error("Invalid source timestamp.");
    const previous = this.entries.get(snapshot.matchKey);
    // Late responses cannot rewind a newer authoritative state. The ingestion
    // adapter must assign revisions when requests begin, not when they finish.
    if (previous && source.revision <= previous.highestRevision)
      return "out-of-order";
    const fingerprint = JSON.stringify({
      snapshot,
      format,
      kind: source.kind,
      providerUpdatedAt: source.providerUpdatedAt,
    });
    if (previous && previous.fingerprint === fingerprint) {
      previous.highestRevision = source.revision; // Preserve the ordering watermark.
      return "duplicate"; // No new event, commentary or fake provider freshness.
    }
    const history = reconstructHistory(snapshot, format);
    const state = history.state;
    const usable = state !== null && !history.stopped;
    const sequence = (previous?.snapshot.sequence ?? 0) + 1;
    const next: FeedSnapshot = {
      schemaVersion: 1,
      matchId: snapshot.matchKey,
      sequence,
      epoch: this.epoch,
      cursor: `${this.epoch}:${sequence}`,
      source: structuredClone(source),
      players: [...snapshot.players],
      format: structuredClone(format),
      status: usable ? (state.winner ? "completed" : "in-progress") : "unknown",
      current: usable
        ? {
            setsWon: state.setsWon,
            games: state.games,
            pointScore: pointLabel(state),
            server: state.winner ? null : state.server,
            tiebreak: state.tiebreakFirstServer !== null,
            winner: state.winner,
            completedSets: state.completedSets,
            pressure: [pressureFor(state, 1), pressureFor(state, 2)],
          }
        : null,
      progression: analyzeGames(snapshot.games),
      moments: buildMoments(snapshot),
      historyMoments: history.moments.filter(
        (moment) => moment.kind !== "point-won" && moment.kind !== "game-won",
      ),
      uncertainty: [
        ...history.issues,
        ...(!usable
          ? [
              "Current state withheld because a complete consistent prefix could not be established.",
            ]
          : []),
      ],
    };
    const update: FeedUpdate = {
      type: "update",
      snapshot: next,
      changes: reconcileMoments(previous?.snapshot.moments ?? [], next.moments),
      retractedHistoryIds: (previous?.snapshot.historyMoments ?? [])
        .filter(
          (old) =>
            !next.historyMoments.some(
              (moment) =>
                moment.id === old.id &&
                JSON.stringify(moment) === JSON.stringify(old),
            ),
        )
        .map((moment) => moment.id),
    };
    const updates = [...(previous?.updates ?? []), update].slice(
      -this.historyLimit,
    );
    this.entries.set(snapshot.matchKey, {
      snapshot: next,
      updates,
      fingerprint,
      highestRevision: source.revision,
    });
    // Clone every boundary so a consumer cannot mutate the store or other clients.
    for (const listener of this.listeners.get(snapshot.matchKey) ?? [])
      listener(structuredClone(update));
    return "applied";
  }
  resume(matchId: string, cursor?: string): FeedEvent[] | null {
    const entry = this.entries.get(matchId);
    if (!entry) return null;
    const reset = (
      reason: "initial" | "cursor-expired-or-invalid",
    ): FeedEvent[] => [
      { type: "reset", reason, snapshot: structuredClone(entry.snapshot) },
    ];
    if (!cursor) return reset("initial");
    const match = /^([A-Za-z0-9-]+):(\d+)$/.exec(cursor);
    const seq = match ? Number(match[2]) : NaN;
    if (
      !match ||
      match[1] !== this.epoch ||
      !Number.isSafeInteger(seq) ||
      seq > entry.snapshot.sequence ||
      seq < 1 ||
      seq < entry.updates[0].snapshot.sequence - 1
    )
      return reset("cursor-expired-or-invalid");
    return structuredClone(
      entry.updates.filter((update) => update.snapshot.sequence > seq),
    );
  }
  subscribe(
    matchId: string,
    listener: (event: FeedUpdate) => void,
  ): () => void {
    const set = this.listeners.get(matchId) ?? new Set();
    this.listeners.set(matchId, set);
    set.add(listener);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(matchId);
    };
  }
}
