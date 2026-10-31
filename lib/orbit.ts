import * as satellite from "./satellite-core";
import SunCalc from "suncalc";

export const DEG = Math.PI / 180;
export const EARTH_KM = 6378.137;
export type Observer = {
  name: string;
  lat: number;
  lon: number;
  height: number;
};
export type Elements = {
  name: string;
  line1: string;
  line2: string;
  epoch: string;
  source: string;
  fetchedAt: string;
  snapshot?: boolean;
};
export type Point = {
  time: number;
  lat: number;
  lon: number;
  altitude: number;
  elevation: number;
  azimuth: number;
  range: number;
  sunAltitude: number;
  light: "sunlit" | "penumbra" | "umbra";
  phase: number;
  angularSpeed: number;
};
export type Settings = {
  minimum: number;
  darkness: number;
  hours: number;
  start: number;
  allowStale: boolean;
};
export type Segment = { start: Point; end: Point; peak: Point };
export type Pass = {
  id: number;
  start: Point;
  end: Point;
  peak: Point;
  windows: Segment[];
  samples: Point[];
  ageHours: number;
  conditional: boolean;
};

export function parseTLE(text: string, source = "Manual import"): Elements {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((x) => x.trimEnd())
    .filter((x) => x.trim());
  const first = lines.findIndex((x) => x.startsWith("1 "));
  const line1 = lines[first],
    line2 = lines[first + 1];
  if (!line1 || !line2 || !line2.startsWith("2 "))
    throw Error("Paste the two TLE lines for Swift (NORAD 28485).");
  for (const line of [line1, line2]) {
    if (line.length !== 69)
      throw Error(
        "Each TLE line must contain exactly 69 characters, including its checksum.",
      );
    if (line.slice(2, 7).trim() !== "28485")
      throw Error("This planner requires Swift, NORAD 28485.");
    const sum = [...line.slice(0, 68)].reduce(
      (n, c) => n + (/\d/.test(c) ? +c : c === "-" ? 1 : 0),
      0,
    );
    if (sum % 10 !== +line[68])
      throw Error("TLE checksum failed. Copy the complete original lines.");
  }
  const yy = Number(line1.slice(18, 20)),
    day = Number(line1.slice(20, 32));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  if (
    !Number.isInteger(yy) ||
    !Number.isFinite(day) ||
    day < 1 ||
    day >= days + 1
  )
    throw Error("Invalid TLE epoch.");
  const inclination = Number(line2.slice(8, 16)),
    motion = Number(line2.slice(52, 63));
  if (
    !Number.isFinite(inclination) ||
    inclination < 0 ||
    inclination > 180 ||
    !Number.isFinite(motion) ||
    motion <= 0 ||
    motion > 20
  )
    throw Error("Invalid orbital parameters.");
  const epoch = new Date(
    Date.UTC(year, 0, 1) + (day - 1) * 86400000,
  ).toISOString();
  const record = satellite.twoline2satrec(line1, line2);
  const initial = satellite.propagate(record, new Date(epoch));
  if (
    !Number.isFinite(record.ecco) ||
    record.ecco < 0 ||
    record.ecco >= 1 ||
    !initial ||
    !initial.position ||
    !initial.velocity ||
    !Object.values(initial.position).every(Number.isFinite) ||
    !Object.values(initial.velocity).every(Number.isFinite)
  )
    throw Error("The TLE could not be propagated.");
  return {
    name: first > 0 ? lines[first - 1].replace(/^0 /, "") : "SWIFT",
    line1,
    line2,
    epoch,
    source,
    fetchedAt: new Date().toISOString(),
  };
}

type Vec = { x: number; y: number; z: number };
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: Vec) => Math.hypot(a.x, a.y, a.z);
const sub = (a: Vec, b: Vec) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const clamp = (x: number) => Math.max(-1, Math.min(1, x));

// Low-precision solar equatorial coordinates of date; adequate for planning,
// not an astrometric ephemeris. TEME/date frame differences are not modeled.
export function sunVector(time: number): Vec {
  const n = time / 86400000 + 2440587.5 - 2451545;
  const g = (357.528 + 0.9856003 * n) * DEG;
  const longitude =
    (280.46 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) *
    DEG;
  const obliquity = (23.439 - 0.0000004 * n) * DEG;
  const distance =
    (1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g)) * 149597870.7;
  return {
    x: distance * Math.cos(longitude),
    y: distance * Math.cos(obliquity) * Math.sin(longitude),
    z: distance * Math.sin(obliquity) * Math.sin(longitude),
  };
}

