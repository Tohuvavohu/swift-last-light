"use client";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import * as satellite from "@/lib/satellite-core";
import {
  DEG,
  EARTH_KM,
  footprintRadius,
  makeSampler,
  splitTrack,
  sunVector,
  type Elements,
  type Observer,
  type Pass,
} from "@/lib/orbit";
import "leaflet/dist/leaflet.css";

type Props = {
  elements: Elements;
  observer: Observer;
  time: number;
  minimum: number;
  darkness: number;
  pass: Pass | null;
  onLocation: (lat: number, lon: number) => void;
  usable: boolean;
};
export default function OrbitMap(props: Props) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    library = useRef<typeof Leaflet | null>(null);
  const layers = useRef<Leaflet.LayerGroup | null>(null),
    locationHandler = useRef(props.onLocation);
  const [ready, setReady] = useState(false),
    [night, setNight] = useState(true),
    [coverage, setCoverage] = useState(true),
    [tilesFailed, setTilesFailed] = useState(false);
  locationHandler.current = props.onLocation;
  useEffect(() => {
    let active = true;
    import("leaflet").then((L) => {
      if (!active || !container.current || map.current) return;
      library.current = L;
      const m = L.map(container.current, {
        center: [15, -80],
        zoom: 2,
        minZoom: 1,
        maxZoom: 11,
        zoomControl: false,
        worldCopyJump: false,
        maxBounds: [
          [-85, -180],
          [85, 180],
        ],
        maxBoundsViscosity: 1,
      });
      map.current = m;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        className: "basemap-tiles",
        noWrap: true,
        maxZoom: 19,
      })
        .on("tileerror", () => setTilesFailed(true))
        .addTo(m);
      L.control.zoom({ position: "bottomright" }).addTo(m);
      m.on("click", (e) =>
        locationHandler.current(
          Math.max(-85, Math.min(85, e.latlng.lat)),
          ((((e.latlng.lng + 180) % 360) + 360) % 360) - 180,
        ),
      );
      layers.current = L.layerGroup().addTo(m);
      setReady(true);
    });
    return () => {
      active = false;
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (ready)
      map.current?.panTo([props.observer.lat, props.observer.lon], {
        animate: true,
      });
  }, [ready, props.observer.lat, props.observer.lon]);
  useEffect(() => {
    const L = library.current,
      group = layers.current;
    if (!L || !group || !ready) return;
    group.clearLayers();
    const { elements, observer, time, minimum, darkness, pass, usable } = props;
    const sampler = makeSampler(elements, observer),
      current = usable ? sampler(time) : null;
    // Render on a Mercator raster so the illumination boundaries align with map tiles.
    if (night || coverage) {
      const width = 720,
        height = 360,
        canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (context) {
        const data = context.createImageData(width, height),
          sun = satellite.eciToEcf(
            sunVector(time),
            satellite.gstime(new Date(time)),
          );
        const solarLength = Math.hypot(sun.x, sun.y, sun.z),
          threshold = Math.sin(darkness * DEG);
        const satelliteLat = (current?.lat || 0) * DEG,
          satelliteLon = (current?.lon || 0) * DEG;
        const angularRadius = current
          ? footprintRadius(current.altitude, minimum) / 1000 / EARTH_KM
          : 0;
        for (let y = 0; y < height; y++) {
          const lat = Math.atan(
              Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / height)),
            ),
            sinLat = Math.sin(lat),
            cosLat = Math.cos(lat);
          for (let x = 0; x < width; x++) {
            const lon = (((x + 0.5) / width) * 360 - 180) * DEG;
            const solarDot =
              (cosLat * Math.cos(lon) * sun.x +
                cosLat * Math.sin(lon) * sun.y +
                sinLat * sun.z) /
              solarLength;
            const idx = (y * width + x) * 4;
            if (night && solarDot < 0) {
              data.data[idx] = 3;
              data.data[idx + 1] = 5;
              data.data[idx + 2] = 14;
              data.data[idx + 3] = solarDot < threshold ? 125 : 65;
            }
            const inside =
              current &&
              Math.sin(satelliteLat) * sinLat +
                Math.cos(satelliteLat) *
                  cosLat *
                  Math.cos(lon - satelliteLon) >=
                Math.cos(angularRadius);
            if (
              coverage &&
              inside &&
              current?.light === "sunlit" &&
              solarDot <= threshold
            ) {
              data.data[idx] = 104;
              data.data[idx + 1] = 232;
              data.data[idx + 2] = 183;
              data.data[idx + 3] = 110;
            }
          }
        }
        context.putImageData(data, 0, 0);
        L.imageOverlay(
          canvas.toDataURL(),
          [
            [-85.05112878, -180],
            [85.05112878, 180],
          ],
          { interactive: false, opacity: 1 },
        ).addTo(group);
      }
    }
    if (current) {
      const track = [];
      for (let t = time - 45 * 60000; t <= time + 100 * 60000; t += 20000) {
        const p = sampler(t);
        if (p) track.push(p);
        else break;
      }
      for (const segment of splitTrack(track))
        if (segment.length > 1)
          L.polyline(
            segment.map((p) => [p.lat, p.lon] as [number, number]),
            {
              color: segment[0].light === "sunlit" ? "#e7be86" : "#778296",
              weight: 2,
              opacity: 0.85,
              dashArray: segment[0].light === "sunlit" ? undefined : "5 6",
              interactive: false,
            },
          ).addTo(group);
      if (coverage)
        L.circle([current.lat, current.lon], {
          radius: footprintRadius(current.altitude, minimum),
          color: "#89bba9",
          weight: 1,
          opacity: 0.65,
          fillColor: "#8dcbb2",
          fillOpacity: 0.04,
          interactive: false,
        }).addTo(group);
      if (pass)
        for (const segment of splitTrack(pass.samples))
          L.polyline(
            segment.map((p) => [p.lat, p.lon] as [number, number]),
            { color: "#a4f0cf", weight: 4, opacity: 0.95, interactive: false },
          ).addTo(group);
      L.marker([current.lat, current.lon], {
        icon: L.divIcon({
          className: "satellite-marker",
          html: "<span>✦</span>",
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
      })
        .bindTooltip("SWIFT · NORAD 28485", {
          direction: "top",
          offset: [0, -14],
        })
        .addTo(group);
    }
    const marker = L.circleMarker([observer.lat, observer.lon], {
      radius: 6,
      color: "#fff",
      weight: 2,
      fillColor: "#8eebc4",
      fillOpacity: 1,
    }).addTo(group);
    const label = document.createElement("span");
    label.textContent = observer.name;
    marker.bindTooltip(label, { direction: "top", offset: [0, -8] });
  }, [props, ready, night, coverage]);
  return (
    <div className="map-shell">
      <div
        ref={container}
        className="map-canvas"
        aria-label="Interactive Swift ground track map. Click to set an observing location."
      />
      <div className="map-heading">
        <span className="eyebrow">ORBITAL VIEW</span>
        <strong>One last look up.</strong>
        <span>Click anywhere to plan from there.</span>
      </div>
      <div className="map-toggles">
        <label>
          <input
            type="checkbox"
            checked={night}
            onChange={(e) => setNight(e.target.checked)}
          />{" "}
          Night
        </label>
        <label>
          <input
            type="checkbox"
            checked={coverage}
            onChange={(e) => setCoverage(e.target.checked)}
          />{" "}
          Visibility
        </label>
        <button onClick={() => map.current?.setView([10, 0], 2)}>World</button>
      </div>
      <div className="map-legend">
        <span>
          <i className="line gold" />
          Sunlit track
        </span>
        <span>
          <i className="line dashed" />
          Earth shadow
        </span>
        <span>
          <i className="dot mint" />
          Photo region now
        </span>
      </div>
      {tilesFailed && (
        <div className="map-notice">
          Some map tiles could not load. Orbital overlays still work.
        </div>
      )}
      {!props.usable && (
        <div className="map-notice">
          Orbital position hidden: refresh the TLE or enable exploratory
          propagation.
        </div>
      )}
    </div>
  );
}
