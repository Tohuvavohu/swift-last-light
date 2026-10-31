import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.APP_URL || "http://127.0.0.1:5173/", {
    waitUntil: "networkidle",
  });
  await page.getByRole("heading", { name: "Catch the last light." }).waitFor();
  await page.locator(".leaflet-container").waitFor();
  await page
    .getByRole("button", { name: "Refresh published data" })
    .waitFor({ timeout: 25000 });
  await page.locator(".pass-row").first().waitFor({ timeout: 15000 });
  await page.locator(".pass-row").first().click();
  assert.ok(
    (await page.locator(".map-time").innerText()).includes("PREVIEW TIME"),
  );
  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  assert.equal((await csv).suggestedFilename(), "swift-photo-windows.csv");
  const cal = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Save observation to calendar" })
    .click();
  assert.equal((await cal).suggestedFilename(), "swift-observation.ics");
  await page.screenshot({ path: "outputs/swift-desktop.png", fullPage: true });
  await page
    .getByLabel("Observing location", { exact: true })
    .selectOption("9");
  await page
    .getByRole("heading", { name: "No passes meet these conditions." })
    .waitFor();
  await page
    .getByRole("button", { name: "Data & sources", exact: true })
    .click();
  await page.getByLabel("Swift TLE · NORAD 28485").fill("1 28485\n2 28485");
  await page.getByRole("button", { name: "Validate & use TLE" }).click();
  assert.match(await page.getByRole("alert").innerText(), /69 characters/);
  await page.getByLabel("Nominal reentry · UTC").fill("2026-11-04T09:30");
  await page.getByRole("button", { name: "Add manual forecast" }).click();
  assert.ok(
    (await page.locator(".forecast-cards").innerText()).includes("MANUAL"),
  );
  await page.getByRole("button", { name: "Clear manual forecasts" }).click();
  await page
    .getByRole("button", { name: "Observation planner", exact: true })
    .click();
  await page
    .getByLabel("Observing location", { exact: true })
    .selectOption("0");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "outputs/swift-mobile.png", fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile horizontal overflow",
  );
  await page.screenshot({ path: "outputs/swift-mobile.png", fullPage: true });
  console.log(
    JSON.stringify({
      errors,
      checks:
        "map, pass selection, CSV, calendar, latitude exclusion, invalid TLE, manual forecast, mobile layout",
    }),
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
