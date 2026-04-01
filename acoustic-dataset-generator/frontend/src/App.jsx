import { useState, useRef, useCallback, useEffect } from "react";
import "./App.css";
import ConfigPanel from "./components/ConfigPanel";
import PolarView from "./components/PolarView";
import WaveformPanel from "./components/WaveformPanel";
import StatusBar from "./components/StatusBar";
import LabelDisplay from "./components/LabelDisplay";
import { UI_CONFIG } from "./ui.config";
import SweepPanel from "./components/SweepPanel";
import SweepResumeModal from "./components/SweepResumeModal";

// WebSocket URL
// - Tarayıcıdan erişimde: ws://<host>:5173/ws/... -> Vite proxy -> backend:8000
// - Container içinden doğrudan 8000'e bağlanmaya gerek kalmaz
const WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/simulate`;
const API = "/api";

// Sweep state için merkezi kimlik
function newSweepId() {
  return `sweep_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

const C = UI_CONFIG;
const DEFAULT_CONFIG = {
  n_gens:         C.n_gens.default,
  n_mics:         C.n_mics.default,
  mic_radius:     C.mic_radius.default,
  snr_db:         C.snr_db.default,
  rt60:           C.rt60.default,

  // Sources (source_count=1 behaves like single-source)
  source_count: 1,
  sources: [
    { signal_type: C.defaults.signal_type, custom_audio_file: null },
  ],

  field_mode:     C.defaults.field_mode,
  min_distance:   C.defaults.min_distance,
  max_distance:   C.defaults.max_distance,
  step_delay_ms:  C.step_delay_ms.default,
  center_mic:     C.defaults.center_mic,
  room_x:         C.room_x.default,
  room_y:         C.room_y.default,
  room_z:         C.room_z.default,
  mic_center_x:   C.defaults.mic_center_x,
  mic_center_y:   C.defaults.mic_center_y,
  mic_center_z:   C.defaults.mic_center_z,
  sample_rate:    C.defaults.sample_rate,
  ambient_snr_db: C.ambient_snr_db.default,
  ambient_audio_file: null,
  duration_sec:   C.duration_sec.default,
};

const SOUND_SPEED = 343;
function farFieldBoundary(mic_radius, sample_rate) {
  const D = 2 * (Number(mic_radius) || 0);
  const fMax = (Number(sample_rate) || 16000) / 2;
  const lambda = SOUND_SPEED / fMax;
  const v = (2 * D * D) / lambda;
  return Number.isFinite(v) ? parseFloat(v.toFixed(2)) : 0;
}

function roomAbsMaxDistance(cfg) {
  const rx = Number(cfg.room_x ?? 6.0);
  const ry = Number(cfg.room_y ?? 6.0);
  const mcx = cfg.mic_center_x != null ? Number(cfg.mic_center_x) : rx / 2;
  const mcy = cfg.mic_center_y != null ? Number(cfg.mic_center_y) : ry / 2;
  const dists = [
    Math.sqrt(mcx * mcx + mcy * mcy),
    Math.sqrt((rx - mcx) ** 2 + mcy * mcy),
    Math.sqrt(mcx * mcx + (ry - mcy) ** 2),
    Math.sqrt((rx - mcx) ** 2 + (ry - mcy) ** 2),
  ];
  return parseFloat(Math.max(...dists).toFixed(2));
}

function recomputeFarFieldMinMax(cfg) {
  const absMax = roomAbsMaxDistance(cfg);
  const ff = farFieldBoundary(cfg.mic_radius, cfg.sample_rate);
  const min = Math.min(ff, absMax);
  const max = absMax;
  return {
    ...cfg,
    min_distance: parseFloat(min.toFixed(2)),
    max_distance: parseFloat(max.toFixed(2)),
  };
}

