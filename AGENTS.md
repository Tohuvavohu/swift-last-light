# Project workflow

The user has authorized hosting this project on their personal GitHub using GitHub Pages and scheduled GitHub Actions. The destination is `Tohuvavohu/swift-last-light`, with the public site at `https://tohuvavohu.github.io/swift-last-light/`. Keep changes and deployments within that repository. Do not publish to ChatGPT Sites.

Keep local development available through the user service `swift-watch-dev` (Vite on port 5173) and the existing Agent Portal forward. Use Node >=22.13. `npm run data:update` refreshes the local static publication; `npm run dev` serves it. The workflow refreshes production independently of open browsers.

The user explicitly wants the technical controls and details retained. Preserve the orbital validity checks, UTC display, source-specific uncertainties, manual imports, historical searches, provenance and stale-data warnings.

Before deployment, run relevant tests and the production build. Verify repository-relative paths with `PAGES_BASE_PATH=/swift-last-light/ node tests/static-browser.mjs` after a build using the same base path. Never stamp retained source data as newly retrieved; a schedule is not a freshness guarantee. The README documents workflow behavior and validation.
