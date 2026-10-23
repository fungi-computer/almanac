import * as Result from "effect/Result";
import { describe, expect, it } from "vitest";
import {
  afterAdmitted,
  afterRefused,
  cancelled,
  isDue,
  nextOccurrence,
  occurrenceKey,
  paused,
  resumed,
  type ScheduleCore,
} from "../src/index.js";

const hour = 3_600_000;
const daily9 = { expression: "0 9 * * *", timeZone: "Europe/Berlin" };
const at = (iso: string) => Date.parse(iso);
const recurring = (nextDueAt: number): ScheduleCore & { target: string } => ({
  id: "water",
  cron: daily9,
  nextDueAt,
  state: "active",
  lastError: null,
  attempt: 0,
  target: "ferns",
});

describe("cadence", () => {
  it("finds the next occurrence in the schedule's own zone", () => {
    expect(nextOccurrence(daily9, at("2026-10-11T06:00:00Z"))).toEqual(
      Result.succeed(at("2026-10-11T07:00:00Z")),
    );
  });

  it("fires once per local day across both daylight-saving changes", () => {
    const cadence = { expression: "30 2 * * *", timeZone: "Europe/Berlin" };
    const series = (from: string) => {
      const out: string[] = [];
      let after = at(from);
      for (let index = 0; index < 3; index++) {
        const next = nextOccurrence(cadence, after);
        if (Result.isFailure(next)) throw new Error(next.failure.message);
        out.push(new Date(next.success).toISOString());
        after = next.success;
      }
      return out;
    };
    // 02:30 does not exist on 29 March: that day runs once, an hour later.
    expect(series("2026-03-28T12:00:00Z")).toEqual([
      "2026-03-29T01:30:00.000Z",
      "2026-03-30T00:30:00.000Z",
      "2026-03-31T00:30:00.000Z",
    ]);
    // 02:30 happens twice on 25 October: it runs once, at the first.
    expect(series("2026-10-24T12:00:00Z")).toEqual([
      "2026-10-25T00:30:00.000Z",
      "2026-10-26T01:30:00.000Z",
      "2026-10-27T01:30:00.000Z",
    ]);
  });

  it("refuses a bad expression, an unknown zone and a cadence that never occurs", () => {
    for (const cadence of [
      { expression: "nope", timeZone: "UTC" },
      { expression: "0 9 * * *", timeZone: "Mars/Base" },
    ])
      expect(nextOccurrence(cadence, 0)).toMatchObject({
        failure: { kind: "invalid" },
      });
    expect(
      nextOccurrence({ expression: "0 0 31 2 *", timeZone: "UTC" }, 0),
    ).toMatchObject({ failure: { kind: "exhausted" } });
  });
});

describe("occurrences", () => {
  it("names each occurrence once, so a retried firing has the same key", () => {
    const schedule = recurring(at("2026-10-11T07:00:00Z"));
    const retried = afterRefused(schedule, schedule.nextDueAt, "busy").schedule;
    expect(occurrenceKey(retried)).toBe(occurrenceKey(schedule));
    expect(occurrenceKey(schedule)).toBe(`water:${String(schedule.nextDueAt)}`);
  });

  it("coalesces missed occurrences into the next one after now (no backlog)", () => {
    const schedule = recurring(at("2026-10-01T07:00:00Z"));
    const now = at("2026-10-11T12:00:00Z");
    expect(isDue(schedule, now)).toBe(true);
    const next = afterAdmitted(schedule, now);
    expect(next.nextDueAt).toBe(at("2026-10-12T07:00:00Z"));
    expect(next.target).toBe("ferns");
    expect(isDue(next, now)).toBe(false);
  });

  it("finishes a one-shot and pauses a cadence that has no next occurrence", () => {
    expect(afterAdmitted({ ...recurring(0), cron: null }, 1).state).toBe(
      "finished",
    );
    const never = {
      ...recurring(0),
      cron: { expression: "0 0 31 2 *", timeZone: "UTC" },
    };
    expect(afterAdmitted(never, 1)).toMatchObject({
      state: "paused",
      lastError: "Cron cadence has no next occurrence",
    });
  });

  it("backs off a refused occurrence and keeps its failure visible", () => {
    const first = afterRefused(recurring(0), 1_000, "member lost access");
    expect(first).toMatchObject({
      schedule: { attempt: 1, lastError: "member lost access" },
      retryAt: 31_000,
    });
    expect(occurrenceKey(first.schedule)).toBe(occurrenceKey(recurring(0)));
    const second = afterRefused(first.schedule, 1_000, "still refused");
    expect(second).toMatchObject({
      schedule: { attempt: 2, lastError: "still refused" },
      retryAt: 61_000,
    });
    let schedule = first.schedule;
    for (let index = 0; index < 20; index++)
      schedule = afterRefused(schedule, 0, "still refused").schedule;
    expect(afterRefused(schedule, 0, "x").retryAt).toBe(hour);
    const largeAttempt = afterRefused(
      { ...schedule, attempt: 10_000 },
      0,
      "still refused",
    );
    expect(largeAttempt).toMatchObject({
      schedule: { attempt: 10_001, lastError: "still refused" },
      retryAt: hour,
    });
    expect(occurrenceKey(largeAttempt.schedule)).toBe(occurrenceKey(schedule));
    expect(afterAdmitted(schedule, 0)).toMatchObject({
      attempt: 0,
      lastError: null,
    });
  });
});

describe("state", () => {
  it("never fires paused or settled schedules", () => {
    const due = recurring(0);
    expect(isDue(paused(due), 1)).toBe(false);
    expect(isDue(cancelled(due), 1)).toBe(false);
    expect(cancelled(afterAdmitted({ ...due, cron: null }, 1)).state).toBe(
      "finished",
    );
  });

  it("resumes on the next occurrence after now, clearing the failure", () => {
    const failed = afterRefused(
      recurring(at("2026-10-01T07:00:00Z")),
      0,
      "x",
    ).schedule;
    const back = resumed(paused(failed), at("2026-10-11T12:00:00Z"));
    expect(back).toEqual(
      Result.succeed({
        ...failed,
        state: "active",
        nextDueAt: at("2026-10-12T07:00:00Z"),
        lastError: null,
        attempt: 0,
      }),
    );
    const oneShot = { ...failed, cron: null };
    expect(Result.map(resumed(oneShot, 5), (s) => s.nextDueAt)).toEqual(
      Result.succeed(oneShot.nextDueAt),
    );
  });
});
