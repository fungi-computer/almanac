import {
  nextOccurrence,
  afterRefused,
  type Cadence,
  type ScheduleCore,
  type CadenceError,
  type Refusal,
} from "@fungi.computer/almanac";
import * as Result from "effect/Result";

const cadence: Cadence = { expression: "0 9 * * *", timeZone: "UTC" };
export const next: Result.Result<number, CadenceError> = nextOccurrence(
  cadence,
  0,
);
export const following = Result.flatMap(next, (at) =>
  nextOccurrence(cadence, at),
);
const schedule: ScheduleCore & { target: string } = {
  id: "water",
  cron: cadence,
  nextDueAt: 1_000,
  state: "active",
  lastError: null,
  attempt: 0,
  target: "ferns",
};
export const retry: Refusal<typeof schedule> = afterRefused(
  schedule,
  1_000,
  "busy",
);
export const target: string = retry.schedule.target;
