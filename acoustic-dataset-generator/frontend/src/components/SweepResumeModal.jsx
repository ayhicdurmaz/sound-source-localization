import React, { useEffect, useMemo, useState } from "react";

const API = "/api";

function fmtTs(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

export default function SweepResumeModal({ open, onClose, onPick, busy }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API}/sweeps`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data?.sweeps) ? data.sweeps : [];
      setItems(list);
    } catch {
      setErr("Sweep listesi alınamadı");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => String(s?.sweep_id || "").toLowerCase().includes(q));
  }, [items, query]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <div className="modal-title">Sweep seç</div>
            <div className="modal-subtitle">Kaldığın yerden devam etmek için bir sweep seç.</div>
          </div>
          <button className="btn-upload" onClick={onClose} disabled={busy || loading} title="Kapat">
            ✕
          </button>
        </div>

        <div className="modal-actions">
          <input
            className="modal-input"
            placeholder="Sweep id ara…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={busy || loading}
          />
          <button className="mode-btn" onClick={load} disabled={busy || loading} title="Yenile">
            Yenile
          </button>
        </div>

        {err ? <div className="info-box" style={{ marginTop: 10 }}>{err}</div> : null}

        <div className="modal-list" style={{ marginTop: 10 }}>
          {loading ? (
            <div className="audio-upload-empty">Yükleniyor…</div>
          ) : filtered.length === 0 ? (
            <div className="audio-upload-empty">Sweep bulunamadı.</div>
          ) : (
            filtered.map((s) => {
              const id = s?.sweep_id;
              const done = Number(s?.done ?? 0);
              const total = Number(s?.total ?? 0);
              const updatedAt = s?.updated_at;
              const createdAt = s?.created_at;

              return (
                <button
                  key={id}
                  type="button"
                  className="modal-item"
                  onClick={() => onPick?.(id)}
                  disabled={busy || loading || !id}
                  title={String(id)}
                >
                  <div className="modal-item-row">
                    <div className="modal-item-id">{id}</div>
                    <div className="modal-item-progress">
                      {Number.isFinite(done) && Number.isFinite(total) && total > 0 ? `${done}/${total}` : ""}
                    </div>
                  </div>
                  <div className="modal-item-sub">
                    <span>created: {fmtTs(createdAt)}</span>
                    <span>updated: {fmtTs(updatedAt)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="modal-foot">
          <button className="mode-btn" onClick={onClose} disabled={busy || loading}>
            Vazgeç
          </button>
        </div>
      </div>
    </div>
  );
}
