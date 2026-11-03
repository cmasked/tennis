/**
 * Fixtures CLI: fetch once, validate through our adapter, and print a readable list.
 * Optional raw recording stays opt-in because provider retention permission is unresolved.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fetchFixtures } from "./client.ts";
import { parseUpcomingPage, formatUpcomingPage } from "./matches.ts";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--save")) {
  console.error("Usage: npm run api:fixtures -- [--save]");
  process.exitCode = 1;
} else {
  try {
    const payload = await fetchFixtures(process.env.TENNIS_API_KEY);
    const page = parseUpcomingPage(payload);
    console.log(
      "ATP fixtures request succeeded. Validated upcoming-match fields.",
    );
    console.log(formatUpcomingPage(page));
    if (args.includes("--save")) {
      // Redact credential-like fields and the exact supplied key defensively.
      const secret = process.env.TENNIS_API_KEY!.trim();
      const serialized = JSON.stringify(
        payload,
        (name, value: unknown) => {
          if (/key|token|secret|authorization|password|cookie/i.test(name))
            return "[REDACTED]";
          return typeof value === "string"
            ? value.split(secret).join("[REDACTED]")
            : value;
        },
        2,
      )
        .split(secret)
        .join("[REDACTED]");
      await mkdir("local-data", { recursive: true });
      const path = `local-data/atp-fixtures-${Date.now()}.json`;
      await writeFile(path, serialized + "\n", { mode: 0o600, flag: "wx" });
      console.log(
        `Saved redacted response to ${path}. This directory is Git-ignored.`,
      );
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Unexpected failure.",
    );
    process.exitCode = 1;
  }
}
