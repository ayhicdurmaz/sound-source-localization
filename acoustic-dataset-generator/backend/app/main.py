"""
FastAPI Main Application
- REST endpoint: POST /api/upload-audio  → özel ses dosyası yükle
- REST endpoint: GET  /api/uploads       → yüklü dosyaları listele
- REST endpoint: DELETE /api/uploads/{filename} → dosya sil
- WebSocket:     WS  /ws/simulate        → her adımda JSON mesajı gönder
"""
import asyncio
import json
from logging import config
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

from .simulator import simulate, encode_wav_bytes, UPLOADS_DIR, UPLOADS_SOURCES_DIR, UPLOADS_AMBIENT_DIR
from .dataset_manager import (
    save_sample,
    save_session_configuration,
    init_sweep_state,
    load_sweep_state,
    mark_sweep_started,
    mark_sweep_done,
    delete_sweep_state,
    first_pending_index,
    # merkezi sweep state (sweep_id)
    init_sweep_state_by_sweep_id,
    load_sweep_state_by_sweep_id,
    mark_sweep_started_by_sweep_id,
    mark_sweep_done_by_sweep_id,
    delete_sweep_state_by_sweep_id,
)

app = FastAPI(title="Acoustic Sim Platform API")

# CORS – Vite dev server'a izin ver
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(UPLOADS_SOURCES_DIR, exist_ok=True)
os.makedirs(UPLOADS_AMBIENT_DIR, exist_ok=True)

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


def _validate_upload_kind(kind: str) -> str:
    kind = (kind or "").lower().strip()
    if kind not in {"source", "ambient"}:
        raise HTTPException(status_code=400, detail="kind must be 'source' or 'ambient'")
    return kind


def _uploads_dir_for(kind: str) -> str:
    return UPLOADS_SOURCES_DIR if kind == "source" else UPLOADS_AMBIENT_DIR


# ─────────────────────────────────────────────────────────────
# Ses dosyası yükleme endpoint'leri
# ─────────────────────────────────────────────────────────────
@app.post("/api/upload-audio/{kind}")
async def upload_audio_kind(kind: str, file: UploadFile = File(...)):
    """Ses dosyası yükler. kind: source|ambient"""
    kind = _validate_upload_kind(kind)

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Desteklenmeyen format: {ext}. İzin verilenler: {ALLOWED_EXTENSIONS}",
        )

    safe_name = f"{uuid.uuid4().hex[:8]}_{file.filename}"
    dest_dir = _uploads_dir_for(kind)
    dest_path = os.path.join(dest_dir, safe_name)

    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    return {
        "kind": kind,
        "filename": safe_name,
        "original_name": file.filename,
        "path": dest_path,
        "size_bytes": os.path.getsize(dest_path),
    }


@app.get("/api/uploads")
async def list_uploads(kind: str = "source"):
    """Yüklü ses dosyalarını listeler. kind: source|ambient"""
    kind = _validate_upload_kind(kind)
    base_dir = _uploads_dir_for(kind)

    files = []
    for fname in sorted(os.listdir(base_dir)):
        ext = os.path.splitext(fname)[1].lower()
        if ext in ALLOWED_EXTENSIONS:
            fpath = os.path.join(base_dir, fname)
            files.append({
                "filename": fname,
                "size_bytes": os.path.getsize(fpath),
            })
    return {"kind": kind, "files": files}


