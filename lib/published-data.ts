import { parseTLE, type Elements } from "./orbit";
import {
  aerospaceSnapshot,
  mergeForecasts,
  normalizeForecast,
  snapshotElements,
  SNAPSHOT_TIME,
  utc,
  type Forecast,
  type ProviderResult,
} from "./sources";

export type PublishedData = {
  schemaVersion: 1;
  checkedAt: string;
  tle: Elements;
  forecasts: Forecast[];
  errors: ProviderResult["errors"];
};

export function initialPublishedData(): PublishedData {
  return {
    schemaVersion: 1,
    checkedAt: SNAPSHOT_TIME,
    tle: snapshotElements(),
    forecasts: [aerospaceSnapshot],
    errors: [],
  };
}

// Validate files recovered from a previous deployment before trusting them.
export function parsePublishedData(input: unknown): PublishedData {
  if (!input || typeof input !== "object")
    throw Error("Published data is not an object.");
  const d = input as Record<string, unknown>;
  if (
    d.schemaVersion !== 1 ||
    !Array.isArray(d.forecasts) ||
    !Array.isArray(d.errors)
  )
    throw Error("Unsupported published data format.");
  const tle = d.tle as Elements | undefined;
  if (!tle || typeof tle.source !== "string")
    throw Error("Published orbit is missing.");
  const elements = parseTLE(`${tle.line1}\n${tle.line2}`, tle.source);
  return {
    schemaVersion: 1,
    checkedAt: utc(d.checkedAt),
    tle: {
      ...elements,
      fetchedAt: utc(tle.fetchedAt),
      snapshot: !!tle.snapshot,
      refreshError:
        typeof tle.refreshError === "string"
          ? tle.refreshError.slice(0, 500)
          : undefined,
    },
    forecasts: d.forecasts.map((value) => {
      const f = value as Forecast;
      if (!["live", "snapshot", "manual"].includes(f?.status))
        throw Error("Invalid forecast status.");
      return {
        ...normalizeForecast(f),
        fetchedAt: utc(f.fetchedAt),
        status: f.status,
      };
    }),
    errors: d.errors.map((value) => {
      const e = value as { source?: unknown; message?: unknown };
      if (typeof e?.source !== "string" || typeof e.message !== "string")
        throw Error("Invalid source notice.");
      return {
        source: e.source.slice(0, 120),
        message: e.message.slice(0, 500),
      };
    }),
  };
}

export function assemblePublishedData(
  previous: PublishedData,
  orbit: PromiseSettledResult<Elements>,
  predictions: PromiseSettledResult<ProviderResult>,
  checkedAt: string,
): PublishedData {
  const errors: PublishedData["errors"] = [];
  let tle = previous.tle;
  if (
    orbit.status === "fulfilled" &&
    Date.parse(orbit.value.epoch) >= Date.parse(previous.tle.epoch)
  ) {
    tle = orbit.value;
    if (tle.refreshError)
      errors.push({ source: "CelesTrak", message: tle.refreshError });
  } else {
    const message =
      orbit.status === "rejected"
        ? String(
            orbit.reason instanceof Error ? orbit.reason.message : orbit.reason,
          )
        : "Provider returned an older orbit; retaining the newer saved TLE.";
    errors.push({ source: "CelesTrak", message });
    tle = { ...previous.tle, snapshot: true, refreshError: message };
  }
  if (predictions.status === "fulfilled")
    errors.push(...predictions.value.errors);
  else
    errors.push({
      source: "Forecast feeds",
      message: String(
        predictions.reason instanceof Error
          ? predictions.reason.message
          : predictions.reason,
      ),
    });
  return {
    schemaVersion: 1,
    checkedAt: utc(checkedAt),
    tle,
    forecasts: mergeForecasts(
      previous.forecasts,
      predictions.status === "fulfilled" ? predictions.value.forecasts : [],
    ),
    errors,
  };
}

export function publicationStatus(data: PublishedData) {
  const ageHours =
    (Date.parse(data.checkedAt) - Date.parse(data.tle.epoch)) / 3600000;
  const usable = ageHours >= -1 && ageHours < 24;
  return {
    status: !usable
      ? "unavailable"
      : data.errors.length ||
          data.tle.snapshot ||
          !data.forecasts.length ||
          data.forecasts.some((f) => f.status === "snapshot")
        ? "degraded"
        : "healthy",
    checkedAt: data.checkedAt,
    note: "Static report from the last source check. Check checkedAt to detect delayed or stopped updates; HTTP 200 alone is not a health signal.",
    orbit: {
      epoch: data.tle.epoch,
      fetchedAt: data.tle.fetchedAt,
      ageHoursAtCheck: ageHours,
      usableAtCheck: usable,
      snapshot: !!data.tle.snapshot,
    },
    forecasts: data.forecasts.map(
      ({ source, status, fetchedAt, issuedAt, orbitEpoch }) => ({
        source,
        status,
        fetchedAt,
        issuedAt,
        orbitEpoch,
      }),
    ),
    errors: data.errors,
  };
}
