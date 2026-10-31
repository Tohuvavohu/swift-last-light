"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { parsePublishedData } from "./published-data";
import {
  findPasses,
  compass,
  makeSampler,
  parseTLE,
  photoPeak,
  passesAtTime,
  visibleSeconds,
  type Elements,
  type Observer,
  type Pass,
  type Settings,
} from "./orbit";
import {
  aerospaceSnapshot,
  normalizeForecast,
  mergeForecasts,
  snapshotElements,
  utc,
  type Forecast,
  type ProviderResult,
} from "./sources";
export const PLACES: Observer[] = [
  { name: "Honolulu, Hawaiʻi", lat: 21.3069, lon: -157.8583, height: 10 },
  { name: "Key West, Florida", lat: 24.5551, lon: -81.78, height: 3 },
  { name: "San Juan, Puerto Rico", lat: 18.4655, lon: -66.1057, height: 10 },
  { name: "Mexico City, Mexico", lat: 19.4326, lon: -99.1332, height: 2240 },
  { name: "Cairns, Australia", lat: -16.9186, lon: 145.7781, height: 10 },
  { name: "Singapore", lat: 1.3521, lon: 103.8198, height: 15 },
  { name: "Bengaluru, India", lat: 12.9716, lon: 77.5946, height: 920 },
  { name: "Rio de Janeiro, Brazil", lat: -22.9068, lon: -43.1729, height: 10 },
  { name: "Nairobi, Kenya", lat: -1.2921, lon: 36.8219, height: 1795 },
  {
    name: "San Francisco, California",
    lat: 37.7749,
    lon: -122.4194,
    height: 20,
  },
];
const PLACE_ZONES = [
  "Pacific/Honolulu",
  "America/New_York",
  "America/Puerto_Rico",
  "America/Mexico_City",
  "Australia/Brisbane",
  "Asia/Singapore",
  "Asia/Kolkata",
  "America/Sao_Paulo",
  "Africa/Nairobi",
  "America/Los_Angeles",
];
PLACES.forEach((place, i) => {
  place.timezone = PLACE_ZONES[i];
});
export function validTimezone(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return;
  }
}
export const fmt = (value: number | string, zone = "UTC", full = false) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    ...(full ? { month: "short", day: "2-digit" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    second: full ? undefined : "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
export const dateLabel = (value: number | string, zone = "UTC") =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
export const duration = (seconds: number) =>
  `${Math.floor(Math.round(seconds) / 60)}m ${Math.round(seconds) % 60}s`;
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function read(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
export function download(
  filename: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function usePlanner() {
  const [now, setNow] = useState(0),
    [elements, setElements] = useState<Elements | null>(null),
    [observer, setObserver] = useState<Observer>(PLACES[0]),
    [example, setExample] = useState(true);
  const [settings, setSettings] = useState<Settings>({
    minimum: 10,
    darkness: -6,
    hours: 24,
    start: 0,
    allowStale: false,
  });
  const [liveSearch, setLiveSearch] = useState(true),
    [deviceZone, setDeviceZone] = useState("UTC"),
    [locating, setLocating] = useState(false),
    [locationError, setLocationError] = useState("");
  const [forecasts, setForecasts] = useState<Forecast[]>([aerospaceSnapshot]),
    [custom, setCustom] = useState<Forecast[]>([]),
    [errors, setErrors] = useState<ProviderResult["errors"]>([]),
    [tleError, setTleError] = useState("");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [computing, setComputing] = useState(false),
    [result, setResult] = useState<ReturnType<typeof findPasses> | null>(null),
    [selectedId, setSelectedId] = useState<number | null>(null);
  const [offset, setOffset] = useState(0),
    [anchor, setAnchor] = useState<number | null>(null),
    [notice, setNotice] = useState("");
  const manual = useRef(false),
    version = useRef(0),
    forecastVersion = useRef(0);
  async function refresh(replaceManual = false) {
    const seq = ++version.current,
      forecastSeq = ++forecastVersion.current;
    setBusy(true);
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}data/latest.json`,
        {
          signal: AbortSignal.timeout(20000),
          cache: "no-cache",
        },
      );
      if (!response.ok)
        throw Error(`Published data unavailable (HTTP ${response.status}).`);
      const data = parsePublishedData(await response.json());
      if (forecastSeq !== forecastVersion.current) return;
      if (seq === version.current && (!manual.current || replaceManual)) {
        setElements(data.tle);
        save("swift-elements", data.tle);
        manual.current = false;
        setTleError(data.tle.refreshError || "");
      }
      setForecasts((previous) => {
        const next = mergeForecasts(previous, data.forecasts);
        save("swift-forecasts", next);
        return next;
      });
      setErrors(data.errors);
      setPublishedAt(data.checkedAt);
      save("swift-published-at", data.checkedAt);
    } catch (e) {
      if (forecastSeq !== forecastVersion.current) return;
      const message =
        e instanceof Error ? e.message : "Published data unavailable.";
      if (seq === version.current) setTleError(message);
      setForecasts((previous) => {
        const next = mergeForecasts(previous, []);
        save("swift-forecasts", next);
        return next;
      });
      setErrors([{ source: "Published data", message }]);
    } finally {
      if (forecastSeq === forecastVersion.current) setBusy(false);
    }
  }

  useEffect(() => {
    const time = Date.now();
    setNow(time);
    setDeviceZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setSettings((s) => ({ ...s, start: time }));
    try {
      const checked = read("swift-published-at");
      if (checked) setPublishedAt(utc(checked));
    } catch {}
    const stored = read("swift-elements");
    try {
      setElements(
        stored
          ? {
              ...parseTLE(`${stored.line1}\n${stored.line2}`, stored.source),
              fetchedAt: utc(stored.fetchedAt),
              snapshot: true,
            }
          : snapshotElements(),
      );
    } catch {
      setElements(snapshotElements());
    }
    const cached = read("swift-forecasts");
    if (Array.isArray(cached)) {
      try {
        setForecasts(
          cached.map((x) => ({
            ...normalizeForecast(x),
            status: "snapshot",
            fetchedAt: utc(x.fetchedAt),
          })),
        );
      } catch {}
    }
    const imported = read("swift-custom");
    if (Array.isArray(imported)) {
      try {
        setCustom(
          imported.map((x) => ({
            ...normalizeForecast(x),
            fetchedAt: utc(x.fetchedAt),
          })),
        );
      } catch {}
    }
    const query = new URLSearchParams(location.hash.slice(1)),
      saved = read("swift-observer");
    const lat = query.has("lat") ? Number(query.get("lat")) : saved?.lat,
      lon = query.has("lon") ? Number(query.get("lon")) : saved?.lon;
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    ) {
      setObserver({
        name: query.has("lat") ? "Shared location" : String(saved.name),
        lat,
        lon,
        height: Number.isFinite(saved?.height) ? saved.height : 0,
        timezone: query.has("lat") ? undefined : validTimezone(saved?.timezone),
      });
      setExample(false);
    }
    void refresh();
    const timer = setInterval(() => setNow(Date.now()), 30000),
      feedTimer = setInterval(() => void refresh(), 900000);
    const onReturn = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      clearInterval(timer);
      clearInterval(feedTimer);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, []);
  const allForecasts = useMemo(
    () => [
      ...forecasts.filter((f) => !custom.some((c) => c.id === f.id)),
      ...custom,
    ],
    [forecasts, custom],
  );
  const earliest = useMemo(() => {
    const t = allForecasts.flatMap((f) =>
      f.earliest ? [Date.parse(f.earliest)] : [],
    );
    return t.length ? Math.min(...t) : undefined;
  }, [allForecasts]);
  const searchStart = liveSearch
    ? Math.max(settings.start, Math.floor(now / 60000) * 60000)
    : settings.start;
  useEffect(() => {
    if (!elements || !settings.start) return;
    let cancelled = false;
    setComputing(true);
    const timer = setTimeout(() => {
      try {
        const next = findPasses(
          elements,
          observer,
          { ...settings, start: searchStart },
          earliest,
        );
        if (!cancelled) {
          setResult(next);
        }
      } catch (e) {
        if (!cancelled) {
          setResult(null);
          setNotice(String(e));
        }
      } finally {
        if (!cancelled) setComputing(false);
      }
    }, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [elements, observer, settings, earliest, searchStart]);
  useEffect(() => {
    setSelectedId(null);
    setAnchor(null);
    setOffset(0);
  }, [elements, observer, settings]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(t);
  }, [notice]);
  const passes = passesAtTime(result?.passes || [], now, liveSearch),
    visible = passes.filter((p) => visibleSeconds(p) >= 10),
    selected =
      passes.find((p) => p.id === selectedId) ||
      visible[0] ||
      passes[0] ||
      null;
  useEffect(() => {
    if (selectedId && !passes.some((p) => p.id === selectedId)) {
      setSelectedId(null);
      setAnchor(null);
      setOffset(0);
    }
  }, [selectedId, result, now, liveSearch]);
  const mapTime = (anchor ?? now) + offset * 60000,
    age = elements && now ? (now - Date.parse(elements.epoch)) / 3600000 : 0;
  const usable =
    !!elements &&
    Math.abs(mapTime - Date.parse(elements.epoch)) <=
      (settings.allowStale ? 96 : 24) * 3600000;
  const point = useMemo(
    () =>
      elements && usable ? makeSampler(elements, observer)(mapTime) : null,
    [elements, observer, mapTime, usable],
  );
  function chooseLocation(next: Observer) {
    setObserver(next);
    setExample(false);
    setLocationError("");
    save("swift-observer", next);
  }
  function geolocate() {
    if (!navigator.geolocation)
      return setLocationError(
        "Geolocation unavailable. Search for a city, use coordinates, or click the map.",
      );
    setLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        chooseLocation({
          name: "My location",
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          height: p.coords.altitude || 0,
        });
      },
      () => {
        setLocating(false);
        setLocationError(
          "Location access unavailable. Search for a city, enter coordinates, or click the map.",
        );
      },
      { timeout: 10000 },
    );
  }
  function coordinate(key: "lat" | "lon" | "height", value: string) {
    const n = Number(value),
      limit = key === "lat" ? 90 : key === "lon" ? 180 : 9000;
    if (
      !value.trim() ||
      !Number.isFinite(n) ||
      Math.abs(n) > limit ||
      (key === "height" && n < -500)
    )
      return setNotice("Enter valid coordinates or height.");
    chooseLocation({
      ...observer,
      name: "Custom location",
      timezone: key === "height" ? observer.timezone : undefined,
      [key]: n,
    });
  }
  function installTLE(text: string, source = "Manual TLE") {
    const next = parseTLE(text, source);
    ++version.current;
    manual.current = true;
    setBusy(false);
    setElements(next);
    save("swift-elements", next);
    setTleError("");
    setNotice("Orbital elements updated. Passes recalculated.");
  }
  function importForecasts(text: string) {
    const d = JSON.parse(text),
      values: Forecast[] = (Array.isArray(d) ? d : [d]).map(normalizeForecast);
    const next = [
      ...custom.filter((f) => !values.some((v) => v.id === f.id)),
      ...values,
    ];
    setCustom(next);
    save("swift-custom", next);
    setNotice(`${values.length} forecast(s) imported.`);
  }
  function clearCustom() {
    setCustom([]);
    save("swift-custom", []);
  }
  async function share() {
    const url = new URL(location.href);
    url.hash = new URLSearchParams({
      lat: observer.lat.toFixed(5),
      lon: observer.lon.toFixed(5),
    }).toString();
    try {
      await navigator.clipboard.writeText(url.href);
      setNotice("Location link copied.");
    } catch {
      history.replaceState(null, "", url);
      setNotice("Location added to the address bar. Copy the URL to share.");
    }
  }
  function exportCSV() {
    const rows = [
      [
        "location",
        "latitude",
        "longitude",
        "window_start_utc",
        "window_end_utc",
        "peak_utc",
        "max_visible_elevation_deg",
        "peak_azimuth_deg",
        "peak_range_km",
        "tle_epoch",
        "tle_age_hours",
        "overlaps_reentry_window",
      ],
    ];
    for (const p of passesAtTime(visible, Date.now(), liveSearch))
      for (const w of p.windows)
        rows.push(
          [
            observer.name,
            observer.lat,
            observer.lon,
            new Date(w.start.time).toISOString(),
            new Date(w.end.time).toISOString(),
            new Date(w.peak.time).toISOString(),
            w.peak.elevation.toFixed(2),
            w.peak.azimuth.toFixed(2),
            w.peak.range.toFixed(1),
            elements!.epoch,
            p.ageHours.toFixed(2),
            p.conditional,
          ].map(String),
        );
    download(
      "swift-photo-windows.csv",
      rows
        .map((r) =>
          r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(","),
        )
        .join("\r\n"),
      "text/csv",
    );
  }
  function exportCalendar(p: Pass) {
    const windows = p.windows.filter((w) => w.end.time > Date.now());
    if (!windows.length)
      return setNotice(
        "This observing window has ended. Choose an upcoming pass.",
      );
    const stamp = (t: number) =>
      new Date(t)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z/, "Z");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Swift Last Light//EN",
    ];
    for (const w of windows)
      lines.push(
        "BEGIN:VEVENT",
        `UID:swift-${Math.round(w.start.time)}@lastlight`,
        `DTSTAMP:${stamp(Date.now())}`,
        `DTSTART:${stamp(w.start.time)}`,
        `DTEND:${stamp(w.end.time)}`,
        "SUMMARY:Photograph Swift - refresh TLE before observing",
        `DESCRIPTION:Look ${compass(w.start.azimuth)} to ${compass(w.end.azimuth)}. Peak ${w.peak.elevation.toFixed(0)} deg. TLE ${elements?.epoch}. Refresh before observing. Brightness and weather not modeled.`,
        `GEO:${observer.lat};${observer.lon}`,
        "END:VEVENT",
      );
    lines.push("END:VCALENDAR");
    download(
      "swift-observation.ics",
      lines.map((line) => line.match(/.{1,73}/g)!.join("\r\n ")).join("\r\n") +
        "\r\n",
      "text/calendar",
    );
  }
  function select(p: Pass) {
    setSelectedId(p.id);
    setAnchor(photoPeak(p).time);
    setOffset(0);
  }
  function live() {
    setAnchor(null);
    setOffset(0);
    setSelectedId(null);
    setNow(Date.now());
  }
  function searchFromNow() {
    const time = Date.now();
    setNow(time);
    setLiveSearch(true);
    setSettings((s) => ({ ...s, start: time }));
  }
  return {
    now,
    elements,
    observer,
    example,
    locating,
    locationError,
    deviceZone,
    liveSearch,
    searchStart,
    searchFromNow,
    settings,
    update: (s: Partial<Settings>) => {
      if (s.start !== undefined) setLiveSearch(false);
      setSettings((v) => ({ ...v, ...s }));
    },
    allForecasts,
    publishedAt,
    custom,
    errors,
    tleError,
    busy,
    computing,
    result,
    passes,
    visible,
    selected,
    selectedId,
    offset,
    setOffset,
    anchor,
    mapTime,
    age,
    usable,
    point,
    notice,
    setNotice,
    refresh,
    chooseLocation,
    coordinate,
    geolocate,
    installTLE,
    importForecasts,
    clearCustom,
    share,
    exportCSV,
    exportCalendar,
    select,
    live,
  };
}
export type Planner = ReturnType<typeof usePlanner>;