@app.delete("/api/uploads/{filename}")
async def delete_upload(filename: str, kind: str = "source"):
    """Yüklü bir ses dosyasını siler. kind: source|ambient"""
    kind = _validate_upload_kind(kind)
    base_dir = _uploads_dir_for(kind)

    fpath = os.path.join(base_dir, filename)
    if not os.path.isfile(fpath):
        raise HTTPException(status_code=404, detail="Dosya bulunamadı")
    os.remove(fpath)
    return {"kind": kind, "deleted": filename}


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

        # opsiyonel sweep run uuid: session çıktıları sweep altına yazılır
        sweep_uuid = config.get("sweep_uuid", None)

        n_gens         = int(config.get("n_gens", 10))
        n_mics         = int(config.get("n_mics", 4))
        mic_radius     = float(config.get("mic_radius", 0.05))
        snr_db         = float(config.get("snr_db", 20))
        rt60           = float(config.get("rt60", 0.3))
        field_mode     = str(config.get("field_mode", "nearfield"))
        min_dist       = float(config.get("min_distance", 0.5))
        max_dist       = float(config.get("max_distance", 2.5))
        delay_ms       = float(config.get("step_delay_ms", 200))
        center_mic     = bool(config.get("center_mic", False))
        room_x         = float(config.get("room_x", 6.0))
        room_y         = float(config.get("room_y", 6.0))
        room_z         = float(config.get("room_z", 3.0))
        mic_cx         = config.get("mic_center_x", None)
        mic_cy         = config.get("mic_center_y", None)
        mic_cz         = config.get("mic_center_z", None)
        mic_center_x   = float(mic_cx) if mic_cx is not None else None
        mic_center_y   = float(mic_cy) if mic_cy is not None else None
        mic_center_z   = float(mic_cz) if mic_cz is not None else None
        sample_rate    = int(config.get("sample_rate", 16000))
        duration_sec   = float(config.get("duration_sec", 1.0))
        ambient_snr_db = float(config.get("ambient_snr_db", 50.0))
        ambient_file   = config.get("ambient_audio_file", None)

        n_samples = int(sample_rate * duration_sec)

        # ── Sources (tek format: sources[]; geriye dönük olarak signal_type/custom_audio_file da kabul) ──
        sources_cfg = config.get("sources", None)
        if not isinstance(sources_cfg, list) or len(sources_cfg) == 0:
            # legacy single-source fallback
            st = str(config.get("signal_type", "white_noise"))
            cf = config.get("custom_audio_file", None)
            sources_cfg = [{"signal_type": st, "custom_audio_file": cf}]

        resolved_sources_cfg = []
        for idx, s in enumerate(sources_cfg):
            st = str((s or {}).get("signal_type", "white_noise"))
            cf = (s or {}).get("custom_audio_file", None)
            cap = None
            if st == "custom" and cf:
                candidate = os.path.join(UPLOADS_SOURCES_DIR, cf)
                if not os.path.isfile(candidate):
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": f"Kaynak #{idx+1} ses dosyası bulunamadı: {cf}",
                    }))
                    return
                cap = candidate
            resolved_sources_cfg.append({
                "signal_type": st,
                "custom_audio_path": cap,
            })

        # ── Ambient ──
        ambient_audio_path = None
        if ambient_file:
            candidate = os.path.join(UPLOADS_AMBIENT_DIR, ambient_file)
            if os.path.isfile(candidate):
                ambient_audio_path = candidate

        session_id = f"session_{int(time.time())}_{uuid.uuid4().hex[:6]}"

        save_session_configuration(session_id, config, sweep_uuid=sweep_uuid)

        await websocket.send_text(json.dumps({
            "type": "session_start",
            "session_id": session_id,
            "total": n_gens,
        }))

        # ── 2. Döngü ──
        for i in range(n_gens):
            loop = asyncio.get_event_loop()

            def _run():
                sources = []
                for s in resolved_sources_cfg:
                    sources.append({
                        "azimuth_deg": random.uniform(0, 360),
                        "distance_m": random.uniform(min_dist, max_dist),
                        "signal_type": s["signal_type"],
                        "custom_audio_path": s.get("custom_audio_path"),
                    })
                return simulate(
                    azimuth_deg=0.0,
                    distance_m=1.0,
                    n_mics=n_mics,
                    mic_radius=mic_radius,
                    snr_db=snr_db,
                    rt60=rt60,
                    signal_type="white_noise",
                    custom_audio_path=None,
                    center_mic=center_mic,
                    ambient_snr_db=ambient_snr_db,
                    ambient_audio_path=ambient_audio_path,
                    room_x=room_x,
                    room_y=room_y,
                    room_z=room_z,
                    mic_center_x=mic_center_x,
                    mic_center_y=mic_center_y,
                    mic_center_z=mic_center_z,
                    sample_rate=sample_rate,
                    duration_sec=duration_sec,
                    sources=sources,
                )

            result = await loop.run_in_executor(None, _run)
            mic_signals = result["mic_signals"]

            label = {"sources": result["sources"]} if "sources" in result else {
                "azimuth_deg": float(result["azimuth_deg"]),
                "distance_m": float(result["distance_m"]),
                "source_pos": result["source_pos"],
            }

            paths = save_sample(session_id, i, mic_signals, label, sample_rate, sweep_uuid=sweep_uuid)

            DISPLAY_POINTS = 512
            step = max(1, n_samples // DISPLAY_POINTS)
            waveform_data = mic_signals[:, ::step].tolist()

            wav_bytes = encode_wav_bytes(mic_signals, sample_rate)
            wav_b64 = base64.b64encode(wav_bytes).decode("ascii")

            msg = {
                "type": "sample",
                "index": i,
                "total": n_gens,
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
            "total": n_gens,
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
# Sweep state endpoints (resume) - sweep_id tabanlı (önerilen)
# ─────────────────────────────────────────────────────────────
@app.get("/api/sweeps/{sweep_id}")
async def get_sweep_state_by_id(sweep_id: str):
    state = load_sweep_state_by_sweep_id(sweep_id)
    if not state:
        raise HTTPException(status_code=404, detail="sweep_state not found")
    return {
        "sweep_id": sweep_id,
        "state": state,
        "next_index": first_pending_index(state),
    }


@app.post("/api/sweeps/{sweep_id}/init")
async def post_sweep_init_by_id(sweep_id: str, payload: dict):
    combos = payload.get("combos")
    meta = payload.get("meta")
    if not isinstance(combos, list) or len(combos) == 0:
        raise HTTPException(status_code=400, detail="combos must be a non-empty list")

    existing = load_sweep_state_by_sweep_id(sweep_id)
    if existing:
        return {
            "sweep_id": sweep_id,
            "state": existing,
            "next_index": first_pending_index(existing),
            "already_exists": True,
        }

    state = init_sweep_state_by_sweep_id(sweep_id, combos=combos, meta=meta if isinstance(meta, dict) else None)
    return {
        "sweep_id": sweep_id,
        "state": state,
        "next_index": first_pending_index(state),
        "already_exists": False,
    }


@app.post("/api/sweeps/{sweep_id}/started/{i}")
async def sweep_started_sweepid(sweep_id: str, i: int, extra: str = None):
    """combo i için status=running işaretler. extra varsa combo içine merge edilir."""
    try:
        state = mark_sweep_started_by_sweep_id(sweep_id, int(i))
        if extra:
            try:
                payload = json.loads(extra)
                if isinstance(payload, dict):
                    combos = state.get("combos") or []
                    if 0 <= int(i) < len(combos):
                        combos[int(i)].setdefault("meta", {})
                        if isinstance(combos[int(i)]["meta"], dict):
                            combos[int(i)]["meta"].update(payload)
                    # re-save
                    from .dataset_manager import save_sweep_state_by_sweep_id
                    save_sweep_state_by_sweep_id(sweep_id, state)
            except Exception:
                pass
        return {"ok": True}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="sweep not found")


@app.post("/api/sweeps/{sweep_id}/done/{i}")
async def sweep_done_sweepid(sweep_id: str, i: int, extra: str = None):
    """combo i için status=done işaretler. extra varsa combo içine merge edilir."""
    try:
        state = mark_sweep_done_by_sweep_id(sweep_id, int(i))
        if extra:
            try:
                payload = json.loads(extra)
                if isinstance(payload, dict):
                    combos = state.get("combos") or []
                    if 0 <= int(i) < len(combos):
                        combos[int(i)].setdefault("meta", {})
                        if isinstance(combos[int(i)]["meta"], dict):
                            combos[int(i)]["meta"].update(payload)
                    from .dataset_manager import save_sweep_state_by_sweep_id
                    save_sweep_state_by_sweep_id(sweep_id, state)
            except Exception:
                pass
        return {"ok": True}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="sweep not found")


