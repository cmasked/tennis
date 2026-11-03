/**
 * Validate the two evidenced statistics envelopes and preserve player-side identity.
 * Cumulative counts are not labels for individual points; missing metrics are not zeros.
 */
export interface StatisticValue {
  value: number;
  total?: number;
  percentage?: number;
}
export interface MatchStatistics {
  players: [string, string];
  envelope: "top-level" | "result";
  periods: string[];
  metrics: {
    period: string;
    category: string;
    name: string;
    values: [StatisticValue, StatisticValue];
  }[];
}
function fail(path: string): never {
  throw new Error(`Unexpected statistics schema at ${path}.`);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail(path);
  return value as Record<string, unknown>;
}
function player(value: unknown, path: string): string {
  const name = object(value, path).name;
  if (typeof name !== "string" || !name.trim()) return fail(`${path}.name`);
  return name.trim();
}
function count(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return fail(path);
  return value;
}
function field(value: unknown, path: string): StatisticValue {
  const cell = object(value, path);
  const result: StatisticValue = { value: count(cell.value, `${path}.value`) };
  if (cell.total !== undefined) {
    result.total = count(cell.total, `${path}.total`);
    if (result.value > result.total) return fail(`${path}.value`);
  }
  if (cell.percentage !== undefined) {
    result.percentage = count(cell.percentage, `${path}.percentage`);
    if (result.percentage > 100) return fail(`${path}.percentage`);
  }
  return result;
}
function label(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) return fail("metric-label");
  return value;
}
export function adaptMatchstatStatistics(payload: unknown): MatchStatistics {
  const root = object(payload, "response");
  if (root.success !== true) return fail("success");
  const top = "statistics" in root || "player1" in root || "player2" in root;
  const nested = root.result !== undefined && root.result !== null;
  if (top && nested) return fail("ambiguous-envelope");
  // Both shapes have evidence: documented top-level, and result-wrapped fields
  // observed in the user's safe response-shape output. Never search arbitrary nesting.
  const data = top ? root : object(root.result, "result");
  const stats = object(data.statistics, "statistics");
  const result: MatchStatistics = {
    players: [player(data.player1, "player1"), player(data.player2, "player2")],
    envelope: top ? "top-level" : "result",
    periods: Object.keys(stats).map(label),
    metrics: [],
  };
  for (const [period, value] of Object.entries(stats)) {
    for (const [category, value2] of Object.entries(
      object(value, "statistics.period"),
    )) {
      label(category);
      for (const [name, value3] of Object.entries(
        object(value2, "statistics.category"),
      )) {
        label(name);
        const metric = object(value3, "statistics.metric");
        result.metrics.push({
          period,
          category,
          name,
          values: [
            field(metric.player1, "statistics.metric.player1"),
            field(metric.player2, "statistics.metric.player2"),
          ],
        });
      }
    }
  }
  return result;
}
