import { expect, expectTypeOf, it } from "vitest";
import {
  backoffDelay,
  type BackoffDelay,
  type RetryPolicy,
} from "../src/index.js";

it("exposes the pure delay port with explicit attempt and policy inputs", () => {
  expectTypeOf(backoffDelay).toEqualTypeOf<BackoffDelay>();
  expectTypeOf<BackoffDelay>().parameters.toEqualTypeOf<
    [attempt: number, policy: RetryPolicy]
  >();
  expectTypeOf<BackoffDelay>().returns.toEqualTypeOf<number>();
});

it("calculates the bounded exponential delay with the supplied attempt convention", () => {
  const policy = { baseMs: 30_000, maxMs: 3_600_000 };
  expect(backoffDelay(0, policy)).toBe(30_000);
  expect(backoffDelay(-4, policy)).toBe(30_000);
  expect(backoffDelay(1, policy)).toBe(30_000);
  expect(backoffDelay(2, policy)).toBe(60_000);
  expect(backoffDelay(8, policy)).toBe(3_600_000);
  expect(backoffDelay(10_000, policy)).toBe(3_600_000);
});
