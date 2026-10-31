import test from "node:test";
import assert from "node:assert/strict";
import reference from "./fixtures/skyfield-reference.json";
import { findPasses, makeSampler, parseTLE } from "../lib/orbit";

const elements = parseTLE(`${reference.line1}\n${reference.line2}`);
test("positions and sunlight match independent Skyfield / JPL reference", () => {
  for (const point of reference.points) {
    const actual = makeSampler(
      elements,
      point.observer,
    )(Date.parse(point.time))!;
    const description = `${point.observer.name} at ${point.time}`;
    assert(
      Math.abs(actual.elevation - point.elevation) < 0.005,
      `Elevation: ${description}`,
    );
    assert(
      Math.abs(actual.azimuth - point.azimuth) < 0.005,
      `Azimuth: ${description}`,
    );
    assert(Math.abs(actual.range - point.range) < 0.1, `Range: ${description}`);
    // SunCalc is approximate; this tolerance concerns solar position, not SGP4.
    assert(
      Math.abs(actual.sunAltitude - point.sunAltitude) < 0.2,
      `Sun altitude: ${description}`,
    );
    assert.equal(
      actual.light === "sunlit",
      point.sunlit,
      `Illumination: ${description}`,
    );
  }
});

test("geometric rise, culmination and set agree with independent Skyfield within one second", () => {
  const sites = new Map(
    reference.events.map((event) => [event.observer.name, event.observer]),
  );
  for (const [name, observer] of sites) {
    const result = findPasses(elements, observer, {
      minimum: 10,
      darkness: -6,
      hours: 24,
      start: Date.parse("2026-10-31T19:00:00Z"),
      allowStale: false,
    });
    const events = reference.events.filter((e) => e.observer.name === name);
    assert.equal(result.passes.length * 3, events.length, name);
    for (const event of events) {
      const key = { rise: "start", culmination: "peak", set: "end" }[
        event.kind
      ] as "start" | "peak" | "end";
      const difference = Math.min(
        ...result.passes.map((pass) =>
          Math.abs(pass[key].time - Date.parse(event.time)),
        ),
      );
      assert(
        difference < 1000,
        `${name} ${event.kind}: difference ${difference} ms`,
      );
    }
  }
});