@app.delete("/api/sweeps/{sweep_id}")
async def delete_sweep_by_id(sweep_id: str):
    delete_sweep_state_by_sweep_id(sweep_id)
    return {"ok": True}


@app.get("/api/sweeps")
async def list_sweeps():
    """datasets/_sweeps altında mevcut sweep run klasörlerini listeler."""
    from .dataset_manager import DATASET_ROOT, SWEEP_STATE_DIRNAME

    root = os.path.join(DATASET_ROOT, SWEEP_STATE_DIRNAME)
    if not os.path.isdir(root):
        return {"sweeps": []}

    sweeps = []
    for name in sorted(os.listdir(root)):
        p = os.path.join(root, name)
        if not os.path.isdir(p):
            continue
        sweep_path = os.path.join(p, "sweep.json")
        if not os.path.isfile(sweep_path):
            continue
        try:
            with open(sweep_path, "r") as f:
                st = json.load(f)
            sweeps.append({
                "sweep_id": name,
                "created_at": st.get("created_at"),
                "updated_at": st.get("updated_at"),
                "done": st.get("done"),
                "total": st.get("total"),
                "meta": st.get("meta") or {},
            })
        except Exception:
            sweeps.append({"sweep_id": name})

    return {"sweeps": sweeps}


# ─────────────────────────────────────────────────────────────
# Sweep state endpoints (resume) - session_id tabanlı (geriye dönük uyumluluk için)
# ─────────────────────────────────────────────────────────────
@app.get("/api/sweep/{session_id}")
async def get_sweep_state(session_id: str):
    state = load_sweep_state(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="sweep_state not found")
    # small summary + optionally full combos
    return {
        "state": state,
        "next_index": first_pending_index(state),
    }


