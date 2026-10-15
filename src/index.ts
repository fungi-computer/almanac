import * as Cron from "effect/Cron";
import * as Result from "effect/Result";

/**
 * Almanac: one durable schedule core for every host. A schedule is a record
 * plus pure transitions; the host owns storage, the timer and what a firing
 * does (send a Session prompt, start a Workflow run, ...). Every function here
 * is deterministic in its inputs, so a host replays it safely after restart.
 */

/** One cron cadence in one IANA time zone. */
export type Cadence = Readonly<{
  /** Cron expression parsed by Effect's Cron module. */
  expression: string;
  /** IANA time zone used to compute occurrences. */
  timeZone: string;
}>;

/** Whether a schedule can fire, is paused, or has settled. */
export type ScheduleState = "active" | "paused" | "cancelled" | "finished";

/** The fields every schedule has; hosts add their own target fields. */
export type ScheduleCore = Readonly<{
  /** Stable identifier used in the occurrence's idempotency key. */
  id: string;
  /** Recurring cadence, or null for a one-shot. */
  cron: Cadence | null;
  /** The occurrence that fires next (or fired last, once finished). */
  nextDueAt: number;
  /** Current lifecycle state. Only active schedules can be due. */
  state: ScheduleState;
  /** Why the current occurrence has not been admitted yet, if it failed. */
  lastError: string | null;
  /** Consecutive failed admissions of the current occurrence. */
  attempt: number;
}>;

/** A refused occurrence: the schedule's new state and when to retry it. */
export type Refusal<S extends ScheduleCore> = Readonly<{
  /** Schedule with the refusal reason and incremented attempt count. */
  schedule: S;
  /** Unix time in milliseconds when the host should retry admission. */
  retryAt: number;
}>;

/** Initial and maximum delays for exponential admission retries. */
export type RetryPolicy = Readonly<{
  /** Delay in milliseconds after the first refused admission. */
  baseMs: number;
  /** Maximum retry delay in milliseconds. */
  maxMs: number;
}>;

/** Default backoff: 30 s doubling to at most an hour. */
export const defaultRetryPolicy: RetryPolicy = {
  baseMs: 30_000,
  maxMs: 3_600_000,
};

/** Why the next occurrence could not be computed. */
export type CadenceError = Readonly<{
  /** Invalid expression or zone, or a cadence with no remaining occurrence. */
  kind: "invalid" | "exhausted";
  /** Human-readable reason supplied to the host. */
  message: string;
}>;

/**
 * The first occurrence strictly after `after`. Hosts pass the current time
 * after a firing, so occurrences missed while down or paused coalesce into
 * the next one: a schedule never replays a backlog.
 */
export function nextOccurrence(
  cadence: Cadence,
  after: number,
): Result.Result<number, CadenceError> {
  // effect/Cron reports a bad expression or an unknown zone as a Failure.
  const parsed = Cron.parse(cadence.expression, cadence.timeZone);
  if (Result.isFailure(parsed))
    return Result.fail({
      kind: "invalid",
      message: "Cron expression or time zone is invalid",
    });
  try {
    return Result.succeed(Cron.next(parsed.success, new Date(after)).getTime());
  } catch (cause) {
    // effect/Cron throws a plain Error when a cadence never occurs again.
    if (!(cause instanceof Error)) throw cause;
    return Result.fail({
      kind: "exhausted",
      message: "Cron cadence has no next occurrence",
    });
  }
}

/**
 * The idempotency key of the schedule's current occurrence. A retried or
 * re-fired admission of the same occurrence carries the same key, so the
 * host's action runs at most once per occurrence.
 */
export function occurrenceKey(schedule: ScheduleCore): string {
  return `${schedule.id}:${String(schedule.nextDueAt)}`;
}

/** Whether the host should fire now; a paused or settled schedule never does. */
export function isDue(schedule: ScheduleCore, now: number): boolean {
  return schedule.state === "active" && schedule.nextDueAt <= now;
}

/** Whether a schedule is cancelled or finished. */
export function settled(schedule: ScheduleCore): boolean {
  return schedule.state === "cancelled" || schedule.state === "finished";
}

/**
 * The occurrence was admitted. A one-shot finishes; a recurring schedule moves
 * to its next occurrence after `now`, or pauses with the reason if its cadence
 * has none.
 */
export function afterAdmitted<S extends ScheduleCore>(
  schedule: S,
  now: number,
): S {
  if (schedule.cron === null)
    return { ...schedule, state: "finished", lastError: null, attempt: 0 };
  const next = nextOccurrence(schedule.cron, now);
  if (Result.isFailure(next))
    return {
      ...schedule,
      state: "paused",
      lastError: next.failure.message,
      attempt: 0,
    };
  return { ...schedule, nextDueAt: next.success, lastError: null, attempt: 0 };
}

/**
 * The occurrence was refused. The schedule records why and retries the same
 * occurrence (same key) after a bounded backoff; one failing schedule never
 * delays another.
 */
export function afterRefused<S extends ScheduleCore>(
  schedule: S,
  now: number,
  reason: string,
  policy: RetryPolicy = defaultRetryPolicy,
): Refusal<S> {
  const attempt = schedule.attempt + 1;
  return {
    schedule: { ...schedule, attempt, lastError: reason },
    retryAt:
      now +
      Math.min(policy.baseMs * 2 ** Math.max(0, attempt - 1), policy.maxMs),
  };
}

/** Pause admission while preserving the occurrence and any failure reason. */
export function paused<S extends ScheduleCore>(schedule: S): S {
  return { ...schedule, state: "paused" };
}

/**
 * Resume is the human retry: it clears the failure and skips recurring
 * occurrences missed while paused.
 */
export function resumed<S extends ScheduleCore>(
  schedule: S,
  now: number,
): Result.Result<S, CadenceError> {
  const nextDueAt =
    schedule.cron === null
      ? Result.succeed(schedule.nextDueAt)
      : nextOccurrence(schedule.cron, now);
  return Result.map(nextDueAt, (due) => ({
    ...schedule,
    state: "active" as const,
    nextDueAt: due,
    lastError: null,
    attempt: 0,
  }));
}

/** Cancel an unsettled schedule, leaving an already settled record unchanged. */
export function cancelled<S extends ScheduleCore>(schedule: S): S {
  return settled(schedule) ? schedule : { ...schedule, state: "cancelled" };
}
