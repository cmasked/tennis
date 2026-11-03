import type { FeedEvent, FeedSnapshot } from "./contract.ts";
export interface ClientState {
  snapshot: FeedSnapshot | null;
  needsResync: boolean;
}

// Shared deterministic receiver for a future mobile client and our diagnostics.
// Old events cannot reapply commentary; a gap triggers recovery rather than
// silently treating a partial event sequence as continuous.
export function receive(state: ClientState, event: FeedEvent): ClientState {
  const next = event.snapshot;
  if (next.schemaVersion !== 1) return { ...state, needsResync: true };
  const old = state.snapshot;
  if (old && old.matchId !== next.matchId)
    return { ...state, needsResync: true };
  if (event.type === "reset") {
    if (old && old.epoch === next.epoch && next.sequence < old.sequence)
      return state;
    return { snapshot: structuredClone(next), needsResync: false };
  }
  if (!old || old.epoch !== next.epoch) return { ...state, needsResync: true };
  if (next.sequence <= old.sequence) return state;
  if (state.needsResync || next.sequence !== old.sequence + 1)
    return { ...state, needsResync: true };
  return { snapshot: structuredClone(next), needsResync: false };
}

// Validate the transport envelope before treating network JSON as a FeedEvent.
// This guards protocol sequencing; provider field validation happens upstream.
export function parseFeedEvent(value: unknown): FeedEvent {
  const bad = () => {
    throw new Error("Malformed or unsupported feed event.");
  };
  if (!value || typeof value !== "object") return bad();
  const event = value as Partial<FeedEvent>;
  if (event.type !== "reset" && event.type !== "update") return bad();
  const snapshot = event.snapshot;
  if (
    !snapshot ||
    snapshot.schemaVersion !== 1 ||
    typeof snapshot.matchId !== "string" ||
    !snapshot.matchId ||
    typeof snapshot.epoch !== "string" ||
    !/^[A-Za-z0-9-]+$/.test(snapshot.epoch) ||
    !Number.isSafeInteger(snapshot.sequence) ||
    snapshot.sequence < 1 ||
    snapshot.cursor !== `${snapshot.epoch}:${snapshot.sequence}`
  )
    return bad();
  if (
    !Array.isArray(snapshot.players) ||
    snapshot.players.length !== 2 ||
    snapshot.players.some((name) => typeof name !== "string")
  )
    return bad();
  if (
    !snapshot.source ||
    !["synthetic", "provider"].includes(snapshot.source.kind) ||
    !Number.isSafeInteger(snapshot.source.revision) ||
    snapshot.source.revision < 1 ||
    !Number.isFinite(Date.parse(snapshot.source.observedAt)) ||
    (snapshot.source.providerUpdatedAt !== null &&
      !Number.isFinite(Date.parse(snapshot.source.providerUpdatedAt)))
  )
    return bad();
  if (
    !Array.isArray(snapshot.moments) ||
    !Array.isArray(snapshot.historyMoments) ||
    !Array.isArray(snapshot.progression) ||
    !Array.isArray(snapshot.uncertainty) ||
    !["in-progress", "completed", "unknown"].includes(snapshot.status)
  )
    return bad();
  if (
    !snapshot.format ||
    ![3, 5].includes(snapshot.format.bestOf) ||
    !["advantage", "no-ad"].includes(snapshot.format.gameMode)
  )
    return bad();
  if (snapshot.status === "unknown" && snapshot.current !== null) return bad();
  if (snapshot.status !== "unknown") {
    const current = snapshot.current;
    const pair = (value: unknown) =>
      Array.isArray(value) &&
      value.length === 2 &&
      value.every(
        (n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0,
      );
    if (
      !current ||
      !pair(current.setsWon) ||
      !pair(current.games) ||
      typeof current.pointScore !== "string" ||
      !Array.isArray(current.completedSets) ||
      !Array.isArray(current.pressure) ||
      current.pressure.length !== 2
    )
      return bad();
    if (
      current.pressure.some(
        (p) =>
          !p ||
          typeof p.breakPoint !== "boolean" ||
          typeof p.setPoint !== "boolean" ||
          typeof p.matchPoint !== "boolean",
      )
    )
      return bad();
    if (
      snapshot.status === "completed" &&
      (current.server !== null || ![1, 2].includes(current.winner ?? 0))
    )
      return bad();
    if (
      snapshot.status === "in-progress" &&
      (![1, 2].includes(current.server ?? 0) || current.winner !== null)
    )
      return bad();
  }
  if (
    event.type === "update" &&
    (!event.changes ||
      !Array.isArray(event.changes.added) ||
      !Array.isArray(event.changes.updated) ||
      !Array.isArray(event.changes.removed) ||
      !Array.isArray(event.retractedHistoryIds))
  )
    return bad();
  if (
    event.type === "reset" &&
    !["initial", "cursor-expired-or-invalid"].includes(event.reason ?? "")
  )
    return bad();
  return value as FeedEvent;
}
