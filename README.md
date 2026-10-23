# Almanac

Most people want [Oyster](https://docs.fungi.computer/oyster/) to run their Apps
or [Shiitake](https://docs.fungi.computer/shiitake/) to run their Agents.
Almanac gives host authors a pure schedule core for cron cadences, occurrence
identity and retries. The host owns storage, its timer and what a firing does.

## Quickstart

Use Node 24 or later. Install the package and run its shipped example:

```sh
mkdir my-schedule
cd my-schedule
npm init -y
npm install @fungi.computer/almanac effect@4.0.2
node node_modules/@fungi.computer/almanac/examples/next-occurrence.mjs
```

It prints `2026-10-11T09:00:00.000Z`. During release qualification, install the
supplied Almanac `.tgz` instead of the package name. Publication is a separate
step.

The example uses the root export:

```js
import { nextOccurrence } from "@fungi.computer/almanac";
import * as Result from "effect/Result";

const next = nextOccurrence(
  { expression: "0 9 * * *", timeZone: "UTC" },
  Date.parse("2026-10-11T08:00:00Z"),
);
if (Result.isFailure(next)) throw new Error(next.failure.message);
console.log(new Date(next.success).toISOString());
```

## Examples

The same package works in a browser bundle. It needs standard `Date` and `Intl`
time-zone support, and no Workers runtime, Node polyfills or host credentials.
The packed browser proof runs this shipped example in Chromium. The packed Node
consumer also checks the public types with strict NodeNext and
`skipLibCheck: false`.

## Core concepts

A schedule is a `ScheduleCore` record plus the host's own target fields.
Transitions return a new record. Nothing starts a timer or writes storage.

- `nextOccurrence(cadence, after)`: the first occurrence strictly after `after`
  for a cron expression in an IANA zone (`effect/Cron`). A bad expression or
  zone is `invalid`; a cadence that never occurs again is `exhausted`.
- `occurrenceKey(schedule)` is `id:nextDueAt`. A retried firing of the same
  occurrence has the same key, so the host can admit that occurrence
  idempotently.
- Missed ticks coalesce. After a firing, and on resume, the next occurrence is
  computed from now, so a schedule that was down or paused runs once, not a
  backlog.
- `afterAdmitted` finishes a one-shot or moves a recurring schedule on (pausing
  it with the reason if its cadence is exhausted). `afterRefused` keeps the same
  occurrence, records why and backs off (30 s doubling to 1 h by default).
  `paused`, `resumed` and `cancelled` are the state changes; paused and settled
  schedules are never due.

See the [API reference](docs/api/README.md) for the complete root export.

## Shared backoff

`BackoffDelay` fixes the pure `(attempt, policy) => delayMs` contract, reusing
`RetryPolicy`. Attempt one (and attempts below one) uses the initial delay,
bounded by the cap; later attempts double up to that cap. The caller supplies
its own policy, and the calculation owns no clock, storage or retry execution.
`afterRefused` uses this calculation after incrementing the refusal attempt.

## Maintainer checks

```sh
pnpm --dir packages/almanac run test
pnpm --dir packages/almanac run lint
pnpm --dir packages/almanac run typecheck
pnpm --dir packages/almanac run build
pnpm --dir packages/almanac run docs
pnpm --dir packages/almanac run stranger
pnpm --dir packages/almanac run stranger:browser
```

Browser proof commands use the repository's heavy scheduler. Build cleans old
output before emitting declarations. The archive ships the runtime, types,
license, README, API reference and example. Maintainer tests stay in the source
checkout. Licensed under [MIT](LICENSE).
