import assert from "node:assert/strict";
import { URL } from "node:url";
import {
  nextOccurrence,
  afterRefused,
  occurrenceKey,
} from "@fungi.computer/almanac";
import * as Result from "effect/Result";

const { occurrence } = await import(
  new URL(
    "../examples/next-occurrence.mjs",
    import.meta.resolve("@fungi.computer/almanac"),
  )
);
assert.equal(occurrence, "2026-10-11T09:00:00.000Z");
assert.equal(
  nextOccurrence({ expression: "nope", timeZone: "UTC" }, 0).failure.kind,
  "invalid",
);
const first = nextOccurrence(
  { expression: "0 9 * * *", timeZone: "UTC" },
  Date.parse("2026-10-11T08:00:00Z"),
);
const second = Result.flatMap(first, (at) =>
  nextOccurrence({ expression: "0 9 * * *", timeZone: "UTC" }, at),
);
assert.equal(second.success, Date.parse("2026-10-12T09:00:00Z"));
const schedule = {
  id: "water",
  cron: null,
  nextDueAt: 1_000,
  state: "active",
  lastError: null,
  attempt: 0,
};
const retry = afterRefused(schedule, 1_000, "busy");
assert.equal(retry.retryAt, 31_000);
assert.equal(occurrenceKey(retry.schedule), "water:1000");