export default function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [status, setStatus] = useState("idle"); // idle | connecting | running | done | error | stopped
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [lastLabel, setLastLabel] = useState(null);
  const [waveform, setWaveform] = useState([]);
  const [lastError, setLastError] = useState(null);
  const [sweepOpen, setSweepOpen] = useState(false);
  const [resumeModalOpen, setResumeModalOpen] = useState(false);
  const [resumeModalBusy, setResumeModalBusy] = useState(false);

  // Sweep paneli sadece user açtığında render edilsin
  const hasSweep = !!sweepOpen;

  // Fixed sweep keys (kullanıcının istediği sabit liste)
  const FIXED_SWEEP_KEYS = [
    "source_files_group",
    "snr_db",
    "room_dims",
    "rt60",
    "ambient_snr_db",
    "ambient_audio_file",
  ];

  const [sweepEnabled, setSweepEnabled] = useState(() => {
    const m = {};
    for (const k of FIXED_SWEEP_KEYS) m[k] = true;
    return m;
  });
  const [sweepCounts, setSweepCounts] = useState({});
  const [sweepRanges, setSweepRanges] = useState({});
  const [sweepState, setSweepState] = useState({ running: false, index: 0, total: 0, current: null });
  const sweepStopRef = useRef(false);
  const doneResolverRef = useRef(null);

  const [sweepResume, setSweepResume] = useState(null); // { sweepId, done, total, nextIndex, stateExists }
  const [sweepId, setSweepId] = useState(null);

  // UI açılışta: backend'de sweep state varsa "devam edeyim mi" sorabilmek için
  const [pendingSweepPrompt, setPendingSweepPrompt] = useState(null); // { sweepId, done, total, nextIndex }

  const wsRef = useRef(null);

  function ensureSourcesForConfig(cfg) {
    const count = Math.max(1, Math.min(8, Number(cfg.source_count) || 1));
    const cur = Array.isArray(cfg.sources) ? cfg.sources : [];
    const next = cur.slice(0, count);
    while (next.length < count) next.push({ signal_type: "white_noise", custom_audio_file: null });
    return { ...cfg, source_count: count, sources: next };
  }

  const handleStartWithConfig = useCallback((cfg) => {
    const cfg2 = ensureSourcesForConfig(cfg);

    if (wsRef.current) {
      wsRef.current.close();
    }

    setStatus("connecting");
    setProgress(0);
    setTotal(0);
    setLastLabel(null);
    setWaveform([]);
    setLastError(null);

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connecting");

      const payload = { ...cfg2 };
      const count = Number(cfg2.source_count) || 1;

      payload.sources = (cfg2.sources || []).slice(0, Math.max(1, count));
      delete payload.signal_type;
      delete payload.custom_audio_file;

      ws.send(JSON.stringify(payload));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "session_start") {
        setSessionId(msg.session_id);
        setTotal(msg.total);
        setStatus("running");
      } else if (msg.type === "sample") {
        setProgress(msg.index + 1);
        setLastLabel(msg.label);
        setWaveform(msg.waveform);
      } else if (msg.type === "done") {
        setStatus("done");
        setProgress(msg.total);
        if (doneResolverRef.current) {
          doneResolverRef.current();
          doneResolverRef.current = null;
        }
      } else if (msg.type === "error") {
        setStatus("error");
        setLastError(msg.message);
        if (doneResolverRef.current) {
          doneResolverRef.current();
          doneResolverRef.current = null;
        }
      }
    };

    ws.onerror = () => {
      setStatus("error");
      setLastError("WebSocket connection failed. Is the backend running?");
      if (doneResolverRef.current) {
        doneResolverRef.current();
        doneResolverRef.current = null;
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };
  }, []);

  // ── WebSocket bağlantısını başlat (mevcut Start butonu) ──
  const handleStart = useCallback(() => {
    handleStartWithConfig(config);
  }, [config, handleStartWithConfig]);

  // ── Durdur ──
  const handleStop = useCallback(() => {
    sweepStopRef.current = true;

    // Sweep UI/state'i hemen durdur: kullanıcı Stop'a bastığında panel "running" kalmasın.
    setSweepState((p) => ({ ...p, running: false, current: null }));

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("stopped");

    // Bekleyen sweep adımı varsa resolve et (runSweep await'i açılır)
    if (doneResolverRef.current) {
      doneResolverRef.current();
      doneResolverRef.current = null;
    }
  }, []);

  const toggleSweep = useCallback((key, checked) => {
    // Sweep parametreleri sabit. UI'da toggle gösterilmeyecek.
    // Yine de geriye dönük kullanım olursa diye no-op bırakıyoruz.
    setSweepEnabled((p) => ({ ...p, [key]: checked }));

    // room_x/y/z sweep'i istemiyoruz; bunlar room_dims ile yönetiliyor
    if (key === "room_dims") {
      setSweepEnabled((p) => {
        const q = { ...p, room_dims: checked };
        delete q.room_x;
        delete q.room_y;
        delete q.room_z;
        delete q.room_size;
        return q;
      });
    }

    if (!checked) {
      setSweepCounts((p) => {
        const q = { ...p };
        delete q[key];
        return q;
      });
      setSweepRanges((p) => {
        const q = { ...p };
        delete q[key];
        return q;
      });
    } else {
      setSweepCounts((p) => ({ ...p, [key]: p[key] ?? 2 }));
      setSweepRanges((p) => ({ ...p, [key]: p[key] ?? {} }));
    }
  }, []);

  const setSweepCount = useCallback((key, value) => {
    const n = Math.max(1, Math.min(50, parseInt(value || 1)));
    setSweepCounts((p) => ({ ...p, [key]: n }));
  }, []);

  const setSweepRange = useCallback((key, range) => {
    setSweepRanges((p) => ({ ...p, [key]: range || {} }));
  }, []);

  const fetchSweepResume = useCallback(async () => {
    if (!sweepId) {
      setSweepResume(null);
      return;
    }
    try {
      const res = await fetch(`${API}/sweeps/${encodeURIComponent(sweepId)}`);
      if (!res.ok) {
        setSweepResume(null);
        return;
      }
      const data = await res.json();
      const st = data?.state;
      setSweepResume({
        sweepId,
        done: Number(st?.done ?? 0),
        total: Number(st?.total ?? 0),
        nextIndex: data?.next_index ?? null,
        stateExists: true,
      });
    } catch {
      setSweepResume(null);
    }
  }, [sweepId]);

  useEffect(() => {
    fetchSweepResume();
  }, [fetchSweepResume]);

  const initSweepState = useCallback(async (sid, combos, meta = null) => {
    try {
      const res = await fetch(`${API}/sweeps/${encodeURIComponent(sid)}/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ combos, meta }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  const markSweepStarted = useCallback(async (sid, i, extra = null) => {
    try {
      const qs = extra && typeof extra === "object" ? `?extra=${encodeURIComponent(JSON.stringify(extra))}` : "";
      await fetch(`${API}/sweeps/${encodeURIComponent(sid)}/started/${i}${qs}`, { method: "POST" });
    } catch {}
  }, []);

  const markSweepDone = useCallback(async (sid, i, extra = null) => {
    try {
      const qs = extra && typeof extra === "object" ? `?extra=${encodeURIComponent(JSON.stringify(extra))}` : "";
      await fetch(`${API}/sweeps/${encodeURIComponent(sid)}/done/${i}${qs}`, { method: "POST" });
    } catch {}
  }, []);

  const cleanupSweepState = useCallback(async (sid) => {
    try {
      await fetch(`${API}/sweeps/${encodeURIComponent(sid)}`, { method: "DELETE" });
    } catch {}
  }, []);

  const runSweep = useCallback(async (combos, opts = {}) => {
    if (!Array.isArray(combos) || combos.length === 0) return;

    const resumeFrom = Number.isFinite(opts.resumeFrom) ? opts.resumeFrom : 0;

    // sweepId yoksa üret ve state'i hemen init et
    const sid = opts.sweepId || sweepId || newSweepId();
    setSweepId(sid);
    await initSweepState(sid, combos, { created_by: "frontend" });

    sweepStopRef.current = false;
    setSweepState({ running: true, index: resumeFrom, total: combos.length, current: combos[resumeFrom] ?? null });

    const parseRoomDims = (v) => {
      if (v == null) return null;
      const s = String(v).trim();
      if (!s) return null;
      const cleaned = s.replace(/[()]/g, "");
      const parts = cleaned.split(/\s*,\s*/).filter(Boolean);
      if (parts.length !== 3) return null;
      const nums = parts.map((p) => Number(p));
      if (nums.some((n) => !Number.isFinite(n))) return null;
      return { x: nums[0], y: nums[1], z: nums[2] };
    };

    // Her combo bir session üretir: bu session'ların sweep içindeki sıra numarasını state'e yazıyoruz.
    let sessionOrdinal = resumeFrom;

    // ── Sweep döngüsü: her combo için bir step çalıştır ──
    for (let i = resumeFrom; i < combos.length; i++) {
      if (sweepStopRef.current) break;

      const params = combos[i];
      setSweepState({ running: true, index: i, total: combos.length, current: params });

      if (sweepStopRef.current) break;

      const p2 = { ...params };

      if (p2.room_dims != null) {
        const d = parseRoomDims(p2.room_dims);
        if (d) {
          p2.room_x = d.x;
          p2.room_y = d.y;
          p2.room_z = d.z;
        }
        delete p2.room_dims;
      }

      if (Array.isArray(p2.source_files_group)) {
        const group = p2.source_files_group;
        const sources = group.map((fname) => ({ signal_type: "custom", custom_audio_file: fname }));
        p2.sources = sources;
        p2.source_count = Math.max(1, sources.length);
        delete p2.source_files_group;
      }

      let nextCfg = ensureSourcesForConfig({ ...config, ...p2, sweep_uuid: sid });
      if (nextCfg.field_mode === "farfield") {
        nextCfg = recomputeFarFieldMinMax(nextCfg);
      }

      setConfig(nextCfg);
      if (sweepStopRef.current) break;

      // backend session üretimi
      await new Promise((resolve) => {
        doneResolverRef.current = resolve;
        handleStartWithConfig(nextCfg);
      });

      // Sweep adımını "başladı" olarak işaretle
      await markSweepStarted(sid, sessionOrdinal, { config: nextCfg });

      sessionOrdinal++;
    }

    setSweepState((p) => ({ ...p, running: false, current: null }));

    if (sweepStopRef.current) {
      sweepStopRef.current = false;
      // Durdurulmuşsa, son durumu "done" olarak işaretle
      await markSweepDone(sid, sessionOrdinal - 1, { aborted: true });
    } else {
      // Tamamlandıysa, tümünü done olarak işaretle
      await markSweepDone(sid, sessionOrdinal, { config });
    }

    // Cleanup
    setTimeout(() => {
      cleanupSweepState(sid);
    }, 1000);
  }, [config, handleStartWithConfig, sweepId, initSweepState, markSweepStarted, markSweepDone, cleanupSweepState, fetchSweepResume]);

  // ── Devam Et ──
  const handleResume = useCallback(async () => {
    if (!sweepResume) return;

    const { sweepId, nextIndex } = sweepResume;

    setSweepId(sweepId);
    setSweepState((p) => ({ ...p, running: true, index: nextIndex }));

    // Mevcut konfigürasyonu al
    let cfg = { ...config };
    // Eğer kullanıcı konfigürasyonu değiştirdiyse, yeni ayarları kullan
    if (nextIndex === 0) {
      cfg = ensureSourcesForConfig(cfg);
      if (cfg.field_mode === "farfield") {
        cfg = recomputeFarFieldMinMax(cfg);
      }
      setConfig(cfg);
    }

    // backend session üretimi
    await new Promise((resolve) => {
      doneResolverRef.current = resolve;
      handleStartWithConfig(cfg);
    });

    // Sweep adımını "başladı" olarak işaretle
    await markSweepStarted(sweepId, nextIndex, { config: cfg });

    setSweepState((p) => ({ ...p, running: false, current: null }));

    // Eğer sonrasında başka bir adım yoksa, sweep'i tamamla
    if (sweepResume.done + 1 === sweepResume.total) {
      await markSweepDone(sweepId, nextIndex + 1, { config });
    }
  }, [config, ensureSourcesForConfig, handleStartWithConfig, markSweepDone, markSweepStarted, sweepResume]);

  // ── Temizle ──
  const handleCleanup = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("idle");
    setProgress(0);
    setTotal(0);
    setSessionId(null);
    setLastLabel(null);
    setWaveform([]);
    setLastError(null);
    setSweepOpen(false);
    setSweepId(null);
    setSweepResume(null);

    // Tüm sweep state'lerini temizle
    try {
      await fetch(`${API}/sweeps`, { method: "DELETE" });
    } catch {}
  }, []);

  const requestResumeModal = useCallback(() => {
    setResumeModalOpen(true);
  }, []);

  const handlePickSweepToResume = useCallback(
    async (pickedSweepId) => {
      const sid = String(pickedSweepId || "").trim();
      if (!sid) return;

      setResumeModalBusy(true);
      try {
        const res = await fetch(`${API}/sweeps/${encodeURIComponent(sid)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const nextIndex = Number(data?.next_index ?? 0);
        const st = data?.state;
        const combos = Array.isArray(st?.combos) ? st.combos : null;
        if (!combos) throw new Error("Invalid sweep state");

        setSweepResume({
          sweepId: sid,
          done: Number(st?.done ?? 0),
          total: Number(st?.total ?? combos.length ?? 0),
          nextIndex,
          stateExists: true,
        });

        setResumeModalOpen(false);

        await runSweep(combos, { resumeFrom: nextIndex, sweepId: sid });
      } catch {
        // keep modal open; user can retry or choose another
      } finally {
        setResumeModalBusy(false);
      }
    },
    [runSweep]
  );

  return (
    <div className="app-root">
      <StatusBar
        status={status}
        progress={progress}
        total={total}
        sessionId={sessionId}
        lastError={lastError}
        sweepRunning={!!sweepState?.running}
        sweepIndex={Number(sweepState?.index ?? 0)}
        sweepTotal={Number(sweepState?.total ?? 0)}
      />

      <div className={hasSweep ? "main-layout has-sweep" : "main-layout"}>
        {/* Sol: Sekmeli config */}
        <ConfigPanel
          config={config}
          onChange={setConfig}
          onStart={handleStart}
          onStop={handleStop}
          status={status}
          sweepOpen={sweepOpen}
          onToggleSweepOpen={() => setSweepOpen((v) => !v)}
        />

        {/* Sweep: Output sekmesinden açıldığında görünür */}
        {hasSweep && (
          <aside className="sweep-side">
            <SweepPanel
              sweepEnabled={sweepEnabled}
              sweepCounts={sweepCounts}
              sweepRanges={sweepRanges}
              uiConfig={UI_CONFIG}
              disabled={status === "running" || status === "connecting"}
              onToggle={null}
              onCountChange={setSweepCount}
              onRangeChange={setSweepRange}
              onStart={runSweep}
              onStop={handleStop}
              onResume={(opts) => runSweep(opts.combos, { resumeFrom: opts.resumeFrom, sweepId: opts.sweepId })}
              onRequestResume={() => requestResumeModal()}
              resumeInfo={sweepResume}
              sweepState={sweepState}
            />
          </aside>
        )}

        {/* Orta: Room View */}
        <div className="center-panel">
          <PolarView
            label={lastLabel}
            nMics={config.n_mics}
            micRadius={config.mic_radius}
            centerMic={config.center_mic}
            roomX={config.room_x}
            roomY={config.room_y}
            roomZ={config.room_z}
            fieldMode={config.field_mode}
            minDistance={config.min_distance}
            maxDistance={config.max_distance}
          />
        </div>

        {/* Sağ: Waveform + Label */}
        <aside className="right-panel">
          <WaveformPanel waveform={waveform} />
          <LabelDisplay label={lastLabel} />
        </aside>
      </div>

      <SweepResumeModal
        open={resumeModalOpen}
        busy={resumeModalBusy}
        onClose={() => !resumeModalBusy && setResumeModalOpen(false)}
        onPick={handlePickSweepToResume}
      />
    </div>
  );
}
