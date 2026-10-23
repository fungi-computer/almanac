import { expect, it } from "vitest";
import { afterRefused, backoffDelay } from "../src/index.js";

it("keeps a zero initial delay at zero when the exponential term overflows", () => {
  expect(backoffDelay(10_000, { baseMs: 0, maxMs: 300_000 })).toBe(0);
});

it("retains a finite immediate retry timestamp for a zero-delay refusal", () => {
  const refusal = afterRefused(
    {
      id: "immediate",
      cron: null,
      nextDueAt: 100,
      state: "active",
      lastError: null,
      attempt: 10_000,
    },
    1_000,
    "busy",
    { baseMs: 0, maxMs: 300_000 },
  );
  expect(refusal.retryAt).toBe(1_000);
  expect(refusal.schedule.attempt).toBe(10_001);
});
