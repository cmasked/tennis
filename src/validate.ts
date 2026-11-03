/**
 * Quota-explicit integration CLI. All logs remove the exact configured credential.
 * The format must be selected explicitly; a tournament label alone cannot establish it.
 */
import { validationOptions } from "./validation-options.ts";
import { validateLiveMatch } from "./validation.ts";
try {
  const options = validationOptions(process.argv.slice(2));
  if (options.raw)
    throw new Error(
      "--raw is not supported for api:validate. Use --tour and --tournament only.",
    );
  const key = process.env.TENNIS_API_KEY;
  const safeLog = (message: string) =>
    console.log(
      (key?.trim()
        ? message.split(key.trim()).join("[REDACTED]")
        : message
      ).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, ""),
    );
  const result = await validateLiveMatch(key, options, fetch, safeLog);
  if (result.failures) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Validation failed.");
  process.exitCode = 1;
}
