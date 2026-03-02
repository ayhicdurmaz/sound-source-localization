"""
FastAPI Main Application
- REST endpoint: POST /api/upload-audio  → özel ses dosyası yükle
- REST endpoint: GET  /api/uploads       → yüklü dosyaları listele
- REST endpoint: DELETE /api/uploads/{filename} → dosya sil
- WebSocket:     WS  /ws/simulate        → her adımda JSON mesajı gönder
"""
import asyncio
import json
import math
import base64
import time
import uuid
import random
import traceback
import os
import shutil

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .simulator import simulate, encode_wav_bytes, SAMPLE_RATE, N_SAMPLES, UPLOADS_DIR
from .dataset_manager import save_sample

app = FastAPI(title="Acoustic Sim Platform API")

# CORS – Vite dev server'a izin ver
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(UPLOADS_DIR, exist_ok=True)

# İzin verilen ses dosyası uzantıları
ALLOWED_EXTENSIONS = {".wav", ".mp3", ".flac", ".ogg", ".m4a"}


# ─────────────────────────────────────────────────────────────
# Yardımcı
# ─────────────────────────────────────────────────────────────
def _to_python(obj):
    if isinstance(obj, (np.floating, np.float32, np.float64)):
        return float(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj


# ─────────────────────────────────────────────────────────────
# Ses dosyası yükleme endpoint'leri
# ─────────────────────────────────────────────────────────────
@app.post("/api/upload-audio")
async def upload_audio(file: UploadFile = File(...)):
    """
    WAV/MP3/FLAC/OGG ses dosyası yükler.
    uploads/ klasörüne kaydeder, dosya adını döndürür.
    """
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Desteklenmeyen format: {ext}. İzin verilenler: {ALLOWED_EXTENSIONS}",
        )

    # Güvenli dosya adı: orijinal adı koru ama çakışmayı önle
    safe_name = f"{uuid.uuid4().hex[:8]}_{file.filename}"
    dest_path = os.path.join(UPLOADS_DIR, safe_name)

    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    return {
        "filename": safe_name,
        "original_name": file.filename,
        "path": dest_path,
        "size_bytes": os.path.getsize(dest_path),
    }


@app.get("/api/uploads")
async def list_uploads():
    """Yüklü ses dosyalarını listeler."""
    files = []
    for fname in sorted(os.listdir(UPLOADS_DIR)):
        ext = os.path.splitext(fname)[1].lower()
        if ext in ALLOWED_EXTENSIONS:
            fpath = os.path.join(UPLOADS_DIR, fname)
            files.append({
                "filename": fname,
                "size_bytes": os.path.getsize(fpath),
            })
    return {"files": files}


@app.delete("/api/uploads/{filename}")
async def delete_upload(filename: str):
    """Yüklü bir ses dosyasını siler."""
    fpath = os.path.join(UPLOADS_DIR, filename)
    if not os.path.isfile(fpath):
        raise HTTPException(status_code=404, detail="Dosya bulunamadı")
    os.remove(fpath)
    return {"deleted": filename}


