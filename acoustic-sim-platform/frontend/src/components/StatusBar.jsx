/**
 * StatusBar – Üst bilgi çubuğu; ilerleme durumunu gösterir.
 */
import React from "react";

const STATUS_LABELS = {
  idle: { text: "Idle", color: "#64748b" },
  connecting: { text: "Connecting…", color: "#facc15" },
  running: { text: "Running", color: "#34d399" },
  done: { text: "Done ✓", color: "#38bdf8" },
  error: { text: "Error ✗", color: "#f87171" },
  stopped: { text: "Stopped", color: "#fb923c" },
};

export default function StatusBar({ status, progress, total, sessionId, lastError }) {
  const info = STATUS_LABELS[status] || STATUS_LABELS.idle;
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <header className="status-bar">
      <div className="status-left">
        <span className="status-dot" style={{ background: info.color }} />
        <span className="status-text" style={{ color: info.color }}>
          {info.text}
        </span>
        {status === "running" && (
          <span className="status-progress">
            {progress} / {total} samples ({pct}%)
          </span>
        )}
        {status === "error" && lastError && (
          <span className="status-error">{lastError}</span>
        )}
      </div>
      <div className="status-right">
        {sessionId && (
          <span className="session-id">Session: {sessionId}</span>
        )}
        <span className="app-title">🔊 Acoustic Sim Platform</span>
      </div>

      {/* Progress bar */}
      {(status === "running" || status === "done") && total > 0 && (
        <div className="progress-bar-wrap">
          <div
            className="progress-bar-fill"
            style={{
              width: `${pct}%`,
              background: status === "done" ? "#38bdf8" : "#34d399",
            }}
          />
        </div>
      )}
    </header>
  );
}