@app.post("/api/sweep/{session_id}/init")
async def post_sweep_init(session_id: str, payload: dict):
    combos = payload.get("combos")
    meta = payload.get("meta")
    if not isinstance(combos, list) or len(combos) == 0:
        raise HTTPException(status_code=400, detail="combos must be a non-empty list")

    # if exists, return existing (don't overwrite by default)
    existing = load_sweep_state(session_id)
    if existing:
        return {
            "state": existing,
            "next_index": first_pending_index(existing),
            "already_exists": True,
        }

    state = init_sweep_state(session_id, combos=combos, meta=meta if isinstance(meta, dict) else None)
    return {
        "state": state,
        "next_index": first_pending_index(state),
        "already_exists": False,
    }


@app.post("/api/sweep/{session_id}/started/{i}")
async def post_sweep_started(session_id: str, i: int):
    try:
        state = mark_sweep_started(session_id, int(i))
        return {"ok": True, "done": state.get("done", 0), "total": state.get("total", 0)}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="sweep_state not found")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/sweep/{session_id}/done/{i}")
async def post_sweep_done(session_id: str, i: int):
    try:
        state = mark_sweep_done(session_id, int(i))
        return {"ok": True, "done": state.get("done", 0), "total": state.get("total", 0)}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="sweep_state not found")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/sweep/{session_id}")
async def delete_sweep(session_id: str):
    delete_sweep_state(session_id)
    return {"ok": True}


# ─────────────────────────────────────────────────────────────
# Sağlık kontrolü
# ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}