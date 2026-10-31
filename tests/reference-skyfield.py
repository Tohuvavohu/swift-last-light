"""Regenerate the independent fixture (optional; not a runtime dependency).

python -m venv outputs/reference-env
outputs/reference-env/bin/pip install skyfield==1.55
outputs/reference-env/bin/python tests/reference-skyfield.py

Skyfield uses Python SGP4, its own frame transforms, and JPL DE421 for the Sun.
The fixture tests numerical agreement, not the accuracy of a decaying orbit.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
import skyfield
from skyfield.api import EarthSatellite, Loader, wgs84

root = Path(__file__).resolve().parents[1]
load = Loader(str(root / "outputs/reference-data"))
ts = load.timescale(builtin=True)
eph = load("de421.bsp")
line1 = "1 28485U 04047A   26304.44767149  .01372254  13072-2  97041-3 0  9992"
line2 = "2 28485  20.5470 195.6831 0005005 286.9934  72.9973 16.15126897208442"
sat = EarthSatellite(line1, line2, "SWIFT", ts)
sites = [
    dict(name="Honolulu", lat=21.3069, lon=-157.8583, height=10),
    dict(name="San Juan", lat=18.4655, lon=-66.1057, height=10),
    dict(name="Rio de Janeiro", lat=-22.9068, lon=-43.1729, height=10),
    dict(name="Nairobi", lat=-1.2921, lon=36.8219, height=1795),
]

def time(s):
    return ts.from_datetime(datetime.fromisoformat(s.replace("Z", "+00:00")))

start, end = time("2026-10-31T19:00:00Z"), time("2026-11-01T10:44:38.816Z")
points, events = [], []
for site in sites:
    ground = wgs84.latlon(site["lat"], site["lon"], elevation_m=site["height"])
    observer = eph["earth"] + ground
    for date in ["2026-10-31T19:00:00Z", "2026-11-01T00:00:00Z", "2026-11-01T05:01:00Z", "2026-11-01T10:00:00Z"]:
        t = time(date)
        alt, az, distance = (sat - ground).at(t).altaz()
        sun_alt = observer.at(t).observe(eph["sun"]).apparent().altaz()[0].degrees
        points.append(dict(observer=site, time=date, elevation=float(alt.degrees), azimuth=float(az.degrees), range=float(distance.km), sunAltitude=float(sun_alt), sunlit=bool(sat.at(t).is_sunlit(eph))))
    times, kinds = sat.find_events(ground, start, end, altitude_degrees=10)
    for t, kind in zip(times, kinds):
        events.append(dict(observer=site, kind=["rise", "culmination", "set"][int(kind)], time=t.utc_datetime().isoformat()))

output = root / "tests/fixtures/skyfield-reference.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(dict(generator=f"Skyfield {skyfield.__version__}, Python SGP4, JPL DE421; built-in timescale", line1=line1, line2=line2, points=points, events=events), indent=2) + "\n")
print(f"Wrote {len(points)} independent positions and {len(events)} pass events to {output}")
