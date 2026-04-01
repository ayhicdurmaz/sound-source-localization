/**
 * SweepPanel – seçilen parametrelerden kombinasyon üretir ve sırayla çalıştırır.
 * Backend'e dokunmadan, WS üzerinden session'ları ardışık üretir.
 */
import React, { useMemo, useEffect, useState } from "react";

const API = "/api";

function AudioPickList({ kind, selected, onChange, disabled }) {
  const [files, setFiles] = useState([]);

  async function fetchFiles() {
    try {
      // backend kind: source | ambient
      const effectiveKind = kind === "sources" ? "source" : kind;
      const res = await fetch(`${API}/uploads?kind=${encodeURIComponent(effectiveKind)}`);
      const data = await res.json();
      setFiles(data.files || []);
    } catch {
      setFiles([]);
    }
  }

  useEffect(() => {
    fetchFiles();
  }, [kind]);

  const toggle = (fname) => {
    const cur = new Set(selected || []);
    if (cur.has(fname)) cur.delete(fname);
    else cur.add(fname);
    onChange(Array.from(cur));
  };

  return (
    <div style={{ marginTop: "8px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          marginBottom: "6px",
        }}
      >
        <span className="panel-subtitle">{kind === "ambient" ? "Ambient dosyaları" : "Kaynak dosyaları"}</span>
        <button
          className="btn-upload"
          onClick={fetchFiles}
          disabled={disabled}
          title="Listeyi yenile"
        >
          ↻
        </button>
      </div>

      {files.length === 0 ? (
        <div className="audio-upload-empty">
          Henüz dosya yok.
          <br />
          <span style={{ opacity: 0.5, fontSize: "10px" }}>
            {kind === "ambient" ? "ConfigPanel'de ambient yükle" : "ConfigPanel'de kaynak yükle"}
          </span>
        </div>
      ) : (
        <div className="audio-pick-grid" style={{ maxHeight: "180px" }}>
          {files.map((f) => {
            const checked = (selected || []).includes(f.filename);
            const displayName = f.filename.split("_").slice(1).join("_") || f.filename;
            return (
              <button
                key={f.filename}
                type="button"
                className={`audio-pick-pill ${checked ? "selected" : ""}`}
                onClick={() => !disabled && toggle(f.filename)}
                title={f.filename}
                disabled={disabled}
              >
                <span className="audio-pick-ind">{checked ? "●" : "○"}</span>
                <span className="audio-pick-name">{displayName}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function quantize(x, step) {
  if (!Number.isFinite(step) || step <= 0) return x;
  return Math.round(x / step) * step;
}

function linspace(min, max, n, step) {
  const nn = clampInt(n, 1, 999);
  if (nn === 1) return [quantize(min, step)];
  const out = [];
  for (let i = 0; i < nn; i++) {
    const t = i / (nn - 1);
    out.push(quantize(min + (max - min) * t, step));
  }
  // uniq (quantize aynı değere düşürürse)
  return Array.from(new Set(out.map((v) => Number(v.toFixed(10)))));
}

function cartesianProduct(map) {
  const keys = Object.keys(map);
  const out = [];
  const rec = (i, cur) => {
    if (i === keys.length) {
      out.push({ ...cur });
      return;
    }
    const k = keys[i];
    for (const v of map[k]) {
      cur[k] = v;
      rec(i + 1, cur);
    }
  };
  rec(0, {});
  return out;
}

function parseValueList(text) {
  if (text == null) return [];
  const s = String(text).trim();
  if (!s) return [];
  return s
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => Number(t))
    .filter((v) => Number.isFinite(v));
}

function splitTopLevelComma(s) {
  const out = [];
  let cur = "";
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);

    if (ch === "," && depth === 0) {
      const t = cur.trim();
      if (t) out.push(t);
      cur = "";
    } else {
      cur += ch;
    }
  }
  const t = cur.trim();
  if (t) out.push(t);
  return out;
}

function parseAnyList(text) {
  if (text == null) return [];
  const s = String(text).trim();
  if (!s) return [];

  // 1) newline ile satırlara böl
  // 2) her satırda: parantez içini bozmadan top-level virgül ile ayır
  const lines = s.split(/\n+/).map((t) => t.trim()).filter(Boolean);

  const out = [];
  for (const line of lines) {
    for (const part of splitTopLevelComma(line)) {
      const v = part.trim();
      if (v) out.push(v);
    }
  }

  return out;
}

function normalizeGroup(arr) {
  const uniq = Array.from(new Set((arr || []).filter(Boolean)));
  // sıra önemsiz: canonical için sıralayıp saklıyoruz
  return uniq.sort((a, b) => a.localeCompare(b));
}

function groupKey(group) {
  return normalizeGroup(group).join("|");
}

function SourceGroupSweep({ disabled, groupList, onChangeGroups }) {
  const [current, setCurrent] = useState([]);

  const addGroup = () => {
    const g = normalizeGroup(current);
    if (g.length === 0) return;

    const next = Array.isArray(groupList) ? [...groupList] : [];
    const seen = new Set(next.map(groupKey));
    if (!seen.has(groupKey(g))) next.push(g);

    onChangeGroups(next);
    setCurrent([]);
  };

  const removeGroup = (idx) => {
    const next = (Array.isArray(groupList) ? [...groupList] : []).filter((_, i) => i !== idx);
    onChangeGroups(next);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div className="sweep-mini" style={{ marginBottom: 6 }}>DOSYALARI SEÇ → GRUP EKLE</div>

      <AudioPickList kind="source" selected={current} onChange={setCurrent} disabled={disabled} />

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          type="button"
          className="mode-btn"
          onClick={addGroup}
          disabled={disabled || current.length === 0}
          title="Seçili dosyalardan bir grup oluştur"
        >
          + Grup ekle ({current.length})
        </button>

        <button
          type="button"
          className="mode-btn"
          onClick={() => setCurrent([])}
          disabled={disabled || current.length === 0}
          title="Geçerli seçimi temizle"
        >
          Temizle
        </button>
      </div>

      <div className="sweep-values">
        <code>
          {Array.isArray(groupList) && groupList.length
            ? JSON.stringify(groupList)
            : "[]"}
        </code>
      </div>

      {Array.isArray(groupList) && groupList.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {groupList.map((g, idx) => (
            <div key={groupKey(g) + idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <strong style={{ color: "var(--text)" }}>#{idx + 1}</strong>&nbsp; {g.join(", ")}
              </div>
              <button
                type="button"
                className="btn-upload"
                onClick={() => removeGroup(idx)}
                disabled={disabled}
                title="Grubu kaldır"
              >
                sil
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function SweepPanel({
  sweepEnabled,
  sweepCounts,
  uiConfig,
  disabled,
  onToggle,
  onCountChange,
  onStart,
  onStop,
  sweepState,
  sweepRanges,
  onRangeChange,
  resumeInfo,
  onResume,
  onRequestResume,
}) {
  // Sweep keys artık sabit ve dışarıdan zaten true geliyor.
  const keys = useMemo(
    () => Object.keys(sweepEnabled || {}).filter((k) => !!sweepEnabled[k]),
    [sweepEnabled]
  );

  const valueMap = useMemo(() => {
    const m = {};
    for (const k of keys) {
      const meta = uiConfig?.[k];
      if (!meta && k !== "ambient_audio_file" && k !== "room_dims" && k !== "source_files_group" && k !== "source_audio_file") continue;

      const r = sweepRanges?.[k] || {};

      if (k === "ambient_audio_file") {
        const list = Array.isArray(r.files) ? r.files : [];
        m[k] = Array.from(new Set(list));
        continue;
      }

      // NEW: source files as group (array-of-arrays)
      if (k === "source_files_group") {
        const groupsRaw = Array.isArray(r.groups) ? r.groups : [];
        const groups = groupsRaw
          .map((g) => normalizeGroup(Array.isArray(g) ? g : []))
          .filter((g) => g.length > 0);
        // uniq by canonical key
        const uniq = [];
        const seen = new Set();
        for (const g of groups) {
          const kk = groupKey(g);
          if (seen.has(kk)) continue;
          seen.add(kk);
          uniq.push(g);
        }
        m[k] = uniq;
        continue;
      }

      // legacy: single source file sweep
      if (k === "source_audio_file") {
        const list = Array.isArray(r.files) ? r.files : [];
        m[k] = Array.from(new Set(list));
        continue;
      }

      if (k === "room_dims") {
        const list = parseAnyList(r.values);
        m[k] = Array.from(new Set(list));
        continue;
      }

      const manual = parseValueList(r.values);
      m[k] = Array.from(new Set(manual.map((v) => Number(v.toFixed(10)))));
    }
    return m;
  }, [keys, uiConfig, sweepRanges]);

  const combos = useMemo(() => cartesianProduct(valueMap), [valueMap]);
  const canRun = combos.length > 0 && keys.every((k) => (valueMap?.[k]?.length ?? 0) > 0);

  const running = !!sweepState?.running;
  const total = Number(sweepState?.total ?? combos.length ?? 0);
  const index = Number(sweepState?.index ?? 0);

  const canResume =
    !running &&
    !!resumeInfo?.stateExists &&
    Number.isFinite(resumeInfo?.nextIndex) &&
    (resumeInfo?.nextIndex ?? 0) < (resumeInfo?.total ?? Infinity);

  return (
    <div className="sweep-panel">
      <div className="sweep-head">
        <div>
          <div className="sweep-title">Sweep</div>
          <div className="sweep-sub">
            {keys.length === 0 ? "Kapalı" : `${keys.length} ayar · ${canRun ? combos.length : 0} session`}
            {canResume ? (
              <span style={{ marginLeft: 8, color: "var(--accent-yellow)" }}>
                · kaldığın yer: {Number(resumeInfo.nextIndex) + 1}/{Number(resumeInfo.total)}
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {running ? (
            <button className="mode-btn" onClick={onStop} disabled={disabled}>
              Stop
            </button>
          ) : (
            <>
              {canResume ? (
                <button
                  className="mode-btn"
                  onClick={() => (onRequestResume ? onRequestResume({ combos }) : onResume?.({ combos, resumeFrom: Number(resumeInfo.nextIndex), sweepId: resumeInfo.sweepId }))}
                  disabled={disabled}
                  title="Kayıtlı sweep bulundu – kaldığın yerden devam et"
                >
                  Devam et
                </button>
              ) : null}

              <button className="mode-btn" onClick={() => onStart(combos)} disabled={disabled || !canRun}>
                Run ({canRun ? combos.length : 0})
              </button>
            </>
          )}
        </div>
      </div>

      {keys.length === 0 ? (
        <div className="info-box" style={{ marginTop: 8 }}>
          Output sekmesinden Sweep Panelini aç.
        </div>
      ) : (
        <div className="sweep-list">
          {keys.map((k) => {
            const meta = uiConfig?.[k];
            const values = valueMap?.[k] || [];
            const r = sweepRanges?.[k] || {};
            const valuesText = r.values != null ? r.values : "";

            const title = meta?.label ?? (k === "source_audio_file" ? "Kaynak dosyası" : k);

            return (
              <div key={k} className="sweep-item">
                <div className="sweep-row">
                  <div className="sweep-toggle on" title={k}>
                    <span className="sweep-dot" aria-hidden="true" />
                    <span className="sweep-key">{title}</span>
                  </div>

                  <div className="sweep-item-right">
                    <span className="sweep-mini">SWEEP</span>
                    <span className="sweep-count">{values.length}</span>
                  </div>
                </div>

                {k === "ambient_audio_file" ? (
                  <AudioPickList
                    kind="ambient"
                    selected={Array.isArray(r.files) ? r.files : []}
                    onChange={(files) => onRangeChange?.(k, { ...r, files })}
                    disabled={disabled}
                  />
                ) : k === "source_files_group" ? (
                  <SourceGroupSweep
                    disabled={disabled}
                    groupList={Array.isArray(r.groups) ? r.groups : []}
                    onChangeGroups={(groups) => onRangeChange?.(k, { ...r, groups })}
                  />
                ) : k === "source_audio_file" ? (
                  <AudioPickList
                    kind="source"
                    selected={Array.isArray(r.files) ? r.files : []}
                    onChange={(files) => onRangeChange?.(k, { ...r, files })}
                    disabled={disabled}
                  />
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <textarea
                      className="text-input"
                      placeholder="Örn: 0.1, 0.2, 0.3"
                      value={valuesText}
                      onChange={(e) => onRangeChange?.(k, { ...r, values: e.target.value })}
                      disabled={disabled}
                      rows={3}
                    />

                    <div className="sweep-values">
                      <code>{JSON.stringify(values)}</code>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {running ? (
        <div className="info-box" style={{ marginTop: 10 }}>
          Çalışıyor: {index + 1}/{total}
        </div>
      ) : null}
    </div>
  );
}
