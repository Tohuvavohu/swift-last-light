"use client";
import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Camera,
  Check,
  Clock3,
  Eye,
  Info,
  LocateFixed,
  MapPin,
  Moon,
  Orbit,
  Radio,
  RefreshCw,
  Satellite,
  Settings2,
  Sun,
  X,
} from "lucide-react";
import OrbitMap from "@/components/orbit-map";
import SkyChart from "@/components/sky-chart";
import { DataPanel, Forecasts } from "@/components/data-panel";
import { compass, photoPeak, visibleSeconds } from "@/lib/orbit";
import {
  dateLabel,
  duration,
  fmt,
  PLACES,
  usePlanner,
  type Planner,
} from "@/lib/planner";

export default function Home() {
  const p = usePlanner(),
    [tab, setTab] = useState("planner"),
    [help, setHelp] = useState(false);
  return (
    <div className="app">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("planner");
          }}
        >
          <span className="brand-symbol">
            <Orbit size={25} />
          </span>
          <span>
            SWIFT<span className="brand-sub">LAST LIGHT</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className={tab === "planner" ? "active" : ""}
            onClick={() => setTab("planner")}
          >
            Observation planner
          </button>
          <button
            className={tab === "sources" ? "active" : ""}
            onClick={() => setTab("sources")}
          >
            Data & sources
          </button>
        </nav>
        <div className="header-end">
          <span className="catalog">
            <span className="status-dot" />
            NORAD 28485
          </span>
          <button
            className="icon-button"
            aria-label="How this planner works"
            onClick={() => setHelp(true)}
          >
            <Info size={18} />
          </button>
        </div>
      </header>
      <div className="intro">
        <div>
          <div className="eyebrow">
            NEIL GEHRELS SWIFT OBSERVATORY <span className="slash">/</span> 2004
            — 2026
          </div>
          <h1>Catch the last light.</h1>
          <p>Find a sunlit pass. Choose your spot. Bring your camera.</p>
        </div>
        <div className="intro-action">
          <span className="subtle">
            {p.now ? dateLabel(p.now) : "Loading"} · UTC
          </span>
          <button
            className="button secondary"
            disabled={p.busy}
            onClick={() => void p.refresh(true)}
          >
            <RefreshCw size={15} className={p.busy ? "spinning" : ""} />
            {p.busy ? "Refreshing sources" : "Refresh live data"}
          </button>
        </div>
      </div>
      <div className="mission-strip">
        <span className="pill amber">
          <Radio size={13} />
          REENTRY WATCH
        </span>
        <p>
          Swift is descending. Refresh orbital elements before heading out; pass
          timing can shift rapidly.
        </p>
        <button
          onClick={() =>
            document
              .getElementById("forecasts")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          Compare forecasts <ArrowRight size={14} />
        </button>
      </div>
      {p.elements &&
        (p.age > 12 || p.age < -1 || p.elements.snapshot || p.tleError) && (
          <div className="data-alert">
            <Info size={16} />
            <span>
              <strong>
                {p.elements.snapshot
                  ? "Saved orbital snapshot. "
                  : p.age < -1
                    ? "Orbit epoch is in the future. "
                    : p.age > 24
                      ? "Stale orbit. "
                      : p.age > 12
                        ? "Orbit is aging. "
                        : "Refresh unavailable. "}
              </strong>
              TLE epoch {fmt(p.elements.epoch, "UTC", true)} UTC (
              {p.age.toFixed(1)} h old). {p.tleError}{" "}
              {p.age > 24
                ? "Normal predictions stop 24 h after epoch. Refresh or enable exploratory mode."
                : "Short-term estimates only; verify again before observing."}
            </span>
          </div>
        )}
      {tab === "sources" ? (
        <DataPanel p={p} />
      ) : (
        <>
          <section className="workspace">
            <Controls p={p} />
            <div className="map-column">
              {p.elements && p.now ? (
                <OrbitMap
                  elements={p.elements}
                  observer={p.observer}
                  time={p.mapTime}
                  minimum={p.settings.minimum}
                  darkness={p.settings.darkness}
                  pass={p.selectedId ? p.selected : null}
                  onLocation={(lat, lon) =>
                    p.chooseLocation({
                      name: "Map location",
                      lat,
                      lon,
                      height: 0,
                    })
                  }
                  usable={p.usable}
                />
              ) : (
                <div className="map-shell loading">
                  Acquiring Swift’s orbit…
                </div>
              )}
              <div className="map-time">
                <div>
                  <span className="eyebrow">
                    {p.anchor || p.offset ? "PREVIEW TIME" : "CURRENT TIME"}
                  </span>
                  <strong>
                    {p.mapTime ? fmt(p.mapTime) : "—"} <span>UTC</span>
                  </strong>
                  <span className="small muted">
                    {p.mapTime ? dateLabel(p.mapTime) : ""}
                  </span>
                </div>
                <div className="time-scrub">
                  <input
                    aria-label="Map time offset in minutes"
                    type="range"
                    min="-90"
                    max="180"
                    step="1"
                    value={p.offset}
                    onChange={(e) => p.setOffset(+e.target.value)}
                  />
                  <div className="range-labels">
                    <span>−90 min</span>
                    <span>
                      {p.offset >= 0 ? "+" : ""}
                      {p.offset} min
                    </span>
                    <span>+180 min</span>
                  </div>
                </div>
                <button className="button secondary compact" onClick={p.live}>
                  <Radio size={14} />
                  Now
                </button>
              </div>
              <div className="telemetry">
                <div>
                  <span>
                    <Satellite size={14} />
                    ALTITUDE
                  </span>
                  <strong>
                    {p.point ? p.point.altitude.toFixed(0) : "—"}{" "}
                    <small>km</small>
                  </strong>
                </div>
                <div>
                  <span>
                    <Sun size={14} />
                    ILLUMINATION
                  </span>
                  <strong
                    className={p.point?.light === "sunlit" ? "gold-text" : ""}
                  >
                    {p.point
                      ? p.point.light === "sunlit"
                        ? "Sunlit"
                        : p.point.light === "umbra"
                          ? "In shadow"
                          : "Partial shadow"
                      : "Unknown"}
                  </strong>
                </div>
                <div>
                  <span>
                    <Eye size={14} />
                    YOUR ELEVATION
                  </span>
                  <strong>
                    {p.point ? p.point.elevation.toFixed(1) : "—"}
                    <small>°</small>
                  </strong>
                </div>
                <div>
                  <span>
                    <Moon size={14} />
                    YOUR SUN ALTITUDE
                  </span>
                  <strong>
                    {p.point ? p.point.sunAltitude.toFixed(1) : "—"}
                    <small>°</small>
                  </strong>
                </div>
              </div>
            </div>
          </section>
          <Passes p={p} />
        </>
      )}
      <Forecasts p={p} />
      <footer>
        <span>
          <Orbit size={17} />
          SWIFT · LAST LIGHT
        </span>
        <p>
          SGP4 orbital propagation · Sun / Earth shadow geometry · Built for the
          last photograph.
        </p>
        <button className="text-button" onClick={() => setHelp(true)}>
          Method & limitations <ArrowRight size={14} />
        </button>
      </footer>
      {p.notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {p.notice}
        </div>
      )}
      {help && <Method close={() => setHelp(false)} />}
    </div>
  );
}

