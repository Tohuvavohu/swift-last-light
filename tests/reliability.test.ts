import test from "node:test";
import assert from "node:assert/strict";
import { passesAtTime, type Pass, type Point } from "../lib/orbit";
import {
  aerospaceSnapshot,
  forecastWarning,
  getElements,
  getForecasts,
  mergeForecasts,
  SNAPSHOT_TLE,
  type Forecast,
} from "../lib/sources";

const point = (time: number) => ({ time }) as Point;
const pass = {
  id: 1,
  start: point(0),
  end: point(300),
  windows: [
    { start: point(10), end: point(100), peak: point(50) },
    { start: point(200), end: point(250), peak: point(230) },
  ],
} as Pass;

test("rolling search drops completed photo windows and passes, fixed search retains history", () => {
  assert.equal(passesAtTime([pass], 100, true)[0].windows.length, 1);
  assert.equal(passesAtTime([pass], 250, true)[0].windows.length, 0);
  assert.equal(passesAtTime([pass], 300, true).length, 0);
  assert.equal(passesAtTime([pass], 400, false)[0], pass);
  assert.equal(pass.windows.length, 2, "original orbit result is not mutated");
});

test("forecast outage retains newer successful data and its timestamp, then recovers", () => {
  const previous: Forecast = {
    ...aerospaceSnapshot,
    nominal: "2026-11-04T10:00:00Z",
    fetchedAt: "2026-11-01T00:00:00Z",
    status: "live",
  };
  const retained = mergeForecasts([previous], [aerospaceSnapshot])[0];
  assert.equal(retained.nominal, previous.nominal);
  assert.equal(retained.fetchedAt, previous.fetchedAt);
  assert.equal(retained.status, "snapshot");
  assert.deepEqual(mergeForecasts([previous], []), [retained]);
  assert.deepEqual(mergeForecasts([retained], [previous]), [previous]);
  assert.match(
    forecastWarning(
      { ...previous, fetchedAt: "2026-11-01T12:00:00Z" },
      Date.parse("2026-11-01T12:00:00Z"),
    )!,
    /Forecast inputs are/,
  );
});

test("provider cache deduplicates requests and preserves data across an upstream outage", async (t) => {
  let now = Date.parse("2026-10-31T19:00:00Z");
  let failed = false;
  const calls: Record<string, number> = {};
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    const source = url.includes("celestrak")
      ? "tle"
      : url.includes("umich")
        ? "michigan"
        : "aerospace";
    calls[source] = (calls[source] || 0) + 1;
    if (failed) return new Response("Unavailable", { status: 503 });
    if (source === "tle") return new Response(SNAPSHOT_TLE);
    if (source === "michigan")
      return Response.json({
        run_date: "2026-10-31",
        orbit_epoch_utc: "2026-10-31 10:44",
        reentry_utc: {
          p50: "2026-11-03 13:56",
          p05: "2026-11-03 01:06",
          p95: "2026-11-04 02:45",
        },
      });
    return new Response(
      "Predicted Reentry Time 04 Nov 2026 10:00 UTC ± 25 hours Orbit Epoch 31 Oct 2026 10:44:00 UTC",
    );
  });
  const [original] = await Promise.all([
    getElements(),
    getElements(),
    getElements(),
  ]);
  const [forecasts] = await Promise.all([getForecasts(), getForecasts()]);
  assert.deepEqual(calls, { tle: 1, michigan: 1, aerospace: 1 });
  failed = true;
  now += 16 * 60000;
  const orbit = await getElements();
  const outage = await getForecasts();
  assert.equal(orbit.epoch, original.epoch);
  assert.equal(orbit.fetchedAt, original.fetchedAt);
  assert.equal(orbit.snapshot, true);
  assert.match(orbit.refreshError!, /503/);
  assert.equal(outage.forecasts.length, 2);
  for (const f of outage.forecasts) {
    const old = forecasts.forecasts.find((x) => x.id === f.id)!;
    assert.equal(f.nominal, old.nominal);
    assert.equal(f.fetchedAt, old.fetchedAt);
    assert.equal(f.status, "snapshot");
  }
  await getElements();
  assert.equal(
    calls.tle,
    2,
    "failed upstream requests back off for one minute",
  );
  failed = false;
  now += 16 * 60000;
  assert.equal((await getElements()).snapshot, undefined);
  assert((await getForecasts()).forecasts.every((f) => f.status === "live"));
});
