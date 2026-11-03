/**
 * Bounded schema diagnostics for unexpected responses. Only types/field names are shown,
 * never scalar values, raw credentials, or arbitrary response bodies.
 */
// Describe types and field paths only. Never include provider scalar values.
export function describeShape(value: unknown): string {
  const lines: string[] = [];
  function walk(item: unknown, path: string, depth: number) {
    if (lines.length >= 60) return;
    if (item === null) {
      lines.push(`${path}: null`);
      return;
    }
    if (Array.isArray(item)) {
      lines.push(`${path}: array (${item.length} items)`);
      if (depth < 4 && item.length) walk(item[0], `${path}[0]`, depth + 1);
    } else if (typeof item === "object") {
      lines.push(`${path}: object`);
      if (depth < 4)
        for (const [key, child] of Object.entries(item).slice(0, 20)) {
          // Only safe ordinary field labels; arbitrary keys can contain secrets.
          if (
            /^[A-Za-z0-9][A-Za-z0-9_]{0,39}$/.test(key) &&
            !/key|token|secret|auth|password|cookie/i.test(key)
          )
            walk(child, `${path}.${key}`, depth + 1);
          else
            lines.push(
              `${path}.[field omitted]: ${Array.isArray(child) ? "array" : child === null ? "null" : typeof child}`,
            );
        }
    } else lines.push(`${path}: ${typeof item}`);
  }
  walk(value, "response", 0);
  return (
    "SAFE RESPONSE SHAPE (no scalar values; bounded sample)\n" +
    lines.join("\n")
  );
}
