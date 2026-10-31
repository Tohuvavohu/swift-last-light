"use client";
import { useState } from "react";
import { ArrowDownToLine, ChevronDown, ExternalLink, Info } from "lucide-react";
import { dateLabel, download, fmt, type Planner } from "@/lib/planner";
import { URLS, type Forecast } from "@/lib/sources";

export function DataPanel({ p }: { p: Planner }) {
  const [tle, setTle] = useState(""),
    [url, setUrl] = useState(""),
    [json, setJson] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const [source, setSource] = useState("Aerospace · CORDS"),
    [sourceUrl, setSourceUrl] = useState(URLS.aerospace),
    [nominal, setNominal] = useState(""),
    [early, setEarly] = useState(""),
    [late, setLate] = useState(""),
    [confidence, setConfidence] = useState("Uncertainty not specified");
  function action(fn: () => void) {
    try {
      fn();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function loadFeed() {
    setLoading(true);
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") throw Error("Use an HTTPS feed URL.");
      const r = await fetch(parsed, {
        signal: AbortSignal.timeout(15000),
        credentials: "omit",
      });
      if (!r.ok) throw Error(`HTTP ${r.status}`);
      const text = await r.text();
      if (text.length > 1000000) throw Error("Feed is too large.");
      if (/^1 28485/m.test(text)) p.installTLE(text, parsed.hostname);
      else p.importForecasts(text);
      setError("");
    } catch (e) {
      setError(
        `${String(e)}. The feed must allow browser access (CORS); otherwise paste its contents.`,
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="sources-workspace">
      <div className="source-editor">
        <div className="eyebrow">ORBIT INPUT</div>
        <h2>Keep the track current.</h2>
        <p>
          Live elements come from CelesTrak. Paste a newer Swift TLE from
          Space-Track or another trusted provider.
        </p>
        <div className="source-meta">
          <span>
            Source<strong>{p.elements?.source || "Loading"}</strong>
          </span>
          <span>
            Epoch · UTC
            <strong>
              {p.elements ? fmt(p.elements.epoch, "UTC", true) : "—"}
            </strong>
          </span>
          <span>
            Retrieved · UTC
            <strong>
              {p.elements ? fmt(p.elements.fetchedAt, "UTC", true) : "—"}
            </strong>
          </span>
        </div>
        <label className="field">
          Swift TLE · NORAD 28485
          <textarea
            rows={5}
            className="mono"
            value={tle}
            onChange={(e) => setTle(e.target.value)}
            placeholder={
              p.elements
                ? `SWIFT\n${p.elements.line1}\n${p.elements.line2}`
                : "Paste both TLE lines"
            }
          />
        </label>
        <div className="button-row">
          <button
            className="button primary"
            disabled={!tle.trim()}
            onClick={() => action(() => p.installTLE(tle))}
          >
            Validate & use TLE
          </button>
          <button
            className="button secondary"
            onClick={() =>
              p.elements &&
              download(
                "swift.tle",
                `SWIFT\n${p.elements.line1}\n${p.elements.line2}\n`,
                "text/plain",
              )
            }
          >
            Export TLE
          </button>
        </div>
        <p className="small muted">
          Checks NORAD ID, line length, checksum, epoch, and propagation. Saved
          data stays in this browser.
        </p>
        <div className="divider" />
        <h3>Connect another feed</h3>
        <p>
          Load a public HTTPS URL containing a Swift TLE or forecast JSON.
          Browser access (CORS) must be enabled by the provider.
        </p>
        <label className="field">
          Feed URL
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-provider.example/swift.json"
          />
        </label>
        <button
          className="button secondary"
          disabled={!url || loading}
          onClick={loadFeed}
        >
          {loading ? "Loading feed…" : "Load feed"}
        </button>
      </div>
      <div className="source-editor">
        <div className="eyebrow">REENTRY INPUT</div>
        <h2>Add a forecast.</h2>
        <p>
          Keep independent estimates separate. Enter uncertainty exactly as the
          provider describes it.
        </p>
        <div className="coordinate-fields">
          <label className="field">
            Provider
            <input value={source} onChange={(e) => setSource(e.target.value)} />
          </label>
          <label className="field">
            Source URL
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          Nominal reentry · UTC
          <input
            type="datetime-local"
            value={nominal}
            onChange={(e) => setNominal(e.target.value)}
          />
        </label>
        <div className="coordinate-fields">
          <label className="field">
            Earliest · UTC
            <input
              type="datetime-local"
              value={early}
              onChange={(e) => setEarly(e.target.value)}
            />
          </label>
          <label className="field">
            Latest · UTC
            <input
              type="datetime-local"
              value={late}
              onChange={(e) => setLate(e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          Uncertainty / confidence label
          <input
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
          />
        </label>
        <button
          className="button primary"
          disabled={!nominal}
          onClick={() =>
            action(() =>
              p.importForecasts(
                JSON.stringify({
                  id: source.startsWith("Aerospace") ? "aerospace" : source,
                  source,
                  url: sourceUrl,
                  nominal: nominal + "Z",
                  ...(early || late
                    ? { earliest: early + "Z", latest: late + "Z" }
                    : {}),
                  confidence,
                  note: "Manually entered; retrieval timestamp records entry time.",
                }),
              ),
            )
          }
        >
          Add manual forecast
        </button>
        <details className="json-import">
          <summary>
            JSON import & adapter schema <ChevronDown size={15} />
          </summary>
          <p className="small muted">
            One object or an array. Include both bounds or neither. Dates must
            include a timezone. Dates below illustrate the schema.
          </p>
          <pre>
            {
              '{\n  "source": "Provider name",\n  "url": "https://provider.example/swift",\n  "nominal": "2026-11-04T09:30:00Z",\n  "earliest": "2026-11-03T07:30:00Z",\n  "latest": "2026-11-05T11:30:00Z",\n  "confidence": "Provider-defined interval"\n}'
            }
          </pre>
          <label className="field">
            Forecast JSON
            <textarea
              rows={5}
              value={json}
              onChange={(e) => setJson(e.target.value)}
              placeholder="Paste provider forecast JSON"
            />
          </label>
          <button
            className="button secondary"
            disabled={!json}
            onClick={() => action(() => p.importForecasts(json))}
          >
            Import forecasts
          </button>
        </details>
        {!!p.custom.length && (
          <button
            className="text-button remove-imports"
            onClick={p.clearCustom}
          >
            Clear manual forecasts
          </button>
        )}
      </div>
      {error && (
        <div className="import-error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

export function Forecasts({ p }: { p: Planner }) {
  return (
    <section className="forecasts-section" id="forecasts">
      <div className="section-heading">
        <div>
          <div className="eyebrow">THE FINAL ORBITS</div>
          <h2>Reentry outlook</h2>
          <p>
            Independent predictions, with their own uncertainty. All times UTC.
          </p>
        </div>
        <button
          className="button secondary compact"
          onClick={() =>
            download(
              "swift-forecasts.json",
              JSON.stringify(p.allForecasts, null, 2),
            )
          }
        >
          <ArrowDownToLine size={15} />
          JSON
        </button>
      </div>
      <Timeline forecasts={p.allForecasts} now={p.now} />
      <div className="forecast-cards">
        {p.allForecasts.map((f) => (
          <article key={f.id} className="forecast-card">
            <div className="forecast-card-top">
              <a href={f.url} target="_blank" rel="noreferrer">
                {f.source}
                <ExternalLink size={13} />
              </a>
              <span
                className={`pill ${f.status === "live" ? "mint" : "amber"}`}
              >
                {f.status === "live"
                  ? "FETCHED"
                  : f.status === "snapshot"
                    ? "SNAPSHOT"
                    : "MANUAL"}
              </span>
            </div>
            <strong className="forecast-date">
              {fmt(f.nominal, "UTC", true)} <small>UTC</small>
            </strong>
            <span className="forecast-confidence">{f.confidence}</span>
            {f.earliest && (
              <p className="forecast-range">
                {fmt(f.earliest, "UTC", true)} — {fmt(f.latest!, "UTC", true)}{" "}
                UTC
              </p>
            )}
            <div className="forecast-stamps">
              {f.issuedAt && <span>Issued: {dateLabel(f.issuedAt)}</span>}
              {f.orbitEpoch && (
                <span>Orbit epoch: {fmt(f.orbitEpoch, "UTC", true)} UTC</span>
              )}
              <span>Retrieved: {fmt(f.fetchedAt, "UTC", true)} UTC</span>
            </div>
            {f.note && <p className="small muted">{f.note}</p>}
            {p.now > Date.parse(f.latest || f.nominal) && (
              <p className="warning small">
                Forecast date has passed. Verify current object status.
              </p>
            )}
          </article>
        ))}
      </div>
      {!!p.errors.length && (
        <details className="source-errors">
          <summary>
            <Info size={14} />
            {p.errors.length} source refresh notice
            {p.errors.length > 1 ? "s" : ""}
          </summary>
          {p.errors.map((e) => (
            <p key={e.source}>
              <strong>{e.source}:</strong> {e.message}
            </p>
          ))}
        </details>
      )}
      <div className="source-links">
        <span>More evidence</span>
        <a href={URLS.nasa} target="_blank" rel="noreferrer">
          NASA CCMC challenge <ExternalLink size={12} />
        </a>
        <a href={URLS.spacetrack} target="_blank" rel="noreferrer">
          Space-Track TIP / decay <ExternalLink size={12} />
        </a>
        <a href={URLS.celestrak} target="_blank" rel="noreferrer">
          CelesTrak TLE <ExternalLink size={12} />
        </a>
      </div>
      <p className="forecast-disclaimer">
        A reentry window is not an impact location. The map shows observing
        geometry, not a debris corridor. Forecasts are kept separate.
      </p>
    </section>
  );
}
function Timeline({ forecasts, now }: { forecasts: Forecast[]; now: number }) {
  if (!forecasts.length) return null;
  const times = forecasts.flatMap((f) => [
      Date.parse(f.earliest || f.nominal),
      Date.parse(f.latest || f.nominal),
    ]),
    min = Math.min(...times) - 21600000,
    max = Math.max(...times) + 21600000,
    pos = (t: number) => ((t - min) / (max - min)) * 100;
  return (
    <div className="forecast-timeline">
      <div className="timeline-axis">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} style={{ left: `${i * 25}%` }}>
            {fmt(min + ((max - min) * i) / 4, "UTC", true)}
          </span>
        ))}
      </div>
      {forecasts.map((f, i) => (
        <div className="timeline-row" key={f.id}>
          <span>{f.source.split(" · ")[0]}</span>
          <div className="timeline-rail">
            <div
              className={`timeline-band ${i % 2 ? "purple" : ""}`}
              style={{
                left: `${pos(Date.parse(f.earliest || f.nominal))}%`,
                width: `${Math.max(0.4, pos(Date.parse(f.latest || f.nominal)) - pos(Date.parse(f.earliest || f.nominal)))}%`,
              }}
            />
            <div
              className="timeline-point"
              style={{ left: `${pos(Date.parse(f.nominal))}%` }}
              title={`${f.source}: ${f.nominal}`}
            />
            {now >= min && now <= max && (
              <div
                className="timeline-now"
                style={{ left: `${pos(now)}%` }}
                title="Now"
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
