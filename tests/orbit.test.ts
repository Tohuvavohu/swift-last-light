import test from "node:test";
import assert from "node:assert/strict";
import {
  findPasses,
  footprintRadius,
  illumination,
  isVisible,
  makeSampler,
  parseTLE,
  splitTrack,
  visibleSeconds,
  type Point,
} from "../lib/orbit";
import {
  normalizeForecast,
  parseAerospace,
  parseMichigan,
  SNAPSHOT_TLE,
  snapshotElements,
} from "../lib/sources";
const observer = { name: "Honolulu", lat: 21.3069, lon: -157.8583, height: 10 };
const settings = {
  minimum: 10,
  darkness: -6,
  hours: 24,
  start: Date.parse("2026-10-31T19:00:00Z"),
  allowStale: false,
};
test("TLE fractional UTC epoch, object validation and checksums", () => {
  assert.equal(parseTLE(SNAPSHOT_TLE).epoch, "2026-10-31T10:44:38.816Z");
  assert.throws(
    () => parseTLE(SNAPSHOT_TLE.replaceAll("28485", "25544")),
    /NORAD/,
  );
  assert.throws(
    () => parseTLE(SNAPSHOT_TLE.replace("195.6831", "195.6832")),
    /checksum/,
  );
  assert.throws(() => parseTLE("1 28485\n2 28485"), /69 characters/);
});
test("sunlight, umbra and penumbra geometry", () => {
  const sun = { x: 149597870, y: 0, z: 0 };
  assert.equal(illumination({ x: 6600, y: 0, z: 0 }, sun), "sunlit");
  assert.equal(illumination({ x: -6600, y: 0, z: 0 }, sun), "umbra");
  const r = 6600,
    theta = Math.asin(6378.137 / r);
  assert.equal(
    illumination(
      { x: -r * Math.cos(theta), y: r * Math.sin(theta), z: 0 },
      sun,
    ),
    "penumbra",
  );
});
test("higher elevation thresholds shrink the footprint", () => {
  assert.ok(footprintRadius(230, 0) > footprintRadius(230, 10));
  assert.ok(footprintRadius(230, 10) > footprintRadius(230, 45));
  assert.ok(Math.abs(footprintRadius(230, 90)) < 0.1);
});
test("photo windows meet all three conditions throughout their interior", () => {
  const e = snapshotElements(),
    sample = makeSampler(e, observer),
    result = findPasses(e, observer, settings);
  assert.equal(result.passes.length, 4);
  const photos = result.passes.filter((p) => visibleSeconds(p) >= 10);
  assert.equal(photos.length, 1);
  assert.ok(visibleSeconds(photos[0]) > 100 && visibleSeconds(photos[0]) < 125);
  for (const p of result.passes) {
    assert.ok(p.start.time < p.peak.time && p.peak.time < p.end.time);
    assert.ok(Math.abs(p.start.elevation - settings.minimum) < 0.03);
    assert.ok(Math.abs(p.end.elevation - settings.minimum) < 0.03);
    for (const w of p.windows)
      for (let t = w.start.time + 1000; t < w.end.time - 1000; t += 1000)
        assert.ok(isVisible(sample(t)!, settings));
  }
});
test("normal predictions stop at epoch age limit", () => {
  const e = snapshotElements(),
    epoch = Date.parse(e.epoch),
    r = findPasses(e, observer, settings);
  assert.equal(r.stop, epoch + 24 * 3600000);
  assert.match(r.reason!, /clipped/);
  assert.equal(
    findPasses(e, observer, { ...settings, start: epoch + 25 * 3600000 }).passes
      .length,
    0,
  );
});
test("San Francisco cannot see this low inclination orbit above 10 degrees", () => {
  assert.equal(
    findPasses(
      snapshotElements(),
      { name: "San Francisco", lat: 37.7749, lon: -122.4194, height: 20 },
      settings,
    ).passes.length,
    0,
  );
});
test("reentry overlap flags identify affected passes", () => {
  assert.deepEqual(
    findPasses(
      snapshotElements(),
      observer,
      settings,
      Date.parse("2026-11-01T03:00:00Z"),
    ).passes.map((p) => p.conditional),
    [false, false, true, true],
  );
});
test("ground tracks split at the antimeridian", () => {
  const tracks = splitTrack(
    [178, 179, -179, -178].map((lon) => ({ lon, light: "sunlit" }) as Point),
  );
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].length, 2);
});
test("Michigan uses ensemble median and 90% bounds, not deterministic center", () => {
  const f = parseMichigan({
    run_date: "2026-10-30",
    orbit_epoch_utc: "2026-10-30 00:37",
    reentry_utc: {
      center: "2026-11-03 12:29",
      p50: "2026-11-03 13:56",
      p05: "2026-11-03 01:06",
      p95: "2026-11-04 02:45",
    },
  });
  assert.equal(f.nominal, "2026-11-03T13:56:00.000Z");
  assert.equal(f.earliest, "2026-11-03T01:06:00.000Z");
  assert.match(f.confidence, /90%/);
  assert.throws(() => parseMichigan({}), /schema/);
});
test("Aerospace preserves uncertainty and orbit epoch; blocks fail explicitly", () => {
  const f = parseAerospace(
    "<td>Predicted Reentry Time</td><td>04 Nov 2026 09:30 UTC &plusmn; 26 hours</td><td>Orbit Epoch</td><td>30 Oct 2026 00:37:05.834 UTC</td>",
  );
  assert.equal(f.earliest, "2026-11-03T07:30:00.000Z");
  assert.equal(f.latest, "2026-11-05T11:30:00.000Z");
  assert.equal(f.orbitEpoch, "2026-10-30T00:37:05.834Z");
  assert.throws(
    () => parseAerospace("<title>Just a moment...</title>"),
    /blocked/,
  );
});
test("manual forecasts validate bounds, timezone and URL scheme", () => {
  const base = {
    source: "Provider",
    url: "https://example.com",
    nominal: "2026-11-04T09:30:00Z",
  };
  assert.equal(normalizeForecast(base).earliest, undefined);
  assert.throws(
    () => normalizeForecast({ ...base, earliest: "2026-11-04T09:00:00Z" }),
    /both/,
  );
  assert.throws(
    () =>
      normalizeForecast({
        ...base,
        earliest: "2026-11-05T00:00:00Z",
        latest: "2026-11-06T00:00:00Z",
      }),
    /inside/,
  );
  assert.throws(
    () => normalizeForecast({ ...base, nominal: "2026-11-04T09:30:00" }),
    /timezone/,
  );
  assert.throws(
    () => normalizeForecast({ ...base, url: "javascript:alert(1)" }),
    /HTTP/,
  );
});
