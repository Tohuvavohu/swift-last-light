import type { Forecast } from "../../lib/sources";

// Fixed historical data keeps outage tests independent of refreshed live snapshots.
export const aerospaceFixture: Forecast = {
  "id": "aerospace",
  "source": "Aerospace \u00b7 CORDS",
  "url": "https://aerospace.org/reentries/28485",
  "nominal": "2026-11-04T09:30:00.000Z",
  "earliest": "2026-11-03T07:30:00.000Z",
  "latest": "2026-11-05T11:30:00.000Z",
  "confidence": "\u00b126 hours \u00b7 confidence not specified",
  "orbitEpoch": "2026-10-30T00:37:05.834Z",
  "fetchedAt": "2026-10-31T19:04:00.000Z",
  "status": "snapshot",
  "note": "Verified page snapshot, Oct 31. Automated refresh may be blocked by the publisher."
};
