import { parseTLE } from "./orbit";

export const URLS = {
  celestrak:
    "https://celestrak.org/NORAD/elements/gp.php?CATNR=28485&FORMAT=TLE",
  aerospace: "https://aerospace.org/reentries/28485",
  michigan: "https://csem.engin.umich.edu/SWORD/swift/",
  michiganData: "https://csem.engin.umich.edu/SWORD/data/reentry/reentry.json",
  nasa: "https://ccmc.gsfc.nasa.gov/swift-challenge/index.php",
  spacetrack: "https://www.space-track.org/#decay",
};
export const SNAPSHOT_TLE =
  "SWIFT\n1 28485U 04047A   26304.44767149  .01372254  13072-2  97041-3 0  9992\n2 28485  20.5470 195.6831 0005005 286.9934  72.9973 16.15126897208442";
export const SNAPSHOT_TIME = "2026-10-31T19:04:00Z";
export const snapshotElements = () => ({
  ...parseTLE(SNAPSHOT_TLE, "CelesTrak · saved snapshot"),
  fetchedAt: SNAPSHOT_TIME,
  snapshot: true,
});
export type Forecast = {
  id: string;
  source: string;
  url: string;
  nominal: string;
  earliest?: string;
  latest?: string;
  confidence: string;
  issuedAt?: string;
  orbitEpoch?: string;
  fetchedAt: string;
  status: "live" | "snapshot" | "manual";
  note?: string;
};
export type ProviderResult = {
  forecasts: Forecast[];
  errors: { source: string; message: string }[];
  fetchedAt: string;
};
export const aerospaceSnapshot: Forecast = {
  id: "aerospace",
  source: "Aerospace · CORDS",
  url: URLS.aerospace,
  nominal: "2026-11-04T09:30:00Z",
  earliest: "2026-11-03T07:30:00Z",
  latest: "2026-11-05T11:30:00Z",
  confidence: "±26 hours · confidence not specified",
  orbitEpoch: "2026-10-30T00:37:05.834Z",
  fetchedAt: SNAPSHOT_TIME,
  status: "snapshot",
  note: "Verified page snapshot, Oct 31. Automated refresh may be blocked by the publisher.",
};

export function utc(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    throw Error("A valid date is required.");
  const text = value.trim().replace(" ", "T");
  const date = new Date(
    /(?:Z|[+-]\d{2}:\d{2})$/.test(text)
      ? text
      : text + (text.length === 10 ? "T00:00:00Z" : "Z"),
  );
  if (!Number.isFinite(date.getTime())) throw Error("Invalid UTC timestamp.");
  return date.toISOString();
}

export function normalizeForecast(input: unknown): Forecast {
  if (!input || typeof input !== "object")
    throw Error("Expected a forecast object or array.");
  const d = input as Record<string, unknown>;
  if (
    typeof d.source !== "string" ||
    !d.source.trim() ||
    typeof d.url !== "string"
  )
    throw Error("Each forecast needs a source, URL, and nominal timestamp.");
  const url = new URL(d.url);
  if (!["http:", "https:"].includes(url.protocol))
    throw Error("Source URLs must use HTTP or HTTPS.");
  for (const key of ["nominal", "earliest", "latest", "issuedAt"])
    if (
      d[key] !== undefined &&
      (typeof d[key] !== "string" ||
        !/(?:Z|[+-]\d{2}:\d{2})$/.test(d[key] as string))
    )
      throw Error(
        "Imported dates must include a timezone, for example 2026-11-04T09:30:00Z.",
      );
  const nominal = utc(d.nominal),
    earliest = d.earliest ? utc(d.earliest) : undefined,
    latest = d.latest ? utc(d.latest) : undefined;
  if (!!earliest !== !!latest)
    throw Error("Include both earliest and latest, or neither.");
  if (earliest && latest && !(earliest <= nominal && nominal <= latest))
    throw Error("The nominal date must lie inside the uncertainty window.");
  return {
    id: String(d.id || d.source).slice(0, 100),
    source: d.source.slice(0, 120),
    url: url.href,
    nominal,
    earliest,
    latest,
    confidence: String(d.confidence || "Uncertainty not specified").slice(
      0,
      180,
    ),
    issuedAt: d.issuedAt ? utc(d.issuedAt) : undefined,
    orbitEpoch: d.orbitEpoch ? utc(d.orbitEpoch) : undefined,
    fetchedAt: new Date().toISOString(),
    status: "manual",
    note: typeof d.note === "string" ? d.note.slice(0, 500) : undefined,
  };
}

