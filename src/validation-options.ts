/**
 * Parse validation options before any network call. Format presets are explicit user choices.
 */
import { parseLiveOptions } from "./live-events.ts";
import {
  SLAM_MENS_SINGLES,
  STANDARD_BEST_OF_THREE,
  type ScoringFormat,
} from "./engine/point-engine.ts";
export function validationOptions(args: string[]) {
  const rest: string[] = [];
  let format: ScoringFormat | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--format") {
      rest.push(args[i]);
      continue;
    }
    const value = args[++i];
    if (value === "standard-bo3")
      format = structuredClone(STANDARD_BEST_OF_THREE);
    else if (value === "slam-men") format = structuredClone(SLAM_MENS_SINGLES);
    else
      throw new Error(
        "--format must be standard-bo3 or slam-men; choose the actual match format.",
      );
  }
  const options = parseLiveOptions(rest);
  if (options.raw) throw new Error("--raw is not supported for api:validate.");
  return { ...options, format };
}
