import { nextOccurrence } from "@fungi.computer/almanac";
import * as Result from "effect/Result";

const next = nextOccurrence(
  { expression: "0 9 * * *", timeZone: "UTC" },
  Date.parse("2026-10-11T08:00:00Z"),
);
if (Result.isFailure(next)) throw new Error(next.failure.message);

export const occurrence = new Date(next.success).toISOString();
globalThis.console.log(occurrence);