# ─────────────────────────────────────────────────────────────
# WebSocket endpoint
# ─────────────────────────────────────────────────────────────
@app.websocket("/ws/simulate")
async def ws_simulate(websocket: WebSocket):
    await websocket.accept()
    try:
        # ── 1. Config mesajını bekle ──
        raw = await websocket.receive_text()
        config = json.loads(raw)

        n_samples      = int(config.get("n_samples", 10))
        n_mics         = int(config.get("n_mics", 4))
        mic_radius     = float(config.get("mic_radius", 0.05))
        snr_db         = float(config.get("snr_db", 20))
        rt60           = float(config.get("rt60", 0.3))
        signal_type    = str(config.get("signal_type", "white_noise"))
        field_mode     = str(config.get("field_mode", "nearfield"))
        min_dist       = float(config.get("min_distance", 0.5))
        max_dist       = float(config.get("max_distance", 2.5))
        delay_ms       = float(config.get("step_delay_ms", 200))
        custom_file    = config.get("custom_audio_file", None)
        center_mic     = bool(config.get("center_mic", False))
        ambient_snr_db = float(config.get("ambient_snr_db", 50.0))
        ambient_file   = config.get("ambient_audio_file", None)
        room_x         = float(config.get("room_x", 6.0))
        room_y         = float(config.get("room_y", 6.0))
        room_z         = float(config.get("room_z", 3.0))
        mic_cx         = config.get("mic_center_x", None)
        mic_cy         = config.get("mic_center_y", None)
        mic_cz         = config.get("mic_center_z", None)
        mic_center_x   = float(mic_cx) if mic_cx is not None else None
        mic_center_y   = float(mic_cy) if mic_cy is not None else None
        mic_center_z   = float(mic_cz) if mic_cz is not None else None

        # Fraunhofer far-field sınırı: 2*D²/λ  (D=dizi çapı, λ=c/f_max, f_max=Nyquist=sr/2)
        _D = 2 * mic_radius
        _lambda = 343.0 / (SAMPLE_RATE / 2)
        ff_boundary_m = round(2 * _D * _D / _lambda, 4)

        # Efektif mic merkezi (null → oda ortası)
        eff_cx = mic_center_x if mic_center_x is not None else round(room_x / 2, 4)
        eff_cy = mic_center_y if mic_center_y is not None else round(room_y / 2, 4)
        eff_cz = mic_center_z if mic_center_z is not None else round(room_z / 2, 4)

        # custom_audio_file sadece filename; tam yolu burada oluştur
        custom_audio_path = None
        if signal_type == "custom" and custom_file:
            candidate = os.path.join(UPLOADS_DIR, custom_file)
            if os.path.isfile(candidate):
                custom_audio_path = candidate
            else:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": f"Ses dosyası bulunamadı: {custom_file}",
                }))
                return

        # ambient_audio_file tam yolu
        ambient_audio_path = None
        if ambient_file:
            candidate = os.path.join(UPLOADS_DIR, ambient_file)
            if os.path.isfile(candidate):
                ambient_audio_path = candidate

        session_id = f"session_{int(time.time())}_{uuid.uuid4().hex[:6]}"

        await websocket.send_text(json.dumps({
            "type": "session_start",
            "session_id": session_id,
            "total": n_samples,
        }))

        # ── 2. Döngü ──
        for i in range(n_samples):
            azimuth   = random.uniform(0, 360)
            distance  = random.uniform(min_dist, max_dist)

            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda az=azimuth, di=distance: simulate(
                    azimuth_deg=az,
                    distance_m=di,
                    n_mics=n_mics,
                    mic_radius=mic_radius,
                    snr_db=snr_db,
                    rt60=rt60,
                    signal_type=signal_type,
                    custom_audio_path=custom_audio_path,
                    center_mic=center_mic,
                    ambient_snr_db=ambient_snr_db,
                    ambient_audio_path=ambient_audio_path,
                    room_x=room_x,
                    room_y=room_y,
                    room_z=room_z,
                    mic_center_x=mic_center_x,
                    mic_center_y=mic_center_y,
                    mic_center_z=mic_center_z,
                ),
            )

            mic_signals   = result["mic_signals"]
            source_signal = result["source_signal"]

            label = {
                # ── Örnek kimliği ──
                "sample_index":     i,
                "session_id":       session_id,
                # ── Kaynak konumu ──
                "azimuth_deg":      float(azimuth),
                "distance_m":       float(distance),
                "source_pos":       result["source_pos"],
                "field_mode":       field_mode,
                # ── Mikrofon dizisi ──
                "n_mics":           n_mics,
                "center_mic":       center_mic,
                "mic_radius_m":     mic_radius,
                "mic_center":       [eff_cx, eff_cy, eff_cz],
                # ── Fraunhofer sınırı ──
                "ff_boundary_m":    ff_boundary_m,
                "is_far_field":     float(distance) >= ff_boundary_m,
                # ── Oda ──
                "room_dims_m":      [room_x, room_y, room_z],
                "rt60":             rt60,
                # ── Sinyal & gürültü ──
                "signal_type":      signal_type,
                "custom_audio_file": custom_file,
                "snr_db":           snr_db,
                "ambient_snr_db":   ambient_snr_db,
                # ── Ses formatı ──
                "sample_rate":      SAMPLE_RATE,
                "n_audio_samples":  N_SAMPLES,
            }

            paths = save_sample(session_id, i, mic_signals, label)

            DISPLAY_POINTS = 512
            step = max(1, N_SAMPLES // DISPLAY_POINTS)
            waveform_data = mic_signals[:, ::step].tolist()

            wav_bytes = encode_wav_bytes(mic_signals)
            wav_b64 = base64.b64encode(wav_bytes).decode("ascii")

            msg = {
                "type": "sample",
                "index": i,
                "total": n_samples,
                "label": label,
                "waveform": waveform_data,
                "wav_b64": wav_b64,
                "paths": paths,
            }
            await websocket.send_text(json.dumps(msg))

            await asyncio.sleep(delay_ms / 1000.0)

        await websocket.send_text(json.dumps({
            "type": "done",
            "session_id": session_id,
            "total": n_samples,
        }))

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[ERROR] {e}\n{tb}")
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": str(e),
            }))
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────
# Sağlık kontrolü
# ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────
# Yardımcı: numpy float32 → Python float (JSON serializable)
# ─────────────────────────────────────────────────────────────
def _to_python(obj):
    if isinstance(obj, (np.floating, np.float32, np.float64)):
        return float(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj


# ─────────────────────────────────────────────────────────────
# WebSocket endpoint
# ─────────────────────────────────────────────────────────────
@app.websocket("/ws/simulate")
async def ws_simulate(websocket: WebSocket):
    await websocket.accept()
    try:
        # ── 1. Config mesajını bekle ──
        raw = await websocket.receive_text()
        config = json.loads(raw)

        n_samples      = int(config.get("n_samples", 10))
        n_mics         = int(config.get("n_mics", 4))
        mic_radius     = float(config.get("mic_radius", 0.05))
        snr_db         = float(config.get("snr_db", 20))
        rt60           = float(config.get("rt60", 0.3))
        signal_type    = str(config.get("signal_type", "white_noise"))
        min_dist       = float(config.get("min_distance", 0.5))
        max_dist       = float(config.get("max_distance", 2.5))
        delay_ms       = float(config.get("step_delay_ms", 200))

        session_id = f"session_{int(time.time())}_{uuid.uuid4().hex[:6]}"

        await websocket.send_text(json.dumps({
            "type": "session_start",
            "session_id": session_id,
            "total": n_samples,
        }))

        # ── 2. Döngü ──
        for i in range(n_samples):
            # Rastgele kaynak parametreleri
            azimuth   = random.uniform(0, 360)
            distance  = random.uniform(min_dist, max_dist)

            # Simülasyon (CPU-bound → thread pool'da çalıştır)
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda az=azimuth, di=distance: simulate(
                    azimuth_deg=az,
                    distance_m=di,
                    n_mics=n_mics,
                    mic_radius=mic_radius,
                    snr_db=snr_db,
                    rt60=rt60,
                    signal_type=signal_type,
                ),
            )

            mic_signals   = result["mic_signals"]   # (n_mics, N_SAMPLES) float32
            source_signal = result["source_signal"]  # (N_SAMPLES,) float32

            # ── Label ──
            label = {
                "sample_index": i,
                "session_id": session_id,
                "azimuth_deg": float(azimuth),
                "distance_m": float(distance),
                "source_pos": result["source_pos"],
                "n_mics": n_mics,
                "mic_radius_m": mic_radius,
                "snr_db": snr_db,
                "rt60": rt60,
                "signal_type": signal_type,
                "sample_rate": SAMPLE_RATE,
                "n_audio_samples": N_SAMPLES,
            }

            # ── Diske kaydet ──
            paths = save_sample(session_id, i, mic_signals, label)

            # ── Waveform downsample (görselleştirme için) ──
            # Her kanal için 512 nokta yeterli
            DISPLAY_POINTS = 512
            step = max(1, N_SAMPLES // DISPLAY_POINTS)
            waveform_data = mic_signals[:, ::step].tolist()   # (n_mics, ~DISPLAY_POINTS)

            # ── WAV → base64 (frontend'e audio preview için) ──
            wav_bytes = encode_wav_bytes(mic_signals)
            wav_b64 = base64.b64encode(wav_bytes).decode("ascii")

            # ── WebSocket mesajı gönder ──
            msg = {
                "type": "sample",
                "index": i,
                "total": n_samples,
                "label": label,
                "waveform": waveform_data,
                "wav_b64": wav_b64,
                "paths": paths,
            }
            await websocket.send_text(json.dumps(msg))

            # ── Adımlar arası bekleme ──
            await asyncio.sleep(delay_ms / 1000.0)

        # ── 3. Tamamlandı ──
        await websocket.send_text(json.dumps({
            "type": "done",
            "session_id": session_id,
            "total": n_samples,
        }))

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[ERROR] {e}\n{tb}")
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": str(e),
            }))
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────
# Sağlık kontrolü
# ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}
