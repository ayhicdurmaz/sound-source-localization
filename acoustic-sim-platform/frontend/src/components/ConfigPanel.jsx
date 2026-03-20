/**
 * ConfigPanel – Sekmeli konfigürasyon paneli.
 * Sekmeler: Dataset | Mikrofon | Ortam | Çıktı
 */
import React, { useState, useMemo } from "react";
import AudioUpload from "./AudioUpload";
import { UI_CONFIG as C } from "../ui.config";

const SIGNAL_TYPES = [
  { value: "white_noise", label: "White Noise" },
  { value: "sine", label: "Sine Wave" },
  { value: "custom", label: "Custom Audio" },
];

const TABS = [
  { id: "dataset", label: "📊 Dataset" },
  { id: "mic",     label: "🎙 Mikrofon" },
  { id: "env",     label: "🏠 Ortam"   },
  { id: "output",  label: "💾 Çıktı"   },
];

// Fraunhofer uzak alan sınırı: d_ff = 2*D²/λ  (D=dizi çapı, λ=c/f_max)
const SOUND_SPEED = 343;    // m/s

function farFieldBoundary(mic_radius, sample_rate) {
  const D = 2 * mic_radius;                       // dizi çapı
  const fMax = (sample_rate ?? 16000) / 2;        // Nyquist frekansı
  const lambda = SOUND_SPEED / fMax;              // dalga boyu
  return parseFloat((2 * D * D / lambda).toFixed(2));
}

// Near-field: dizi yarıçapının hemen dışından başlar, Fraunhofer sınırının hemen altına kadar
function nearFieldMin(mic_radius) {
  return parseFloat((mic_radius * 1.2).toFixed(2));
}
function nearFieldMax(mic_radius, sample_rate) {
  // Fraunhofer sınırının hemen altı — en az nfMin + 0.5m olsun
  const ff = farFieldBoundary(mic_radius, sample_rate);
  const raw = ff * 0.99;
  const minSensible = nearFieldMin(mic_radius) + 0.5;
  return parseFloat(Math.max(raw, minSensible).toFixed(2));
}

function SliderField({ label, name, min, max, step, value, onChange, unit }) {
  return (
    <div className="field">
      <div className="field-header">
        <label htmlFor={name}>{label}</label>
        <span className="field-value">{value}{unit}</span>
      </div>
      <input
        id={name}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(name, parseFloat(e.target.value))}
      />
    </div>
  );
}

function NumberField({ label, name, min, max, step, value, onChange, unit }) {
  return (
    <div className="field">
      <div className="field-header">
        <label htmlFor={name}>{label}</label>
        <input
          id={name}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(name, parseFloat(e.target.value))}
          className="number-input"
        />
        {unit && <span className="field-unit">{unit}</span>}
      </div>
    </div>
  );
}

