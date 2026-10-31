# Swift · Last Light

A ground-based photography planner for NASA's Neil Gehrels Swift Observatory (NORAD 28485). Built with React / Vinext, Leaflet, satellite.js SGP4, and SunCalc; deployable as a Cloudflare Worker using Sites.

## Run locally

Requires Node 22.13 or later.

```sh
npm ci
npm run dev -- --host 0.0.0.0 --port 5173
```

Open http://localhost:5173. No account credentials or map API key are required for local use. Geolocation needs localhost or HTTPS. The hosted Site is owner-private.

```sh
npm test
npx tsc --noEmit --incremental false
npm run build
```

The optional browser check uses Playwright. Install its Chromium with `npx playwright install chromium`, start the development server, then run `node tests/browser.mjs`. Set `CHROMIUM_PATH` to use an already-installed compatible Chromium. Screenshots are written to ignored `outputs/`.

## Use

1. Refresh live data. Inspect the TLE epoch and any refresh notices.
2. Choose a preset, use geolocation, type coordinates, or click the map. Honolulu is an explicitly labeled example, not an inferred user location.
3. Select elevation, darkness, and search time. Normal searches stop 24 hours after the TLE epoch; longer propagation requires explicit exploratory mode.
4. Select a pass to move the map to its visible peak. Check the polar sky track, directions, photo-window duration, range, phase angle, and angular speed.
5. Export photo windows as CSV or UTC calendar events. Recheck the TLE before observing.
6. Use **Data & sources** for manual TLEs, an HTTPS feed, or forecast imports. Settings/data are stored in this browser. Location links share latitude and longitude; they do not share imported forecasts or the orbit.

## Data sources and extension hooks

- `GET /api/tle`: [CelesTrak Swift TLE](https://celestrak.org/NORAD/elements/gp.php?CATNR=28485&FORMAT=TLE). Validates catalog number, checksums, epoch and propagation. Failures are explicit HTTP 502 errors; the browser retains a labeled cached snapshot.
- `GET /api/forecasts`: independent [Michigan SWORD](https://csem.engin.umich.edu/SWORD/swift/) and [Aerospace CORDS](https://aerospace.org/reentries/28485) adapters. Each includes source URL, issue/orbit epoch when available, retrieval time and data status.
- Michigan's public [JSON feed](https://csem.engin.umich.edu/SWORD/data/reentry/reentry.json) supplies the ensemble median `p50` and 90% interval `p05`–`p95`. Its deterministic `center` run is deliberately not substituted for the median.
- Aerospace may return HTTP 403 to automated clients. The included, clearly labeled snapshot was checked on October 31, 2026: November 4 at 09:30 UTC ±26 h, based on the October 30 orbit epoch. Open the source and enter a manual update if automatic refresh is blocked. No challenge bypass is attempted.
- [NASA CCMC Swift challenge](https://ccmc.gsfc.nasa.gov/swift-challenge/index.php) and [Space-Track TIP / decay](https://www.space-track.org/#decay) are linked for further evidence. They are not represented as connected live feeds. Space-Track credentials are not collected.

`lib/sources.ts` contains the normalization contract and provider adapters. Add another server-side adapter there and include it in `getForecasts()`; keep its errors independent. Server endpoints fetch fixed provider URLs, not arbitrary caller-supplied URLs. Successful results are cached for 15 minutes per Worker isolate; the open browser refreshes every 15 minutes. There is no background schedule while the page is closed.

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
- UTC is the default; device time uses the browser's timezone, not the observer location's. Exports use UTC.

The bundled orbital snapshot is real CelesTrak data from October 31, 2026, epoch `2026-10-31T10:44:38.816Z`. It is never silently shifted to today's date. Refresh failures remain visible.

## Maps

Leaflet uses the standard OpenStreetMap raster basemap, styled dark in CSS, with visible attribution. Requests go directly from the browser and honor the browser cache. No tile prefetch or offline download is implemented. See [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/). The URL/style are isolated in `components/orbit-map.tsx`; substitute a suitable provider if deployment traffic grows.

## Validation

`tests/orbit.test.ts` covers corrupt/wrong-object TLEs, UTC epoch conversion, sunlight/umbra/penumbra, elevation footprints, physical visibility throughout a photo window, freshness cutoff, inaccessible latitude, reentry overlap, antimeridian splitting, and provider normalization. `tests/browser.mjs` checks map rendering, pass selection, CSV/calendar downloads, location changes, invalid TLE handling, manual forecasts, and mobile overflow.
