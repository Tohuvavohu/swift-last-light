import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getElements, getForecasts } from "../lib/sources";
import {
  assemblePublishedData,
  initialPublishedData,
  parsePublishedData,
  publicationStatus,
} from "../lib/published-data";

const directory = resolve("public/data");
const file = resolve(directory, "latest.json");
let previous = initialPublishedData();
try {
  previous = parsePublishedData(JSON.parse(await readFile(file, "utf8")));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

// Pages is the durable last-successful store between Actions runs. A missing
// file is normal for the first deployment; other errors stop publication so a
// temporary outage cannot overwrite the site with an obsolete bundled seed.
if (process.env.PREVIOUS_DATA_URL) {
  const url = new URL(process.env.PREVIOUS_DATA_URL);
  if (url.protocol !== "https:")
    throw Error("Previous deployment must use HTTPS.");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    cache: "no-cache",
  });
  if (response.status !== 404) {
    if (!response.ok)
      throw Error(
        `Cannot recover previous publication: HTTP ${response.status}`,
      );
    const text = await response.text();
    if (text.length > 1000000)
      throw Error("Previous publication is too large.");
    const published = parsePublishedData(JSON.parse(text));
    if (Date.parse(published.checkedAt) >= Date.parse(previous.checkedAt))
      previous = published;
  }
}

const [orbit, predictions] = await Promise.allSettled([
  getElements(),
  getForecasts(),
]);
const data = assemblePublishedData(
  previous,
  orbit,
  predictions,
  new Date().toISOString(),
);
const status = publicationStatus(data);
await mkdir(directory, { recursive: true });
for (const [name, value] of [
  ["latest.json", data],
  ["status.json", status],
] as const) {
  const target = resolve(directory, name);
  await writeFile(`${target}.tmp`, JSON.stringify(value, null, 2) + "\n");
  await rename(`${target}.tmp`, target);
}
console.log(
  `Source check ${data.checkedAt}: ${status.status}; TLE epoch ${data.tle.epoch}; ${data.forecasts.length} forecasts.`,
);
for (const error of data.errors)
  console.warn(`${error.source}: ${error.message}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(
    process.env.GITHUB_STEP_SUMMARY,
    `### Source update\n\nStatus: **${status.status}**\n\nChecked: ${data.checkedAt}\n\nTLE epoch: ${data.tle.epoch}\n\n${data.errors.map((e) => `- ${e.source}: ${e.message}`).join("\n")}\n\nPrevious successful values retain their original timestamps.\n`,
    { flag: "a" },
  );
}
