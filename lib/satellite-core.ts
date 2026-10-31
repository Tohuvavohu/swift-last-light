// satellite.js 7 also exports optional threaded WASM workers. Import its pinned
// JavaScript modules directly so those unused workers are not bundled by Vite.
export { twoline2satrec } from "../node_modules/satellite.js/dist/io.js";
export {
  propagate,
  gstime,
} from "../node_modules/satellite.js/dist/propagation.js";
export {
  geodeticToEcf,
  eciToGeodetic,
  eciToEcf,
  ecfToEci,
  ecfToLookAngles,
} from "../node_modules/satellite.js/dist/transforms.js";
