import { useState, useRef, useCallback } from "react";
import "./App.css";
import ConfigPanel from "./components/ConfigPanel";
import PolarView from "./components/PolarView";
import WaveformPanel from "./components/WaveformPanel";
import StatusBar from "./components/StatusBar";
import LabelDisplay from "./components/LabelDisplay";
import { UI_CONFIG } from "./ui.config";

// WebSocket URL: Vite proxy üzerinden değil, doğrudan backend'e bağlan
const WS_URL = `ws://${window.location.hostname}:8000/ws/simulate`;

const C = UI_CONFIG;
const DEFAULT_CONFIG = {
  n_samples:      C.n_samples.default,
  n_mics:         C.n_mics.default,
  mic_radius:     C.mic_radius.default,
  snr_db:         C.snr_db.default,
  rt60:           C.rt60.default,
  signal_type:    C.defaults.signal_type,
  custom_audio_file: null,
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
  duration_sec:   C.duration_sec.default,
};

export default function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [status, setStatus] = useState("idle"); // idle | connecting | running | done | error | stopped
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [lastLabel, setLastLabel] = useState(null);
  const [waveform, setWaveform] = useState([]);
  const [lastError, setLastError] = useState(null);

  const wsRef = useRef(null);

  // ── WebSocket bağlantısını başlat ──
  const handleStart = useCallback(() => {
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
      // Config'i JSON olarak gönder
      ws.send(JSON.stringify(config));
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
      } else if (msg.type === "error") {
        setStatus("error");
        setLastError(msg.message);
      }
    };

    ws.onerror = () => {
      setStatus("error");
      setLastError("WebSocket connection failed. Is the backend running?");
    };

    ws.onclose = (e) => {
      if (status !== "done" && status !== "error") {
        setStatus((prev) =>
          prev === "running" ? "stopped" : prev === "connecting" ? "error" : prev
        );
      }
      wsRef.current = null;
    };
  }, [config]);

  // ── Durdur ──
  const handleStop = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("stopped");
  }, []);

  return (
    <div className="app-root">
      <StatusBar
        status={status}
        progress={progress}
        total={total}
        sessionId={sessionId}
        lastError={lastError}
      />

      <div className="main-layout">
        {/* Sol: Sekmeli config */}
        <ConfigPanel
          config={config}
          onChange={setConfig}
          onStart={handleStart}
          onStop={handleStop}
          status={status}
        />

        {/* Orta: Room View — tüm alanı kaplar */}
        <div className="center-panel">
          <PolarView
            label={lastLabel}
            nMics={config.n_mics}
            micRadius={config.mic_radius}
            centerMic={config.center_mic}
            roomX={config.room_x}
            roomY={config.room_y}
            micCenterX={config.mic_center_x}
            micCenterY={config.mic_center_y}
            sampleRate={config.sample_rate}
          />
        </div>

        {/* Sağ: Waveform sütun + Label */}
        <aside className="right-panel">
          <WaveformPanel waveform={waveform} />
          <LabelDisplay label={lastLabel} />
        </aside>
      </div>
    </div>
  );
}
