import { createFeedServer } from "./feed/server.ts";

// Only the synthetic source is wired here. Merely starting the server cannot
// consume quota, even if TENNIS_API_KEY exists in the shell environment.
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer from 1 to 65535.");
const app = createFeedServer();
app.server.listen(port, "127.0.0.1", () => {
  console.log(`Synthetic feed listening at http://127.0.0.1:${port}`);
  console.log(
    "No provider requests. Open the diagnostic page and use Next synthetic snapshot. Ctrl+C stops the server.",
  );
});
app.server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().catch(() => {
      process.exitCode = 1;
    });
  });