export function illumination(position: Vec, sun: Vec): Point["light"] {
  const toSun = sub(sun, position),
    toEarth = { x: -position.x, y: -position.y, z: -position.z };
  const earthRadius = Math.asin(Math.min(1, EARTH_KM / norm(position)));
  const solarRadius = Math.asin(695700 / norm(toSun));
  const separation = Math.acos(
    clamp(dot(toSun, toEarth) / norm(toSun) / norm(toEarth)),
  );
  if (separation >= earthRadius + solarRadius) return "sunlit";
  return separation <= earthRadius - solarRadius ? "umbra" : "penumbra";
}

export function makeSampler(elements: Elements, observer: Observer) {
  const record = satellite.twoline2satrec(elements.line1, elements.line2);
  const ground = {
    latitude: observer.lat * DEG,
    longitude: observer.lon * DEG,
    height: observer.height / 1000,
  };
  const groundEcf = satellite.geodeticToEcf(ground);
  return (time: number): Point | null => {
    const date = new Date(time),
      pv = satellite.propagate(record, date);
    if (!pv || !pv.position || !pv.velocity) return null;
    const gmst = satellite.gstime(date),
      pos = pv.position;
    const gd = satellite.eciToGeodetic(pos, gmst);
    if (!Number.isFinite(gd.height) || gd.height < 80) return null;
    const ecf = satellite.eciToEcf(pos, gmst),
      look = satellite.ecfToLookAngles(ground, ecf);
    const sun = sunVector(time),
      observerEci = satellite.ecfToEci(groundEcf, gmst);
    const toObserver = sub(observerEci, pos),
      toSun = sub(sun, pos);
    const phase =
      Math.acos(
        clamp(dot(toObserver, toSun) / norm(toObserver) / norm(toSun)),
      ) / DEG;
    const groundVelocity = {
      x: -7.292115e-5 * observerEci.y,
      y: 7.292115e-5 * observerEci.x,
      z: 0,
    };
    const relative = sub(pv.velocity, groundVelocity),
      ray = sub(pos, observerEci);
    const radial = dot(relative, ray) / norm(ray);
    const angularSpeed =
      Math.sqrt(Math.max(0, dot(relative, relative) - radial * radial)) /
      norm(ray) /
      DEG;
    return {
      time,
      lat: gd.latitude / DEG,
      lon: gd.longitude / DEG,
      altitude: gd.height,
      elevation: look.elevation / DEG,
      azimuth: (look.azimuth / DEG + 360) % 360,
      range: look.rangeSat,
      sunAltitude:
        SunCalc.getPosition(date, observer.lat, observer.lon).altitude / DEG,
      light: illumination(pos, sun),
      phase,
      angularSpeed,
    };
  };
}

export function isVisible(p: Point, s: Pick<Settings, "minimum" | "darkness">) {
  return (
    p.elevation >= s.minimum &&
    p.sunAltitude <= s.darkness &&
    p.light === "sunlit"
  );
}

export function footprintRadius(altitude: number, minimum: number) {
  const el = minimum * DEG;
  return (
    (Math.acos(Math.min(1, (EARTH_KM / (EARTH_KM + altitude)) * Math.cos(el))) -
      el) *
    EARTH_KM *
    1000
  );
}

