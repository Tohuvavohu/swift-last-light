import test from "node:test";
import assert from "node:assert/strict";
import {
  assemblePublishedData,
  initialPublishedData,
  parsePublishedData,
  publicationStatus,
} from "../lib/published-data";
import { parseMichigan, aerospaceSnapshot } from "../lib/sources";

test("published snapshot validates TLE and timestamps without refreshing their age", () => {
  const original = initialPublishedData();
  const parsed = parsePublishedData(JSON.parse(JSON.stringify(original)));
  assert.equal(parsed.tle.fetchedAt, "2026-10-31T19:04:00.000Z");
  assert.equal(parsed.forecasts[0].fetchedAt, parsed.tle.fetchedAt);
  assert.throws(
    () => parsePublishedData({ ...original, schemaVersion: 2 }),
    /format/,
  );
  assert.throws(
    () => parsePublishedData({ ...original, checkedAt: "bad" }),
    /timestamp/,
  );
  assert.throws(
    () =>
      parsePublishedData({
        ...original,
        tle: { ...original.tle, line1: "bad" },
      }),
    /TLE/,
  );
});

test("independent scheduled runs retain successful provider data during outages", () => {
  const first = initialPublishedData();
  const michigan = parseMichigan({
    run_date: "2026-10-31",
    orbit_epoch_utc: "2026-10-31 10:44",
    reentry_utc: {
      p50: "2026-11-03 13:56",
      p05: "2026-11-03 01:06",
      p95: "2026-11-04 02:45",
    },
  });
  const good = assemblePublishedData(
    first,
    {
      status: "fulfilled",
      value: {
        ...first.tle,
        snapshot: false,
        fetchedAt: "2026-10-31T19:15:00Z",
      },
    },
    {
      status: "fulfilled",
      value: {
        forecasts: [
          michigan,
          {
            ...aerospaceSnapshot,
            status: "live",
            nominal: "2026-11-04T10:00:00Z",
            fetchedAt: "2026-10-31T19:15:00Z",
          },
        ],
        errors: [],
        fetchedAt: "2026-10-31T19:15:00Z",
      },
    },
    "2026-10-31T19:15:00Z",
  );
  const recovered = parsePublishedData(JSON.parse(JSON.stringify(good)));
  const outage = assemblePublishedData(
    recovered,
    { status: "rejected", reason: Error("503") },
    {
      status: "fulfilled",
      value: {
        forecasts: [aerospaceSnapshot],
        errors: [{ source: "Michigan", message: "503" }],
        fetchedAt: "2026-10-31T19:30:00Z",
      },
    },
    "2026-10-31T19:30:00Z",
  );
  assert.equal(outage.tle.fetchedAt, recovered.tle.fetchedAt);
  assert.equal(outage.tle.snapshot, true);
  assert.equal(outage.forecasts.length, 2);
  assert.equal(
    outage.forecasts.find((f) => f.id === "aerospace")!.nominal,
    "2026-11-04T10:00:00.000Z",
  );
  assert(outage.forecasts.every((f) => f.status === "snapshot"));
  assert.equal(publicationStatus(outage).status, "degraded");
  assert.equal(
    publicationStatus({ ...outage, checkedAt: "2026-11-02T00:00:00Z" }).status,
    "unavailable",
  );
});
