# Swift · Last Light

A ground-based photography planner for NASA's Neil Gehrels Swift Observatory (NORAD 28485). Built with React, Vite, Leaflet, satellite.js SGP4, and SunCalc. All observing calculations run in the browser. GitHub Pages serves the app and GitHub Actions publishes source updates.

[Open the planner](https://tohuvavohu.github.io/swift-last-light/) · [Source update workflow](https://github.com/Tohuvavohu/swift-last-light/actions/workflows/pages.yml)

## Run locally

Requires Node 22.13 or later.

```sh
npm ci
npm run data:update
npm run dev
```

Open http://localhost:5173. No account credentials or map API key are required for local use. Geolocation needs localhost or HTTPS. Run `agent-portal forward 5173` to open it through this session.

On this development host, `swift-watch-dev` is a persistent user service:

```sh
systemctl --user status swift-watch-dev
journalctl --user -u swift-watch-dev -n 50
systemctl --user restart swift-watch-dev
```

The app has no runtime server or account requirement. `npm run dev` serves the local files; `npm run data:update` refreshes the local data snapshot. The old server/API and Sites deployment scaffold have been removed.

```sh
npm test
npm run typecheck
npm run build
```

The optional browser check uses Playwright. Install its Chromium with `npx playwright install chromium`, start the development server, then run `node tests/browser.mjs`. Set `CHROMIUM_PATH` to use an already-installed compatible Chromium. Screenshots are written to ignored `outputs/`.

## GitHub Pages deployment

The repository uses **Settings → Pages → Source: GitHub Actions**. `.github/workflows/pages.yml` builds and publishes on pushes to `main`, manual runs, and at minutes 7, 22, 37 and 52 of each UTC hour. It runs the numerical tests, updates source data, builds with the Pages base path, and deploys the `dist/` artifact. Code pushes/manual runs also test the static build in Chromium; scheduled data-only updates skip the browser installation. Pull requests run checks without publishing.

The workflow uses the standard GitHub-provided token: read-only repository access for building, plus Pages deployment and OIDC permissions for publishing. No personal token, API secret, server, or automated source commits are required. Official actions are pinned to release commits.

Scheduled Actions are best-effort: [GitHub documents possible delays or dropped runs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), and public-repository schedules can be disabled after 60 days without activity. CDN caching can add delay. The displayed timestamps—not the nominal 15-minute schedule—determine freshness. Use **Actions → Publish Swift planner → Run workflow** for an operator-triggered upstream refresh. To stop automatic updates after the observing campaign, disable that workflow or remove its `schedule` trigger.

To verify the repository path locally:

```sh
PAGES_BASE_PATH=/swift-last-light/ npm run build
npx playwright install chromium
PAGES_BASE_PATH=/swift-last-light/ node tests/static-browser.mjs
```

`PAGES_BASE_PATH=/` supports a root/custom-domain site. The Pages workflow obtains the appropriate path from GitHub metadata. All data and logo URLs are relative to that base, and location-sharing hashes continue to work. Local development remains available at the root URL.

## Use

1. Choose **Refresh published data**. Inspect the last source-check timestamp, TLE epoch, and refresh notices. This reads the latest published JSON; it does not trigger a new upstream fetch.
2. Use the prominent location button, search for a city or postal code, choose a preset, type coordinates, or click the map. Honolulu is an explicitly labeled example, not an inferred user location. City searches are sent directly to Open-Meteo / GeoNames only when submitted; a denied location request has a persistent fallback message.
3. Select elevation, darkness, and search time. Normal searches stop 24 hours after the TLE epoch; longer propagation requires explicit exploratory mode.
4. The next-opportunity card gives UTC plus site-local time when known, initial direction/elevation, visible peak, duration, and orbit age. Select a pass to move the map to its visible peak. The full polar sky track, range, phase angle, angular speed, and technical controls remain visible.
5. Export photo windows as CSV or UTC calendar events. Recheck the TLE before observing.
6. Use **Data & sources** for manual TLEs, an HTTPS feed, or forecast imports. Settings/data are stored in this browser. Location links share latitude and longitude; they do not share imported forecasts or the orbit.

The default search rolls forward each minute and filters completed passes/windows on clock updates (every 30 seconds and on returning to the tab). Editing the start date switches to a fixed-date search, including historical passes. **From now** resumes the rolling search. Completed windows cannot be added to a calendar; fixed-date CSV exports still support historical analysis.

## Data sources and extension hooks

- Orbit source: [CelesTrak Swift TLE](https://celestrak.org/NORAD/elements/gp.php?CATNR=28485&FORMAT=TLE). Validates catalog number, checksums, epoch and propagation. Failed updates retain the last successful orbit and its original retrieval time, labeled as a snapshot.
- Forecast sources: independent [Michigan SWORD](https://csem.engin.umich.edu/SWORD/swift/) and [Aerospace CORDS](https://aerospace.org/reentries/28485) adapters. Each includes source URL, issue/orbit epoch when available, retrieval time and data status.
- Michigan's public [JSON feed](https://csem.engin.umich.edu/SWORD/data/reentry/reentry.json) supplies the ensemble median `p50` and 90% interval `p05`–`p95`. Its deterministic `center` run is deliberately not substituted for the median.
- Aerospace may return HTTP 403 to automated clients. The included, clearly labeled snapshot was checked on October 31, 2026: November 4 at 09:30 UTC ±26 h, based on the October 30 orbit epoch. Open the source and enter a manual update if automatic refresh is blocked. No challenge bypass is attempted.
- [NASA CCMC Swift challenge](https://ccmc.gsfc.nasa.gov/swift-challenge/index.php) and [Space-Track TIP / decay](https://www.space-track.org/#decay) are linked for further evidence. They are not represented as connected live feeds. Space-Track credentials are not collected.

`lib/sources.ts` contains provider adapters. Add another adapter there and include it in `getForecasts()`; keep errors independent. `scripts/update-data.ts` fetches the fixed provider URLs and writes `public/data/latest.json` plus `public/data/status.json`. The former contains the TLE, independent forecasts, provenance, source errors and `checkedAt`. The browser validates this file and checks it every 15 minutes while open.

The publisher first retrieves the last deployed `data/latest.json` when `PREVIOUS_DATA_URL` is set. This preserves successful data across independent Actions runs without automated commits or repository-write access. The first deployment tolerates a missing file (404); other recovery failures stop publication and leave the existing site intact. Source failures retain previous values, original timestamps and explicit snapshot labels. An older bundled forecast cannot replace a newer cached forecast. A regressed TLE epoch cannot replace a newer saved orbit.

The top summary flags forecast inputs older than 24 hours separately from retrieval time. Source checks overdue by 45 minutes are highlighted. Browser caches and manual imports remain available if publication is interrupted.

`data/status.json` is a **static report**, replacing the former `/api/health` endpoint. It reports `healthy`, `degraded` or `unavailable` at `checkedAt`. Monitors must check that timestamp and current TLE age; HTTP 200 alone does not imply fresh data. No separate uptime-alert service is configured.

City search uses [Open-Meteo's geocoding API](https://open-meteo.com/en/docs/geocoding-api), with GeoNames attribution. The free endpoint is for non-commercial use; replace it if the hosting/business model requires a different plan. It supplies city elevation and an IANA timezone. Map/coordinate selections do not guess a timezone: the secondary clock is explicitly labeled device time.

A browser-importable custom HTTPS feed may return a two-line Swift TLE or one forecast object / array:

```json
{
  "id": "provider-stable-id",
  "source": "Provider name",
  "url": "https://provider.example/swift",
  "nominal": "2026-11-04T09:30:00Z",
  "earliest": "2026-11-03T07:30:00Z",
  "latest": "2026-11-05T11:30:00Z",
  "confidence": "Provider-defined interval",
  "issuedAt": "2026-10-31T12:00:00Z"
}
```

These dates illustrate the schema. Both bounds are optional, but must be supplied together and contain the nominal date. Timestamps must include a timezone. Source URLs must be HTTP(S). Custom feeds need CORS; pasting data works without it. An imported forecast with an existing ID overrides that provider locally. Clearing manual forecasts restores automatic sources. Never average intervals with different statistical definitions.

## Numerical model and limits

- SGP4 propagates the selected TLE. satellite.js is pinned to 7.0.0. `lib/satellite-core.ts` imports its JavaScript modules directly to avoid bundling unused optional threaded WASM exports.
- WGS-84 coordinates, observer elevation above sea level in meters, geometric look angles and Earth-rotation-corrected angular rate.
- Low-precision solar coordinates of date approximate the TEME frame. Spherical Earth and finite solar disk determine full sunlight, penumbra and umbra. A photo window requires full sunlight plus ground Sun altitude and elevation thresholds.
- Pass detection samples every five seconds and refines detected boundaries to about 0.25 seconds. Extremely short grazing passes can be missed. This is numerical resolution, not predictive accuracy. Visible peak values are sampled; geometric maxima are refined.
- Normal predictions are limited to 24 hours after the element epoch; explicitly selected exploratory propagation extends at most 96 hours from epoch. Requested searches are capped at 72 hours. SGP4 failure or modeled altitude below 80 km stops prediction; neither is used as a physical reentry date.
- Passes after the earliest supplied reentry bound are flagged conditional. Forecasts retain source-specific bounds and confidence labels. A passed forecast date is not proof that the satellite has reentered.
- Map visibility is an approximate sea-level footprint clipped by darkness, displayed at the preview time. The pass table uses the observer's height. Track lines cover -45 to +100 minutes. Antimeridian crossings are split.
- Brightness, attitude/tumbling, clouds, atmospheric refraction, terrain, extinction and light pollution are not modeled. The spacecraft may be faint even when geometry is favorable. This is not a debris or impact map.
- UTC remains the default. City results and presets supply site-local time; device time is labeled separately when the site timezone is unknown. The pass table offers the available timezones. Exports use UTC.

The bundled orbital snapshot is real CelesTrak data from October 31, 2026, epoch `2026-10-31T10:44:38.816Z`. It is never silently shifted to today's date. Refresh failures remain visible.

## Maps

The header, footer, and browser icon use the unmodified Swift wordmark from [NASA HEASARC's mission logo gallery](https://heasarc.gsfc.nasa.gov/docs/cgro/images/epo/gallery/logos/index.html), stored locally as `public/swift-logo.gif` ([original asset](https://heasarc.gsfc.nasa.gov/docs/cgro/images/epo/gallery/logos/swift_logo.gif)).

Leaflet uses the standard OpenStreetMap raster basemap, styled dark in CSS, with visible attribution. Requests go directly from the browser and honor the browser cache. No tile prefetch or offline download is implemented. See [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/). The URL/style are isolated in `components/orbit-map.tsx`; substitute a suitable provider if deployment traffic grows.

## Validation

`tests/orbit.test.ts` covers corrupt/wrong-object TLEs, UTC epoch conversion, sunlight/umbra/penumbra, elevation footprints, physical visibility throughout a photo window, freshness cutoff, inaccessible latitude, reentry overlap, antimeridian splitting, and provider normalization. `tests/browser.mjs` checks map rendering, pass selection, CSV/calendar downloads, location changes, invalid TLE handling, manual forecasts, and mobile overflow.

`tests/reliability.test.ts` covers rolling versus historical searches, completed illumination windows, cached-forecast retention and recovery, deduplicated requests, and upstream failure backoff. `tests/readiness.mjs` uses deterministic provider responses and a simulated clock to exercise city search, geolocation, outages, timezone/date rollover, expired passes, historical searches, keyboard access, and mobile layouts. Run it with `node --import tsx tests/readiness.mjs` (and `CHROMIUM_PATH` if needed).

`tests/reference.test.ts` compares against independently generated [Skyfield](https://rhodesmill.org/skyfield/earth-satellites.html) 1.55 / Python SGP4 / JPL DE421 fixtures: 16 positions and 42 geometric rise/culmination/set events at Honolulu, San Juan, Rio de Janeiro and Nairobi. Maximum observed differences for this fixture were 0.002° in azimuth, 0.001° in elevation, 0.039 km in range, and 0.211 s in event times. SunCalc's approximate solar altitude differed by at most 0.171°. This is implementation agreement using the same TLE, not a guarantee of actual near-reentry pass timing or detectability. `tests/reference-skyfield.py` documents optional regeneration; Python is not an application dependency.

`tests/publication.test.ts` verifies static-publication validation and retention across independent scheduled runs. `tests/static-browser.mjs` starts a production preview under the configured Pages path, checks assets/data/status URLs, and runs the deterministic browser suite, including delayed-publication warnings.