export function findPasses(
  elements: Elements,
  observer: Observer,
  settings: Settings,
  reentryStart?: number,
): { passes: Pass[]; stop: number; reason: string | null } {
  const sample = makeSampler(elements, observer),
    epoch = Date.parse(elements.epoch);
  const requestedEnd = settings.start + Math.min(72, settings.hours) * 3600000;
  const ageLimit = settings.allowStale ? 96 : 24;
  if (settings.start < epoch - ageLimit * 3600000)
    return {
      passes: [],
      stop: settings.start,
      reason: `The search starts more than ${ageLimit} hours before the TLE epoch. Use orbital elements for that date.`,
    };
  const stop = Math.min(
    requestedEnd,
    epoch + (settings.allowStale ? 96 : 24) * 3600000,
  );
  if (stop <= settings.start)
    return {
      passes: [],
      stop,
      reason: `The search starts more than ${ageLimit} hours after the TLE epoch. Refresh the orbit${settings.allowStale ? "." : " or explicitly enable exploratory propagation."}`,
    };
  const passes: Pass[] = [];
  let current: Point[] = [],
    previous: Point | null = null,
    ended = stop;
  const refine = (
    a: Point,
    b: Point,
    predicate: (p: Point) => boolean,
  ): Point => {
    let lo = a.time,
      hi = b.time;
    const state = predicate(a);
    while (hi - lo > 250) {
      const mid = (lo + hi) / 2,
        p = sample(mid);
      if (p && predicate(p) === state) lo = mid;
      else hi = mid;
    }
    return sample((lo + hi) / 2) || b;
  };
  const finish = () => {
    if (current.length < 2) {
      current = [];
      return;
    }
    let peak = current.reduce((a, b) => (a.elevation > b.elevation ? a : b));
    for (let t = peak.time - 5000; t <= peak.time + 5000; t += 250) {
      const p = sample(t);
      if (
        p &&
        t >= current[0].time &&
        t <= current.at(-1)!.time &&
        p.elevation > peak.elevation
      )
        peak = p;
    }
    const windows: Segment[] = [];
    let visible: Point[] = [];
    const closeWindow = () => {
      if (visible.length > 1)
        windows.push({
          start: visible[0],
          end: visible.at(-1)!,
          peak: visible.reduce((a, b) => (a.elevation > b.elevation ? a : b)),
        });
      visible = [];
    };
    for (let i = 0; i < current.length; i++) {
      const p = current[i],
        prev = current[i - 1],
        good = isVisible(p, settings);
      if (good && !visible.length && prev)
        visible.push(refine(prev, p, (x) => isVisible(x, settings)));
      if (good) visible.push(p);
      else if (visible.length) {
        if (prev) visible.push(refine(prev, p, (x) => isVisible(x, settings)));
        closeWindow();
      }
    }
    closeWindow();
    const start = current[0],
      end = current.at(-1)!;
    passes.push({
      id: start.time,
      start,
      end,
      peak,
      windows,
      samples: current,
      ageHours: (peak.time - epoch) / 3600000,
      conditional: reentryStart !== undefined && end.time >= reentryStart,
    });
    current = [];
  };
  for (let time = settings.start; time <= stop; time += 5000) {
    const p = sample(time);
    if (!p) {
      finish();
      ended = time;
      break;
    }
    if (p.elevation >= settings.minimum) {
      if (!current.length && previous && previous.elevation < settings.minimum)
        current.push(
          refine(previous, p, (x) => x.elevation >= settings.minimum),
        );
      current.push(p);
    } else if (current.length) {
      if (previous)
        current.push(
          refine(previous, p, (x) => x.elevation >= settings.minimum),
        );
      finish();
    }
    previous = p;
  }
  finish();
  const reason =
    ended < stop
      ? "Propagation stopped: SGP4 failed or modeled altitude reached 80 km. This is not a reentry forecast."
      : stop < requestedEnd
        ? "Search clipped to 24 hours after the TLE epoch. Refresh the orbit or enable exploratory propagation."
        : null;
  return { passes, stop: ended, reason };
}

export function compass(az: number) {
  return [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ][Math.round(az / 22.5) % 16];
}
export const visibleSeconds = (p: Pass) =>
  p.windows.reduce((n, w) => n + (w.end.time - w.start.time) / 1000, 0);
export const photoPeak = (p: Pass) =>
  p.windows.length
    ? p.windows
        .map((w) => w.peak)
        .reduce((a, b) => (a.elevation > b.elevation ? a : b))
    : p.peak;
export function splitTrack(points: Point[]) {
  const segments: Point[][] = [];
  let segment: Point[] = [];
  for (const p of points) {
    if (
      segment.length &&
      (Math.abs(p.lon - segment.at(-1)!.lon) > 180 ||
        p.light !== segment.at(-1)!.light)
    ) {
      if (Math.abs(p.lon - segment.at(-1)!.lon) <= 180) segment.push(p);
      segments.push(segment);
      segment = [];
    }
    segment.push(p);
  }
  if (segment.length) segments.push(segment);
  return segments;
}