function Controls({ p }: { p: Planner }) {
  return (
    <aside className="planner-panel">
      <div className="panel-title">
        <span>
          <MapPin size={16} />
          YOUR OBSERVING SPOT
        </span>
        <button
          className="icon-button"
          onClick={p.geolocate}
          aria-label="Use my location"
          title="Use my location"
        >
          <LocateFixed size={17} />
        </button>
      </div>
      <label className="field">
        Location
        <select
          aria-label="Observing location"
          value={PLACES.findIndex((v) => v.name === p.observer.name)}
          onChange={(e) => {
            const v = PLACES[+e.target.value];
            if (v) p.chooseLocation(v);
          }}
        >
          <option value={-1}>{p.observer.name}</option>
          {PLACES.map((v, i) => (
            <option key={v.name} value={i}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <span className="small muted">
        {p.example
          ? "Example location · choose yours or click the map"
          : "Click the map to compare another location"}
      </span>
      <div className="coordinate-fields">
        {(["lat", "lon"] as const).map((k) => (
          <label className="field" key={k}>
            {k === "lat" ? "Latitude" : "Longitude"}
            <input
              key={p.observer[k]}
              aria-label={k === "lat" ? "Latitude" : "Longitude"}
              type="number"
              step=".0001"
              min={k === "lat" ? -90 : -180}
              max={k === "lat" ? 90 : 180}
              defaultValue={p.observer[k].toFixed(4)}
              onBlur={(e) => p.coordinate(k, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </label>
        ))}
      </div>
      <label className="field horizontal">
        Height above sea level
        <input
          key={p.observer.height}
          aria-label="Observer height in meters"
          type="number"
          min="-500"
          max="9000"
          defaultValue={p.observer.height}
          onBlur={(e) => p.coordinate("height", e.target.value)}
        />
        <span className="muted">m</span>
      </label>
      <div className="divider" />
      <div className="panel-title">
        <span>
          <Settings2 size={16} />
          PHOTOGRAPHY CONDITIONS
        </span>
      </div>
      <label className="field slider-field">
        <span>
          Minimum elevation<strong>{p.settings.minimum}°</strong>
        </span>
        <input
          type="range"
          min="0"
          max="60"
          step="5"
          value={p.settings.minimum}
          onChange={(e) => p.update({ minimum: +e.target.value })}
        />
        <span className="range-labels">
          <span>Horizon</span>
          <span>Clearer sky</span>
        </span>
      </label>
      <label className="field">
        Sky darkness
        <select
          value={p.settings.darkness}
          onChange={(e) => p.update({ darkness: +e.target.value })}
        >
          <option value={-6}>Civil twilight · Sun below −6°</option>
          <option value={-12}>Nautical twilight · below −12°</option>
          <option value={-18}>Astronomical night · below −18°</option>
          <option value={0}>After sunset · below 0°</option>
        </select>
      </label>
      <div className="condition-note">
        <Sun size={16} />
        <span>Swift must also be in full sunlight.</span>
      </div>
      <div className="divider" />
      <div className="panel-title">
        <span>
          <Clock3 size={16} />
          SEARCH WINDOW
        </span>
        <button
          className="text-button"
          onClick={() => p.update({ start: Date.now() })}
        >
          From now
        </button>
      </div>
      <label className="field">
        Start time · UTC
        <input
          type="datetime-local"
          value={
            p.settings.start
              ? new Date(p.settings.start).toISOString().slice(0, 16)
              : ""
          }
          onChange={(e) => {
            const t = Date.parse(e.target.value + "Z");
            if (Number.isFinite(t)) p.update({ start: t });
          }}
        />
      </label>
      <div className="segmented">
        {[12, 24, 48, 72].map((h) => (
          <button
            key={h}
            className={p.settings.hours === h ? "chosen" : ""}
            onClick={() => p.update({ hours: h })}
          >
            {h}h
          </button>
        ))}
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={p.settings.allowStale}
          onChange={(e) => p.update({ allowStale: e.target.checked })}
        />
        <span>
          Explore beyond 24 h from TLE epoch
          <span className="muted small block">
            Highly uncertain near reentry. Limit: 96 h.
          </span>
        </span>
      </label>
      <button className="button share-button" onClick={p.share}>
        <MapPin size={14} />
        Copy location link
      </button>
    </aside>
  );
}

function Passes({ p }: { p: Planner }) {
  const [onlyVisible, setOnlyVisible] = useState(true),
    [zone, setZone] = useState("UTC"),
    shown = onlyVisible ? p.visible : p.passes,
    selected = p.selected,
    peak = selected ? photoPeak(selected) : null;
  return (
    <section className="passes-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">PLAN THE SHOT</div>
          <h2>
            Upcoming passes <span className="count">{p.visible.length}</span>
          </h2>
          <p>
            {p.observer.name} · {p.settings.minimum}° minimum elevation · Sun
            below {p.settings.darkness}°
          </p>
        </div>
        <div className="pass-actions">
          <label className="check-row">
            <input
              type="checkbox"
              checked={onlyVisible}
              onChange={(e) => setOnlyVisible(e.target.checked)}
            />
            Photo windows only
          </label>
          <select
            aria-label="Time display zone"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
          >
            <option value="UTC">UTC</option>
            <option
              value={
                typeof window !== "undefined"
                  ? Intl.DateTimeFormat().resolvedOptions().timeZone
                  : "Etc/UTC"
              }
            >
              My device time
            </option>
          </select>
          <button
            className="button secondary compact"
            disabled={!p.visible.length}
            onClick={p.exportCSV}
          >
            <ArrowDownToLine size={15} />
            CSV
          </button>
        </div>
      </div>
      {p.result?.reason && (
        <div className="inline-note">
          <Info size={15} />
          {p.result.reason}
        </div>
      )}
      {p.settings.allowStale && (
        <div className="inline-note warning">
          Exploratory propagation is enabled. Times beyond 24 h from epoch are
          not reliable observing appointments.
        </div>
      )}
      {p.computing ? (
        <div className="empty-state">
          <RefreshCw className="spinning" />
          <h3>Checking the sky above {p.observer.name}…</h3>
        </div>
      ) : !shown.length ? (
        <div className="empty-state">
          <Moon size={28} />
          <h3>
            {p.passes.length
              ? "No sunlit passes in a dark sky in this window."
              : "No passes meet these conditions."}
          </h3>
          <p>
            {Math.abs(p.observer.lat) > 32
              ? "This location is far from Swift’s low-inclination orbit. Try a location closer to the tropics."
              : "Try a lower elevation threshold, a different location, or a fresh TLE. Longer windows require exploratory mode."}
          </p>
          {!!p.passes.length && (
            <button
              className="text-button"
              onClick={() => setOnlyVisible(false)}
            >
              Show all {p.passes.length} geometric passes{" "}
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      ) : (
        <div className="pass-layout">
          <div className="pass-list">
            <div className="pass-table-head">
              <span>START · {zone === "UTC" ? "UTC" : "DEVICE"}</span>
              <span>MAX ELEV.</span>
              <span>PHOTO TIME</span>
              <span>LOOK TOWARD</span>
            </div>
            {shown.map((v) => {
              const w = v.windows[0],
                peak = photoPeak(v);
              return (
                <button
                  className={`pass-row ${selected?.id === v.id ? "selected" : ""}`}
                  key={v.id}
                  onClick={() => p.select(v)}
                >
                  <span>
                    <strong>{fmt(w?.start.time ?? v.start.time, zone)}</strong>
                    <small>{dateLabel(v.start.time, zone)}</small>
                    {v.conditional && <em>Reentry-window overlap</em>}
                    {Math.abs(v.ageHours) > 24 && (
                      <em>Exploratory · old TLE</em>
                    )}
                  </span>
                  <span>
                    <strong>{peak.elevation.toFixed(0)}°</strong>
                    <small>{w ? "visible peak" : "geometric peak"}</small>
                  </span>
                  <span>
                    <strong className={w ? "mint-text" : "muted"}>
                      {w ? duration(visibleSeconds(v)) : "None"}
                    </strong>
                    <small>
                      {w
                        ? `${v.windows.length} window(s)`
                        : "Daylight / shadow"}
                    </small>
                  </span>
                  <span>
                    <strong>
                      {compass(w?.start.azimuth ?? v.start.azimuth)} →{" "}
                      {compass(v.windows.at(-1)?.end.azimuth ?? v.end.azimuth)}
                    </strong>
                    <small>{peak.range.toFixed(0)} km at peak</small>
                  </span>
                </button>
              );
            })}
          </div>
          {selected && peak && (
            <div className="shot-card">
              <div className="panel-title">
                <span>
                  <Camera size={16} />
                  PASS DETAILS
                </span>
                <span className="pill mint">
                  {selected.windows.length ? "PHOTO WINDOW" : "GEOMETRIC"}
                </span>
              </div>
              <div className="shot-main">
                <SkyChart pass={selected} settings={p.settings} />
                <div>
                  <span className="eyebrow">
                    {selected.windows.length
                      ? "VISIBLE PEAK"
                      : "MAXIMUM ELEVATION"}
                  </span>
                  <strong className="peak-number">
                    {peak.elevation.toFixed(0)}
                    <span>°</span>
                  </strong>
                  <p>
                    {compass(peak.azimuth)} · {fmt(peak.time, zone)}
                  </p>
                  <span className="small muted">
                    Sky view · green is photographable
                  </span>
                </div>
              </div>
              <div className="shot-metrics">
                <span>
                  Angular speed
                  <strong>{peak.angularSpeed.toFixed(2)}°/s</strong>
                </span>
                <span>
                  Phase angle<strong>{peak.phase.toFixed(0)}°</strong>
                </span>
                <span>
                  TLE age at pass
                  <strong>{selected.ageHours.toFixed(1)} h</strong>
                </span>
              </div>
              {selected.windows.map((w, i) => (
                <div className="window-line" key={w.start.time}>
                  <span className="status-dot" />
                  <span>Window {i + 1}</span>
                  <strong>
                    {fmt(w.start.time, zone)} — {fmt(w.end.time, zone)}
                  </strong>
                </div>
              ))}
              <p className="shot-tip">
                Arrive early. Use manual focus at infinity and a wide field of
                view. Expect a moving point or trail; brightness and tumbling
                are not modeled.
              </p>
              <button
                className="button secondary"
                disabled={!selected.windows.length}
                onClick={() => p.exportCalendar(selected)}
              >
                <ArrowDownToLine size={14} />
                Save observation to calendar
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
function Method({ close }: { close: () => void }) {
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="method-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="icon-button modal-close"
          onClick={close}
          aria-label="Close method dialog"
        >
          <X />
        </button>
        <div className="eyebrow">KNOW WHAT YOU ARE LOOKING AT</div>
        <h2 id="method-title">A photography planner for a changing orbit.</h2>
        <p>
          Passes use{" "}
          <a
            href="https://github.com/shashwatak/satellite-js"
            target="_blank"
            rel="noreferrer"
          >
            satellite.js SGP4
          </a>{" "}
          and WGS-84 observer coordinates. Elevation and azimuth are geometric.
          Terrain, refraction, weather, light pollution, and brightness are not
          modeled.
        </p>
        <p>
          A photo window requires elevation above your threshold, the observer’s
          Sun below your darkness threshold, and the entire solar disk visible
          from Swift. Earth and Sun are spheres. Low-precision equatorial solar
          coordinates approximate the TEME frame; eclipse timings are planning
          estimates.
        </p>
        <p>
          Pass detection samples every 5 seconds and refines detected boundaries
          to about 0.25 seconds. Very short grazing passes can be missed.
          Numerical resolution is not timing accuracy. Atmospheric drag and
          changing attitude can make even fresh TLE predictions inaccurate near
          reentry.
        </p>
        <p>
          Normal searches stop 24 hours after the TLE epoch. Exploratory
          searches extend to at most 96 hours from epoch. Computation stops if
          SGP4 fails or modeled altitude falls below 80 km. That stop is not a
          physical reentry forecast.
        </p>
        <p>
          Passes overlapping the earliest forecast bound are conditional on
          Swift remaining in orbit. Forecast intervals can mean different things
          and are not averaged. Missing bounds mean uncertainty is unknown.
        </p>
        <p>
          The map’s green area approximates sea-level locations meeting the
          selected conditions at the preview time. The circle is geometric
          coverage, including daylight. Observer height is used in the pass
          table. Tracks show 45 minutes behind and 100 minutes ahead.
        </p>
        <p>
          “My device time” uses the browser timezone, not the observing
          location. Calendar exports use UTC. Refresh the elements shortly
          before observing and allow timing margin. Public feeds refresh every
          15 minutes while this page is open.
        </p>
        <button className="button primary" onClick={close}>
          Back to the sky <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
