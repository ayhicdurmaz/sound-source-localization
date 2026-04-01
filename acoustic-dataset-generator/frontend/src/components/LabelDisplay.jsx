/**
 * LabelDisplay – Son üretilen sample'ın JSON label'ını gösterir.
 */
import React from "react";

export default function LabelDisplay({ label }) {
  if (!label) {
    return (
      <div className="label-display empty">
        <h3 className="panel-subtitle">🏷 Last Label</h3>
        <p className="empty-hint">No sample yet</p>
      </div>
    );
  }

  const hasMulti = Array.isArray(label.sources);

  if (hasMulti) {
    return (
      <div className="label-display">
        <h3 className="panel-subtitle">🏷 Last Label</h3>

        <div className="label-multi-summary">
          <span className="label-chip">Multi</span>
          <span className="label-multi-count">{label.sources.length} sources</span>
        </div>

        <div className="label-multi-list">
          {label.sources.map((s, i) => (
            <div key={i} className="label-source-card">
              <div className="label-source-header">
                <span className="label-source-title">S{i + 1}</span>
                <span className="label-source-type">{s.signal_type || "—"}</span>
              </div>

              <div className="label-kv">
                <span className="k">Azimuth</span>
                <span className="v">{Number.isFinite(s.azimuth_deg) ? `${s.azimuth_deg.toFixed(2)}°` : "—"}</span>
              </div>
              <div className="label-kv">
                <span className="k">Distance</span>
                <span className="v">{Number.isFinite(s.distance_m) ? `${s.distance_m.toFixed(3)} m` : "—"}</span>
              </div>
              <div className="label-kv">
                <span className="k">Pos</span>
                <span className="v">
                  {Array.isArray(s.source_pos)
                    ? `${s.source_pos[0].toFixed(2)}, ${s.source_pos[1].toFixed(2)}`
                    : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const rows = [
    ["Sample #",    label.sample_index],
    ["Session",     label.session_id?.slice(-6)],
    ["─────────", null],
    ["Azimuth",     `${label.azimuth_deg?.toFixed(2)}°`],
    ["Distance",    `${label.distance_m?.toFixed(3)} m`],
    ["Src X/Y",     `${label.source_pos?.[0].toFixed(2)}, ${label.source_pos?.[1].toFixed(2)}`],
    ["─────────", null],
    ["Field Mode",  label.field_mode],
    ["Is Far Field",label.is_far_field ? "✓ yes" : "✗ no"],
    ["FF Boundary", `${label.ff_boundary_m} m`],
    ["─────────", null],
    ["Mics",        `${label.n_mics}${label.center_mic ? " +C" : ""}`],
    ["Mic Radius",  `${label.mic_radius_m} m`],
    ["Mic Center",  label.mic_center ? `${label.mic_center[0].toFixed(1)}, ${label.mic_center[1].toFixed(1)}` : "–"],
    ["─────────", null],
    ["Room",        label.room_dims_m ? `${label.room_dims_m[0]}×${label.room_dims_m[1]}×${label.room_dims_m[2]} m` : "–"],
    ["RT60",        `${label.rt60} s`],
    ["─────────", null],
    ["Signal",      label.signal_type],
    ["SNR",         `${label.snr_db} dB`],
    ["Ambient SNR", `${label.ambient_snr_db} dB`],
    ["─────────", null],
    ["Sample Rate", `${label.sample_rate} Hz`],
    ["Samples",     label.n_audio_samples],
  ];

  return (
    <div className="label-display">
      <h3 className="panel-subtitle">🏷 Last Label</h3>
      <table className="label-table">
        <tbody>
          {rows.map(([k, v], i) =>
            v === null ? (
              <tr key={i}><td colSpan={2} className="label-divider" /></tr>
            ) : (
              <tr key={k}>
                <td className="label-key">{k}</td>
                <td className="label-val"
                  style={k === "Field Mode" ? { color: label.field_mode === "farfield" ? "#f59e0b" : "#38bdf8" } : undefined}
                >{v}</td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
