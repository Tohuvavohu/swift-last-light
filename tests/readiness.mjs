import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import {
  snapshotElements,
  aerospaceSnapshot,
  parseMichigan,
} from "../lib/sources.ts";
import { findPasses, visibleSeconds } from "../lib/orbit.ts";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
  args: ["--no-sandbox"],
});
const start = Date.parse("2026-10-31T19:00:00Z");
const elements = {
  ...snapshotElements(),
  snapshot: false,
  fetchedAt: new Date(start).toISOString(),
};
const michigan = {
  ...parseMichigan({
    run_date: "2026-10-31",
    orbit_epoch_utc: "2026-10-31 10:44",
    reentry_utc: {
      p50: "2026-11-03 13:56",
      p05: "2026-11-03 01:06",
      p95: "2026-11-04 02:45",
    },
  }),
  fetchedAt: new Date(start).toISOString(),
};
const aero = {
  ...aerospaceSnapshot,
  nominal: "2026-11-04T10:00:00Z",
  status: "live",
  fetchedAt: "2026-10-31T19:30:00Z",
};
const appURL = process.env.APP_URL || "http://127.0.0.1:5173/";
let outage = 0;
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "America/Los_Angeles",
    permissions: ["geolocation"],
    geolocation: { latitude: 37.7749, longitude: -122.4194 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: start });
  await page.route("**/data/latest.json", (r) => {
    assert.equal(
      new URL(r.request().url()).pathname,
      new URL("data/latest.json", appURL).pathname,
    );
    return outage === 2
      ? r.fulfill({ status: 503, json: { error: "Unavailable" } })
      : r.fulfill({
          json: {
            schemaVersion: 1,
            tle: elements,
            checkedAt: new Date(start).toISOString(),
            forecasts: outage ? [aerospaceSnapshot] : [michigan, aero],
            errors: outage
              ? [{ source: "Michigan", message: "Source returned HTTP 503." }]
              : [],
          },
        });
  });
  await page.route("https://geocoding-api.open-meteo.com/**", (r) =>
    r.fulfill({
      json: {
        results: [
          {
            name: "Honolulu",
            admin1: "Hawaii",
            country: "United States",
            latitude: 21.3069,
            longitude: -157.8583,
            elevation: 10,
            timezone: "Pacific/Honolulu",
          },
        ],
      },
    }),
  );
  await page.goto(appURL, { waitUntil: "networkidle" });
  await page.locator(".pass-row").first().waitFor();
  assert(
    await page
      .locator(".brand-logo")
      .evaluate((img) => img.complete && img.naturalWidth > 0),
  );
  assert(
    (
      await page
        .getByRole("button", { name: "Use my location", exact: true })
        .boundingBox()
    ).y < 844,
  );
  assert(
    await page
      .getByRole("button", { name: "How this planner works" })
      .isVisible(),
  );
  await page.getByRole("button", { name: "How this planner works" }).click();
  assert(await page.getByRole("dialog").isVisible());
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page
    .getByRole("button", { name: "Use my location", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "No pass meets your elevation limit",
      exact: true,
    })
    .waitFor();
  assert.match(
    await page.locator(".observation-brief").innerText(),
    /latitude/,
  );
  await page.getByLabel("City or postal code").fill("Honolulu");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.locator(".city-results button").first().click();
  await page
    .getByRole("heading", { name: "Next observing opportunity" })
    .waitFor();
  assert.match(
    await page.locator(".opportunity-time").innerText(),
    /Sun 01 Nov/,
  );
  assert.match(
    await page.locator(".opportunity-time").innerText(),
    /Sat 31 Oct.*Site: Pacific\/Honolulu/,
  );
  await page.getByLabel("City or postal code").fill("Missing city");
  await page.unroute("https://geocoding-api.open-meteo.com/**");
  await page.route("https://geocoding-api.open-meteo.com/**", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByText(
      "City search unavailable. Use your location, a preset, coordinates, or the map.",
    )
    .waitFor();
  outage = 1;
  await page
    .getByRole("button", { name: "Refresh published data", exact: true })
    .click();
  await page.locator(".forecast-refresh-notices").waitFor();
  assert.equal(await page.locator(".reentry-estimate").count(), 2);
  assert.match(
    await page.locator(".reentry-summary").innerText(),
    /04 Nov, 10:00/,
  );
  assert.match(
    await page.locator(".reentry-summary").innerText(),
    /03 Nov, 13:56/,
  );
  assert.equal(
    await page
      .locator(".reentry-estimate-source .pill")
      .filter({ hasText: "SNAPSHOT" })
      .count(),
    2,
  );
  outage = 2;
  await page
    .getByRole("button", { name: "Refresh published data", exact: true })
    .click();
  await page.getByText("Published data refresh:", { exact: true }).waitFor();
  assert.equal(await page.locator(".reentry-estimate").count(), 2);
  outage = 0;
  await page
    .getByRole("button", { name: "Refresh published data", exact: true })
    .click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".reentry-estimate-source .pill")].every(
      (e) => e.textContent === "FETCHED",
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "outputs/readiness-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "outputs/readiness-mobile.png",
    fullPage: true,
  });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow at ${width}px`,
    );
  }
  const photo = findPasses(
    elements,
    { name: "Honolulu", lat: 21.3069, lon: -157.8583, height: 10 },
    { minimum: 10, darkness: -6, hours: 24, start, allowStale: false },
  ).passes.find((p) => visibleSeconds(p) >= 10);
  await page.clock.setSystemTime(new Date(photo.end.time + 5 * 60000));
  await page.clock.runFor(31000);
  assert.match(
    await page.locator(".publication-note").innerText(),
    /Source checks are overdue/,
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector(".observation-brief")
        ?.getAttribute("aria-busy") === "false",
  );
  assert.equal(
    await page.locator(".pass-row").count(),
    0,
    "completed photo pass disappears from live list",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Save observation to calendar" })
      .count(),
    0,
  );
  await page
    .getByLabel("Start time · UTC", { exact: false })
    .fill("2026-10-31T19:00");
  await page.locator(".pass-row").first().waitFor();
  assert.match(
    await page.locator(".pass-row").first().innerText(),
    /Completed · historical/,
  );
  assert(
    await page
      .getByRole("button", { name: "Save observation to calendar" })
      .isDisabled(),
  );
  await page.getByRole("button", { name: "From now", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".pass-row").length === 0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Passed: location first on mobile, geolocation, city search and outage fallback, site timezone and date rollover, forecast retention and recovery, expired passes, fixed historical searches, keyboard dialog, responsive widths. No browser errors.",
  );
} finally {
  await browser.close();
}