export function parseMichigan(data: unknown): Forecast {
  const d = data as {
    reentry_utc?: Record<string, string>;
    run_date?: string;
    orbit_epoch_utc?: string;
  };
  const r = d?.reentry_utc;
  if (!r?.p50 || !r?.p05 || !r?.p95 || !d.run_date || !d.orbit_epoch_utc)
    throw Error(
      "Michigan feed schema changed or no median forecast is available.",
    );
  const result = normalizeForecast({
    id: "michigan",
    source: "Michigan · SWORD Track 1",
    url: URLS.michigan,
    nominal: utc(r.p50),
    earliest: utc(r.p05),
    latest: utc(r.p95),
    issuedAt: utc(d.run_date),
    orbitEpoch: utc(d.orbit_epoch_utc),
    confidence: "90% range · 5th–95th percentiles",
    note: "Ensemble median; reentry defined at 80 km. GMAT / NRLMSISE-00 with SWORD solar and geomagnetic forecasts.",
  });
  return { ...result, status: "live" };
}

export function parseAerospace(html: string): Forecast {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&plusmn;|&#177;/g, "±")
    .replace(/\s+/g, " ");
  const found = text.match(
    /Predicted Reentry Time\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{2}:\d{2}(?::\d{2})?)\s+UTC\s*±\s*([\d.]+)\s*(hours?|minutes?)/i,
  );
  if (!found)
    throw Error(
      "Publisher blocked automatic access or the page format changed. Open the source or import an update.",
    );
  const nominal = new Date(found[1] + " UTC").toISOString(),
    delta =
      +found[2] * (found[3].toLowerCase().startsWith("hour") ? 3600000 : 60000);
  const epoch = text.match(
    /Orbit Epoch\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+UTC/i,
  );
  return {
    id: "aerospace",
    source: "Aerospace · CORDS",
    url: URLS.aerospace,
    nominal,
    earliest: new Date(Date.parse(nominal) - delta).toISOString(),
    latest: new Date(Date.parse(nominal) + delta).toISOString(),
    confidence: `±${found[2]} ${found[3]} · confidence not specified`,
    orbitEpoch: epoch ? new Date(epoch[1] + " UTC").toISOString() : undefined,
    fetchedAt: new Date().toISOString(),
    status: "live",
  };
}

export async function fetchPublic(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: "application/json,text/plain,text/html",
      "User-Agent": "SwiftLastLight/1.0 (satellite observation planner)",
    },
    redirect: "manual",
  });
  if (!response.ok) throw Error(`Source returned HTTP ${response.status}.`);
  if (+(response.headers.get("content-length") || 0) > 8000000)
    throw Error("Source response is too large.");
  const text = await response.text();
  if (text.length > 8000000) throw Error("Source response is too large.");
  return text;
}

let tleCache: { time: number; value: ReturnType<typeof parseTLE> } | undefined;
let predictionCache: { time: number; value: ProviderResult } | undefined;
export async function getElements() {
  if (tleCache && Date.now() - tleCache.time < 15 * 60000)
    return tleCache.value;
  const value = parseTLE(await fetchPublic(URLS.celestrak), "CelesTrak");
  tleCache = { time: Date.now(), value };
  return value;
}
export async function getForecasts(): Promise<ProviderResult> {
  if (predictionCache && Date.now() - predictionCache.time < 15 * 60000)
    return predictionCache.value;
  const results = await Promise.allSettled([
    fetchPublic(URLS.michiganData).then((t) => parseMichigan(JSON.parse(t))),
    fetchPublic(URLS.aerospace).then(parseAerospace),
  ]);
  const forecasts: Forecast[] = [],
    errors: ProviderResult["errors"] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") forecasts.push(r.value);
    else {
      errors.push({
        source: i ? "Aerospace" : "Michigan",
        message:
          r.reason instanceof Error ? r.reason.message : "Source unavailable",
      });
      if (i) forecasts.push(aerospaceSnapshot);
    }
  });
  const value = { forecasts, errors, fetchedAt: new Date().toISOString() };
  predictionCache = { time: Date.now(), value };
  return value;
}
