/**
 * WaveformPanel – Her mikrofon kanalı için dikey sütunda kısa waveform.
 * Recharts yerine saf SVG — animasyon yok, hızlı render.
 */
import React, { useMemo } from "react";

const CHANNEL_COLORS = [
  "#38bdf8", "#34d399", "#f472b6", "#facc15",
  "#a78bfa", "#fb923c", "#e879f9", "#4ade80",
];

const BAR_W = 180;
const BAR_H = 44;

function MiniWave({ data, color, label }) {
  const points = useMemo(() => {
    if (!data || data.length === 0) return "";
    const w = BAR_W;
    const h = BAR_H;
    const mid = h / 2;
    const step = w / (data.length - 1 || 1);
    return data
      .map((v, i) => `${(i * step).toFixed(1)},${(mid - v * (mid - 2)).toFixed(1)}`)
      .join(" ");
  }, [data]);

  return (
    <div className="waveform-row">
      <span className="waveform-ch-label" style={{ color }}>{label}</span>
      <svg width={BAR_W} height={BAR_H} className="waveform-svg">
        {/* centre line */}
        <line x1={0} y1={BAR_H / 2} x2={BAR_W} y2={BAR_H / 2}
          stroke="#1e3a5f" strokeWidth={1} />
        {/* waveform */}
        {points && (
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
      </svg>
      {/* rms indicator */}
      <span className="waveform-peak" title="RMS güç" style={{ color }}>
        {data && data.length > 0
          ? Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length).toFixed(3)
          : "–"}
      </span>
    </div>
  );
}

export default function WaveformPanel({ waveform }) {
  if (!waveform || waveform.length === 0) {
    return (
      <div className="waveform-panel empty">
        <h3 className="panel-subtitle">〜 Mic Waveforms</h3>
        <p className="empty-hint">Veri bekleniyor…</p>
      </div>
    );
  }

  return (
    <div className="waveform-panel">
      <h3 className="panel-subtitle">〜 Mic Waveforms</h3>
      <div className="waveform-column">
        {waveform.map((ch, i) => (
          <MiniWave
            key={i}
            data={ch}
            color={CHANNEL_COLORS[i % CHANNEL_COLORS.length]}
            label={`M${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

