"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, LocateFixed, MapPin, Search } from "lucide-react";
import { compass, type Observer } from "@/lib/orbit";
import {
  dateLabel,
  duration,
  fmt,
  validTimezone,
  type Planner,
} from "@/lib/planner";

const cityCache = new Map<string, Observer[]>();

export function LocationPicker({ p }: { p: Planner }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Observer[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function search(event: FormEvent) {
    event.preventDefault();
    const name = query.trim();
    if (name.length < 2) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSearching(true);
    setMessage("");
    setResults([]);
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      let found = cityCache.get(name.toLowerCase());
      if (!found) {
        const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
        url.search = new URLSearchParams({
          name,
          count: "6",
          language: "en",
          format: "json",
        }).toString();
        const response = await fetch(url, {
          signal: controller.signal,
          credentials: "omit",
        });
        if (!response.ok) throw Error("City search unavailable");
        const data = (await response.json()) as { results?: unknown };
        found = (Array.isArray(data.results) ? data.results : []).flatMap(
          (r: Record<string, unknown>) => {
            if (
              typeof r.name !== "string" ||
              typeof r.latitude !== "number" ||
              typeof r.longitude !== "number" ||
              !Number.isFinite(r.latitude) ||
              !Number.isFinite(r.longitude) ||
              Math.abs(r.latitude) > 90 ||
              Math.abs(r.longitude) > 180
            )
              return [];
            return [
              {
                name: [
                  ...new Set(
                    [r.name, r.admin1, r.country].filter(
                      (v) => typeof v === "string" && v,
                    ),
                  ),
                ].join(", "),
                lat: r.latitude,
                lon: r.longitude,
                height:
                  typeof r.elevation === "number" &&
                  Number.isFinite(r.elevation)
                    ? Math.max(-500, Math.min(9000, r.elevation))
                    : 0,
                timezone: validTimezone(r.timezone),
              },
            ];
          },
        );
        if (cityCache.size >= 20) cityCache.clear();
        cityCache.set(name.toLowerCase(), found!);
      }
      if (request.current !== controller) return;
      setResults(found!);
      if (!found!.length)
        setMessage(
          "No matching cities. Try a nearby city, coordinates, or the map.",
        );
    } catch {
      if (request.current === controller)
        setMessage(
          "City search unavailable. Use your location, a preset, coordinates, or the map.",
        );
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) setSearching(false);
    }
  }
  return (
    <section className="location-picker" aria-label="Choose observing location">
      <div className="location-picker-row">
        <div className="location-current">
          <MapPin size={17} />
          <div>
            <span className="eyebrow">
              {p.example ? "EXAMPLE LOCATION · CHOOSE YOURS" : "OBSERVING FROM"}
            </span>
            <strong>{p.observer.name}</strong>
            <span className="small muted">
              {p.observer.lat.toFixed(4)}°, {p.observer.lon.toFixed(4)}° ·{" "}
              {Math.round(p.observer.height)} m
            </span>
          </div>
        </div>
        <button
          className="button secondary"
          onClick={p.geolocate}
          disabled={p.locating}
        >
          <LocateFixed size={16} />
          {p.locating ? "Locating…" : "Use my location"}
        </button>
        <form
          className="city-search"
          onSubmit={search}
          role="search"
          aria-label="Find observing location"
        >
          <label className="sr-only" htmlFor="city-search">
            City or postal code
          </label>
          <input
            id="city-search"
            type="search"
            autoComplete="off"
            maxLength={120}
            placeholder="City or postal code"
            value={query}
            onChange={(e) => {
              request.current?.abort();
              request.current = null;
              setQuery(e.target.value);
              setResults([]);
              setMessage("");
              setSearching(false);
            }}
          />
          <button
            className="button secondary"
            type="submit"
            disabled={searching || query.trim().length < 2}
          >
            <Search size={15} />
            {searching ? "Searching…" : "Search"}
          </button>
        </form>
      </div>
      {p.locationError && (
        <p className="warning location-message" role="alert">
          {p.locationError}
        </p>
      )}
      {message && (
        <p className="location-message" role="status">
          {message}
        </p>
      )}
      {!!results.length && (
        <ul className="city-results" aria-label="Matching locations">
          {results.map((place) => (
            <li key={`${place.lat},${place.lon}`}>
              <button
                onClick={() => {
                  p.chooseLocation(place);
                  setResults([]);
                  setQuery("");
                  setMessage("");
                }}
              >
                <strong>{place.name}</strong>
                <span>
                  {place.lat.toFixed(3)}°, {place.lon.toFixed(3)}° ·{" "}
                  {place.timezone}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {(query || results.length > 0) && (
        <p className="location-credit">
          City searches use{" "}
          <a
            href="https://open-meteo.com/en/docs/geocoding-api"
            target="_blank"
            rel="noreferrer"
          >
            Open-Meteo
          </a>{" "}
          /{" "}
          <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
            GeoNames
          </a>
          . Coordinates and map selection also remain available below.
        </p>
      )}
    </section>
  );
}

export function ObservationBrief({ p }: { p: Planner }) {
  const pass = p.visible[0];
  const window = pass?.windows[0];
  const peak = window?.peak;
  const localZone = p.observer.timezone || p.deviceZone;
  const current =
    window && window.start.time <= p.now && window.end.time > p.now;
  const historical = window && window.end.time <= p.now;
  const unavailable = p.result && p.result.stop <= p.searchStart;
  return (
    <section
      className="observation-brief"
      aria-labelledby="observation-brief-title"
      aria-busy={p.computing}
    >
      <div className="observation-brief-heading">
        <div>
          <span className="eyebrow">
            {p.example ? "EXAMPLE SITE" : "YOUR OBSERVING PLAN"} ·{" "}
            {p.observer.name}
          </span>
          <h2 id="observation-brief-title">
            {p.computing
              ? "Calculating observing windows…"
              : window
                ? historical
                  ? "Window in your selected dates"
                  : current
                    ? "Observing window in progress"
                    : p.liveSearch
                      ? "Next observing opportunity"
                      : "First window in your search"
                : unavailable
                  ? "No window in the usable orbit interval"
                  : p.passes.length
                    ? "No sunlit pass in a dark sky"
                    : "No pass meets your elevation limit"}
          </h2>
        </div>
        {!p.computing && pass && (
          <button
            className="button primary"
            onClick={() => {
              p.select(pass);
              document
                .getElementById("passes")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            View sky track <ArrowRight size={15} />
          </button>
        )}
      </div>
      {!p.computing && window && peak && (
        <>
          <div className="opportunity-metrics">
            <div className="opportunity-time">
              <span>{current ? "WINDOW STARTED" : "WINDOW START"} · UTC</span>
              <strong>
                {fmt(window.start.time)}{" "}
                <small>{dateLabel(window.start.time)}</small>
              </strong>
              <p>
                {fmt(window.start.time, localZone)} ·{" "}
                {dateLabel(window.start.time, localZone)} ·{" "}
                {p.observer.timezone ? "Site" : "Device"}: {localZone}
              </p>
            </div>
            <div>
              <span>LOOK TOWARD</span>
              <strong>
                {compass(window.start.azimuth)} → {compass(window.end.azimuth)}
              </strong>
              <p>
                Start az {window.start.azimuth.toFixed(0)}° · el{" "}
                {window.start.elevation.toFixed(0)}°
              </p>
            </div>
            <div>
              <span>VISIBLE PEAK</span>
              <strong>
                {peak.elevation.toFixed(0)}°{" "}
                <small>{compass(peak.azimuth)}</small>
              </strong>
              <p>
                {fmt(peak.time)} UTC · {peak.range.toFixed(0)} km
              </p>
            </div>
            <div>
              <span>{current ? "TIME REMAINING" : "THIS WINDOW"}</span>
              <strong>
                {duration(
                  (window.end.time - (current ? p.now : window.start.time)) /
                    1000,
                )}
              </strong>
              <p>TLE age at pass {pass.ageHours.toFixed(1)} h</p>
            </div>
          </div>
          {pass.conditional && (
            <p className="warning small">
              Overlaps a reentry forecast window; conditional on Swift remaining
              in orbit.
            </p>
          )}
          {Math.abs(pass.ageHours) > 24 && (
            <p className="warning small">
              Exploratory propagation beyond 24 h from the TLE epoch. Refresh
              before making an observing plan.
            </p>
          )}
        </>
      )}
      {!p.computing && !window && (
        <p className="no-opportunity">
          {(unavailable ? p.result?.reason : null) ||
            (Math.abs(p.observer.lat) > 32 && !p.passes.length
              ? "Swift’s low-inclination orbit limits coverage at this latitude. No qualifying pass was found for this site and search interval."
              : p.passes.length
                ? "Geometric passes exist, but none meet both the sunlight and sky-darkness settings. Inspect all geometric passes below or adjust the conditions."
                : "Try another elevation limit or search interval. A newer TLE may extend the usable prediction window.")}
        </p>
      )}
      <p className="observing-caveat">
        Geometric opportunity, not a brightness prediction. Clouds, limiting
        magnitude, terrain and tumbling are not modeled. Check the sky and
        refresh the orbit before observing.
      </p>
      {p.result && (
        <p className="search-extent">
          {p.liveSearch ? "Rolling search" : "Fixed search"}:{" "}
          {fmt(p.searchStart, "UTC", true)} —{" "}
          {fmt(Math.max(p.searchStart, p.result.stop), "UTC", true)} UTC · ≥
          {p.settings.minimum}° elevation · Sun ≤{p.settings.darkness}°
        </p>
      )}
    </section>
  );
}