export default function ConfigPanel({ config, onChange, onStart, onStop, status }) {
  const [activeTab, setActiveTab] = useState("dataset");
  const isRunning = status === "running";

  function set(name, value) {
    let updated = { ...config, [name]: value };
    // mic_radius veya oda boyutu değişince far-field artık mümkün olmayabilir
    if (name === "mic_radius" || name === "room_x" || name === "room_y") {
      const newRX = updated.room_x ?? 6.0;
      const newRY = updated.room_y ?? 6.0;
      const newMcx = updated.mic_center_x != null ? updated.mic_center_x : newRX / 2;
      const newMcy = updated.mic_center_y != null ? updated.mic_center_y : newRY / 2;
      const newAbsMax = parseFloat(Math.max(
        Math.sqrt(newMcx ** 2 + newMcy ** 2),
        Math.sqrt((newRX - newMcx) ** 2 + newMcy ** 2),
        Math.sqrt(newMcx ** 2 + (newRY - newMcy) ** 2),
        Math.sqrt((newRX - newMcx) ** 2 + (newRY - newMcy) ** 2),
      ).toFixed(2));
      const newFF = farFieldBoundary(updated.mic_radius, updated.sample_rate);
      if (newFF >= newAbsMax) {
        // Far-field artık mümkün değil → near-field'a zorla geç
        const nMin = nearFieldMin(updated.mic_radius);
        const forcedMin = parseFloat(Math.min(Math.max(updated.min_distance, nMin), newAbsMax).toFixed(2));
        const forcedMax = parseFloat(Math.min(Math.max(updated.max_distance, nMin), newAbsMax).toFixed(2));
        updated = {
          ...updated,
          field_mode: "nearfield",
          min_distance: forcedMin < forcedMax ? forcedMin : nMin,
          max_distance: forcedMin < forcedMax ? forcedMax : newAbsMax,
        };
      }
    }
    onChange(updated);
  }

  // Far-field / near-field hesaplamaları
  const ffBoundary = useMemo(() => farFieldBoundary(config.mic_radius, config.sample_rate), [config.mic_radius, config.sample_rate]);
  const nfMin      = useMemo(() => nearFieldMin(config.mic_radius),                          [config.mic_radius]);
  const nfMax      = useMemo(() => nearFieldMax(config.mic_radius, config.sample_rate),      [config.mic_radius, config.sample_rate]);

  // Oda boyutuna göre maksimum erişilebilir mesafe hesabı:
  // Mic merkezi (cx, cy) iken herhangi bir azimuth açısında gidilebilecek
  // maksimum mesafe = mic merkezinden 4 duvara olan mesafelerin maksimumu
  // (en uzak köşeye olan mesafe — backend zaten clip ediyor ama bunu da
  //  azimuth-aware yapmak için backend'e bırakıp slider üst sınırını
  //  "mic merkezinden en uzak köşe" olarak kullanıyoruz)
  const roomX = config.room_x ?? 6.0;
  const roomY = config.room_y ?? 6.0;
  const mcx = config.mic_center_x != null ? config.mic_center_x : roomX / 2;
  const mcy = config.mic_center_y != null ? config.mic_center_y : roomY / 2;

  // Mic merkezinden 4 köşeye olan mesafeler — en büyüğü gerçek üst sınır
  const cornerDists = [
    Math.sqrt(mcx * mcx + mcy * mcy),                          // (0,0)
    Math.sqrt((roomX - mcx) ** 2 + mcy * mcy),                 // (rx,0)
    Math.sqrt(mcx * mcx + (roomY - mcy) ** 2),                 // (0,ry)
    Math.sqrt((roomX - mcx) ** 2 + (roomY - mcy) ** 2),        // (rx,ry)
  ];
  const absMaxDist = parseFloat(Math.max(...cornerDists).toFixed(2));

  // Far-field bu odada fiziksel olarak mümkün mü?
  // ffBoundary < absMaxDist olmalı, yoksa oda çok küçük demek
  const farFieldPossible = ffBoundary < absMaxDist;

  // Eğer far-field seçili ama artık mümkün değilse → render'da near-field gibi davran
  const effectiveMode = (config.field_mode === "farfield" && !farFieldPossible)
    ? "nearfield"
    : config.field_mode;
  const isFar = effectiveMode === "farfield";

  // Aktif mod için sınırlar — distMin her zaman <= distMax garantili
  const distMin = isFar ? ffBoundary : nfMin;
  const distMax = isFar
    ? absMaxDist          // far:  ffBoundary  → odaMax
    : ffBoundary;         // near: nfMin       → ffBoundary (ff sınırının altı)

  // Mod değişince değerleri yeni aralığa clamp et / aç
  function setFieldMode(mode) {
    // Far-field mümkün değilse geçişi engelle
    if (mode === "farfield" && !farFieldPossible) return;

    const newFar = mode === "farfield";
    const newMin = newFar ? ffBoundary : nfMin;
    const newMax = newFar ? absMaxDist : ffBoundary;

    const clampedMin = Math.min(Math.max(config.min_distance, newMin), newMax);
    const clampedMax = Math.min(Math.max(config.max_distance, newMin), newMax);

    // Eğer ikisi de aynı değere sıkıştıysa tam aralığa reset et
    const finalMin = clampedMin < clampedMax ? clampedMin : newMin;
    const finalMax = clampedMin < clampedMax ? clampedMax : newMax;

    onChange({
      ...config,
      field_mode: mode,
      min_distance: parseFloat(finalMin.toFixed(2)),
      max_distance: parseFloat(finalMax.toFixed(2)),
    });
  }

  // Mesafe slider'ı değişince diğerini bozma ama clamp et
  function setDist(name, val) {
    const clamped = Math.min(Math.max(val, distMin), distMax);
    if (name === "min_distance") {
      const newMax = Math.min(Math.max(config.max_distance, clamped), distMax);
      onChange({ ...config, min_distance: clamped, max_distance: newMax });
    } else {
      const newMin = Math.max(Math.min(config.min_distance, clamped), distMin);
      onChange({ ...config, max_distance: clamped, min_distance: newMin });
    }
  }

  const canStart =
    config.signal_type !== "custom" || !!config.custom_audio_file;

  return (
    <aside className="config-panel">
      {/* Sekme başlıkları */}
      <div className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? "active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Dataset ── */}
      {activeTab === "dataset" && (
        <div className="tab-content">
          <SliderField label="Toplam Üretim" name="n_gens"
            min={C.n_gens.min} max={C.n_gens.max} step={C.n_gens.step}
            value={config.n_gens} onChange={set} unit="" />
          <SliderField label="Step Delay" name="step_delay_ms"
            min={C.step_delay_ms.min} max={C.step_delay_ms.max} step={C.step_delay_ms.step}
            value={config.step_delay_ms} onChange={set} unit=" ms" />

          <div className="section-divider">Kaynak Sinyali</div>

          <div className="field">
            <div className="field-header">
              <label>Signal Type</label>
            </div>
            <select value={config.signal_type}
              onChange={(e) => onChange({ ...config, signal_type: e.target.value, custom_audio_file: null })}>
              {SIGNAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {config.signal_type === "custom" && (
            <AudioUpload
              selectedFile={config.custom_audio_file}
              onSelect={(f) => set("custom_audio_file", f)}
            />
          )}
          {config.signal_type === "custom" && !config.custom_audio_file && (
            <div className="warn-box">⚠ Bir ses dosyası seçin veya yükleyin</div>
          )}
        </div>
      )}

      {/* ── Mikrofon ── */}
      {activeTab === "mic" && (
        <div className="tab-content">
          <SliderField label="Mikrofon Sayısı" name="n_mics"
            min={C.n_mics.min} max={C.n_mics.max} step={C.n_mics.step}
            value={config.n_mics} onChange={set} unit="" />
          <SliderField label="Dizi Yarıçapı" name="mic_radius"
            min={C.mic_radius.min} max={C.mic_radius.max} step={C.mic_radius.step}
            value={config.mic_radius} onChange={set} unit=" m" />

          <div className="section-divider">Merkez Mikrofon</div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={!!config.center_mic}
              onChange={(e) => set("center_mic", e.target.checked)}
            />
            <span>Dizinin merkezine ek mikrofon ekle</span>
          </label>
          <div className="info-box" style={{ marginTop: "6px" }}>
            Merkez mikrofon çemberin tam ortasına yerleştirilir (C).
            Toplam mikrofon sayısı: <strong>{config.n_mics + (config.center_mic ? 1 : 0)}</strong>.
          </div>

          <div className="section-divider">Dizi Konumu</div>

          <div className="field">
            <div className="field-header">
              <label>Merkez X</label>
              <span className="field-value">
                {config.mic_center_x != null
                  ? `${config.mic_center_x} m`
                  : `${((config.room_x ?? 6.0) / 2).toFixed(1)} m (oda ortası)`}
              </span>
            </div>
            <input type="range"
              min={0.5} max={(config.room_x ?? 6.0) - 0.5} step={0.1}
              value={config.mic_center_x ?? (config.room_x ?? 6.0) / 2}
              onChange={(e) => set("mic_center_x", parseFloat(e.target.value))}
            />
          </div>
          <div className="field">
            <div className="field-header">
              <label>Merkez Y</label>
              <span className="field-value">
                {config.mic_center_y != null
                  ? `${config.mic_center_y} m`
                  : `${((config.room_y ?? 6.0) / 2).toFixed(1)} m (oda ortası)`}
              </span>
            </div>
            <input type="range"
              min={0.5} max={(config.room_y ?? 6.0) - 0.5} step={0.1}
              value={config.mic_center_y ?? (config.room_y ?? 6.0) / 2}
              onChange={(e) => set("mic_center_y", parseFloat(e.target.value))}
            />
          </div>
          <div className="field">
            <div className="field-header">
              <label>Merkez Z</label>
              <span className="field-value">
                {config.mic_center_z != null
                  ? `${config.mic_center_z} m`
                  : `${((config.room_z ?? 3.0) / 2).toFixed(1)} m (oda ortası)`}
              </span>
            </div>
            <input type="range"
              min={0.5} max={Math.max(0.6, (config.room_z ?? 3.0) - 0.5)} step={0.1}
              value={config.mic_center_z ?? (config.room_z ?? 3.0) / 2}
              onChange={(e) => set("mic_center_z", parseFloat(e.target.value))}
            />
          </div>
          <button
            style={{ fontSize: 11, padding: "3px 12px", marginTop: 4, width: "auto", height: "auto" }}
            className="mode-btn"
            onClick={() => onChange({ ...config, mic_center_x: null, mic_center_y: null, mic_center_z: null })}>
            ↩ Oda ortasına sıfırla
          </button>

          <div className="section-divider">Mikrofon Gürültüsü</div>

          <SliderField label="Öz Gürültü (SNR)" name="snr_db"
            min={C.snr_db.min} max={C.snr_db.max} step={C.snr_db.step}
            value={config.snr_db} onChange={set} unit=" dB" />

          <div className="info-box">
            SNR değeri yükseldikçe mikrofon öz gürültüsü azalır.
            60 dB ≈ susturucu mikrofon.
          </div>
        </div>
      )}

      {/* ── Ortam ── */}
      {activeTab === "env" && (
        <div className="tab-content">
          <div className="section-divider">Oda Boyutları</div>

          <SliderField label="Oda Genişliği (X)" name="room_x"
            min={C.room_x.min} max={C.room_x.max} step={C.room_x.step}
            value={config.room_x ?? C.room_x.default} onChange={set} unit=" m" />
          <SliderField label="Oda Derinliği (Y)" name="room_y"
            min={C.room_y.min} max={C.room_y.max} step={C.room_y.step}
            value={config.room_y ?? C.room_y.default} onChange={set} unit=" m" />
          <SliderField label="Tavan Yüksekliği (Z)" name="room_z"
            min={C.room_z.min} max={C.room_z.max} step={C.room_z.step}
            value={config.room_z ?? C.room_z.default} onChange={set} unit=" m" />

          <div className="section-divider">Oda Akustiği</div>

          <SliderField label="RT60 (yankı süresi)" name="rt60"
            min={C.rt60.min} max={C.rt60.max} step={C.rt60.step}
            value={config.rt60} onChange={set} unit=" s" />

          <div className="section-divider">Kaynak Konumu Modu</div>

          <div className="field-mode-row">
            <button
              className={`mode-btn ${config.field_mode === "nearfield" ? "active" : ""}`}
              onClick={() => setFieldMode("nearfield")}
            >📍 Near Field</button>
            <button
              className={`mode-btn ${config.field_mode === "farfield" ? "active" : ""}`}
              onClick={() => setFieldMode("farfield")}
              disabled={!farFieldPossible}
              title={!farFieldPossible ? `Far-field bu odada mümkün değil (ff sınırı ${ffBoundary}m > oda max ${absMaxDist}m)` : ""}
            >🔭 Far Field</button>
          </div>

          {effectiveMode === "nearfield" ? (
            <div className="info-box">
              <strong>Near Field</strong>: Küresel dalga — kaynak yakın, dalga cephesi eğri.<br/>
              Aralık: <strong>{nfMin} m → {distMax} m</strong><br/>
              <small>
                2D²/λ &nbsp;|&nbsp; D={`${(2*config.mic_radius).toFixed(2)}`}m,
                λ={`${(SOUND_SPEED / ((config.sample_rate ?? 16000) / 2)).toFixed(4)}`}m
                @ {`${((config.sample_rate ?? 16000) / 2 / 1000).toFixed(1)}`}kHz (Nyquist)
                &nbsp;|&nbsp; ff sınırı={ffBoundary}m
                {!farFieldPossible && <span style={{color:"#f87171"}}> &nbsp;⚠ ff sınırı odadan büyük, far-field devre dışı</span>}
              </small>
            </div>
          ) : (
            <div className="info-box">
              <strong>Far Field</strong>: Düzlemsel dalga — kaynak uzak, dalga cephesi düz.<br/>
              Aralık: <strong>{ffBoundary} m → {absMaxDist} m</strong><br/>
              <small>
                2D²/λ &nbsp;|&nbsp; D={`${(2*config.mic_radius).toFixed(2)}`}m,
                λ={`${(SOUND_SPEED / ((config.sample_rate ?? 16000) / 2)).toFixed(4)}`}m
                @ {`${((config.sample_rate ?? 16000) / 2 / 1000).toFixed(1)}`}kHz (Nyquist)
                &nbsp;|&nbsp; oda maks={absMaxDist}m
              </small>
            </div>
          )}

          <SliderField label="Min Mesafe" name="min_distance"
            min={distMin} max={distMax} step={0.05}
            value={Math.min(Math.max(config.min_distance, distMin), distMax)}
            onChange={setDist} unit=" m" />
          <SliderField label="Max Mesafe" name="max_distance"
            min={distMin} max={distMax} step={0.05}
            value={Math.min(Math.max(config.max_distance, distMin), distMax)}
            onChange={setDist} unit=" m" />

          <div className="section-divider">Ortam Gürültüsü</div>

          <SliderField label="Ortam SNR (düşük = daha gürültülü)" name="ambient_snr_db"
            min={C.ambient_snr_db.min} max={C.ambient_snr_db.max} step={C.ambient_snr_db.step}
            value={config.ambient_snr_db ?? C.ambient_snr_db.default} onChange={set} unit=" dB" />

          <div className="info-box">
            <strong>Ortam SNR</strong> — arka plan gürültüsünün kaynak sinyaline oranı.<br/>
            <strong>Düşük dB</strong> (ör. 5): gürültülü ortam (trafik, kalabalık).<br/>
            <strong>Yüksek dB</strong> (ör. 50): sessiz oda.<br/><br/>
            Dosya seçilirse o dosyadan segment alınır, seçilmezse Gaussian gürültü kullanılır.
            Bu gürültü <em>mikrofon öz gürültüsünden</em> (🎙 SNR) bağımsız olarak üstüne eklenir.
          </div>

          <div className="field">
            <div className="field-header"><label>Ortam Gürültüsü Dosyası</label></div>
            <AudioUpload
              selectedFile={config.ambient_audio_file ?? null}
              onSelect={(f) => set("ambient_audio_file", f)}
            />
          </div>
        </div>
      )}

      {/* ── Çıktı ── */}
      {activeTab === "output" && (
        <div className="tab-content">
          <div className="section-divider">Ses Formatı</div>

          <div className="field">
            <div className="field-header"><label>Sample Rate</label></div>
            <select value={config.sample_rate ?? 16000}
              onChange={(e) => set("sample_rate", parseInt(e.target.value))}>
              <option value={8000}>8 000 Hz</option>
              <option value={16000}>16 000 Hz</option>
              <option value={22050}>22 050 Hz</option>
              <option value={44100}>44 100 Hz</option>
            </select>
          </div>

          <SliderField label="Süre" name="duration_sec"
            min={C.duration_sec.min} max={C.duration_sec.max} step={C.duration_sec.step}
            value={config.duration_sec ?? C.duration_sec.default} onChange={set} unit=" s" />

          <div className="section-divider">Kayıt</div>

          <div className="info-box">
            Dataset dosyaları otomatik olarak
            <code> /datasets/&lt;session_id&gt;/ </code>
            klasörüne kaydedilir.
          </div>
        </div>
      )}

      {/* ── Start / Stop butonu — her zaman altta ── */}
      <div className="config-footer">
        {!isRunning ? (
          <button
            className="btn btn-start"
            onClick={onStart}
            disabled={!canStart}
            title={!canStart ? "Önce ses dosyası seçin" : ""}
          >
            ▶ Start Auto Dataset
          </button>
        ) : (
          <button className="btn btn-stop" onClick={onStop}>
            ■ Stop
          </button>
        )}
      </div>
    </aside>
  );
}
