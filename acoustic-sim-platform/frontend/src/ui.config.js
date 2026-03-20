/**
 * ui.config.js — Arayüz sabit değerleri
 *
 * Burada yalnızca program içinde dinamik olarak hesaplanmayan
 * slider/input min-max-step-default değerleri tutulur.
 *
 * NOT: min_distance / max_distance / mic_center_x/y/z gibi değerler
 *      oda boyutu ve mic_radius'a göre hesaplandığından BURAYA GİRMEZ.
 */

export const UI_CONFIG = {

  // ── Dataset ──────────────────────────────────────────────
  n_gens: {
    min: 1,
    max: 500,
    step: 1,
    default: 10,
  },

  step_delay_ms: {
    min: 50,
    max: 2000,
    step: 50,
    default: 300,
  },

  // ── Mikrofon ─────────────────────────────────────────────
  n_mics: {
    min: 2,
    max: 15,
    step: 1,
    default: 7,
  },

  mic_radius: {
    min: 0.01,
    max: 1.0,
    step: 0.01,
    default: 0.15,   // metre
  },

  snr_db: {
    min: -10,
    max: 60,
    step: 1,
    default: 40,     // dB — mikrofon öz gürültüsü
  },

  // ── Ortam ────────────────────────────────────────────────
  room_x: {
    min: 2.0,
    max: 20.0,
    step: 0.5,
    default: 10.0,    // metre
  },

  room_y: {
    min: 2.0,
    max: 20.0,
    step: 0.5,
    default: 10.0,    // metre
  },

  room_z: {
    min: 2.0,
    max: 10.0,
    step: 0.5,
    default: 3.0,    // metre
  },

  rt60: {
    min: 0.05,
    max: 2.0,
    step: 0.05,
    default: 0.3,    // saniye
  },

  ambient_snr_db: {
    min: -10,
    max: 60,
    step: 1,
    default: 40,     // dB — ortam gürültüsü (düşük = daha gürültülü)
  },

  // ── Çıktı ────────────────────────────────────────────────
  duration_sec: {
    min: 0.5,
    max: 5.0,
    step: 0.5,
    default: 1.0,    // saniye
  },

  // ── Varsayılan diğer değerler ────────────────────────────
  defaults: {
    signal_type:    "custom",  // "white_noise" | "sine_440hz" | "custom_audio"
    field_mode:     "nearfield",
    min_distance:   0.5,
    max_distance:   2.5,
    center_mic:     true,
    sample_rate:    16000,
    mic_center_x:   null,  // null → oda ortası
    mic_center_y:   null,
    mic_center_z:   null,
  },
};
