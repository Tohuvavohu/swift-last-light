import { isVisible, type Pass, type Settings } from "@/lib/orbit";
export default function SkyChart({
  pass,
  settings,
}: {
  pass: Pass;
  settings: Settings;
}) {
  const xy = (az: number, el: number) => {
    const r = ((90 - Math.max(0, el)) / 90) * 95;
    return [
      120 + r * Math.sin((az * Math.PI) / 180),
      120 - r * Math.cos((az * Math.PI) / 180),
    ];
  };
  const peak = xy(pass.peak.azimuth, pass.peak.elevation),
    start = xy(pass.start.azimuth, pass.start.elevation);
  return (
    <svg
      className="sky-chart"
      viewBox="0 0 240 240"
      role="img"
      aria-label="Sky path viewed facing upward, north at top, east at left. Green segments meet the photography criteria."
    >
      <rect width="240" height="240" fill="#1a1b26" rx="12" />
      <g transform="translate(240 0) scale(-1 1)">
        {[95, 63.3, 31.7].map((r) => (
          <circle
            key={r}
            cx="120"
            cy="120"
            r={r}
            fill="none"
            stroke="#3c4755"
            strokeDasharray="3 4"
          />
        ))}
        <path d="M25 120H215M120 25V215" stroke="#3c4755" />
        {pass.samples.slice(1).map((p, i) => {
          const a = xy(pass.samples[i].azimuth, pass.samples[i].elevation),
            b = xy(p.azimuth, p.elevation);
          return (
            <path
              key={p.time}
              d={`M${a}L${b}`}
              stroke={isVisible(p, settings) ? "#a4f0cf" : "#7c8697"}
              strokeWidth="2.7"
            />
          );
        })}
        <circle cx={peak[0]} cy={peak[1]} r="4" fill="#e7be86" />
        <circle cx={start[0]} cy={start[1]} r="3" fill="#c0caf5" />
      </g>
      <g fill="#c0caf5" fontSize="11" textAnchor="middle">
        <text x="120" y="16">
          N
        </text>
        <text x="12" y="124">
          E
        </text>
        <text x="228" y="124">
          W
        </text>
        <text x="120" y="234">
          S
        </text>
        <text x="120" y="112" fill="#8995a6">
          90°
        </text>
        <text x="155" y="116" fill="#8995a6">
          60°
        </text>
      </g>
    </svg>
  );
}
