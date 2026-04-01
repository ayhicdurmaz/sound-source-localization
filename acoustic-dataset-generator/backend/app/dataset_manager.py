"""
Dataset Manager
Her simülasyondan üretilen WAV + JSON label dosyalarını diske kaydeder.
"""
import os
import json
import time
from typing import Optional, Dict, Any, List

import numpy as np
from .simulator import encode_wav_bytes

DATASET_ROOT = os.path.join(os.path.dirname(__file__), "..", "datasets")

# Sweep state dosyası adı (session klasörü içinde)
SWEEP_STATE_FILENAME = "sweep_state.json"

# Merkezi sweep state klasörü (datasets altında)
SWEEP_STATE_DIRNAME = "_sweeps"


def _ensure_sweep_dir() -> str:
    path = os.path.join(DATASET_ROOT, SWEEP_STATE_DIRNAME)
    os.makedirs(path, exist_ok=True)
    return path


def _ensure_sweep_run_dir(sweep_uuid: str) -> str:
    """datasets/_sweeps/<uuid>/ klasörünü garanti eder."""
    base = _ensure_sweep_dir()
    safe = (sweep_uuid or "").strip()
    if not safe:
        raise ValueError("sweep_uuid is required")
    path = os.path.join(base, safe)
    os.makedirs(path, exist_ok=True)
    return path


def _sweep_state_path_by_sweep_id(sweep_id: str) -> str:
    """Merkezi sweep state dosyası path'i.

    Yeni tasarım: datasets/_sweeps/<sweep_uuid>/sweep.json
    """
    sweep_dir = _ensure_sweep_run_dir(sweep_id)
    return os.path.join(sweep_dir, "sweep.json")


def load_sweep_state_by_sweep_id(sweep_id: str) -> Optional[Dict[str, Any]]:
    path = _sweep_state_path_by_sweep_id(sweep_id)
    if not os.path.isfile(path):
        return None
    with open(path, "r") as f:
        return json.load(f)


def save_sweep_state_by_sweep_id(sweep_id: str, state: Dict[str, Any]) -> str:
    path = _sweep_state_path_by_sweep_id(sweep_id)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, path)
    return os.path.relpath(path, DATASET_ROOT)


def delete_sweep_state_by_sweep_id(sweep_id: str) -> None:
    path = _sweep_state_path_by_sweep_id(sweep_id)
    if os.path.isfile(path):
        os.remove(path)


def init_sweep_state_by_sweep_id(sweep_id: str, combos: List[Dict[str, Any]], meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    meta = meta or {}
    now = int(time.time())
    state: Dict[str, Any] = {
        "schema": 1,
        "created_at": now,
        "updated_at": now,
        "total": len(combos),
        "done": 0,
        "meta": meta,
        "combos": [
            {
                "i": i,
                "params": c,
                "status": "pending",  # pending|running|done|error
                "started_at": None,
                "done_at": None,
                "error": None,
                "meta": {},
            }
            for i, c in enumerate(combos)
        ],
    }
    save_sweep_state_by_sweep_id(sweep_id, state)
    return state


def mark_sweep_started_by_sweep_id(sweep_id: str, i: int) -> Dict[str, Any]:
    state = load_sweep_state_by_sweep_id(sweep_id)
    if not state:
        raise FileNotFoundError("sweep state not found")
    combos = state.get("combos") or []
    if i < 0 or i >= len(combos):
        raise IndexError("combo index out of range")
    if combos[i].get("status") == "done":
        return state
    combos[i]["status"] = "running"
    combos[i]["started_at"] = int(time.time())
    state["updated_at"] = int(time.time())
    save_sweep_state_by_sweep_id(sweep_id, state)
    return state


def mark_sweep_done_by_sweep_id(sweep_id: str, i: int) -> Dict[str, Any]:
    state = load_sweep_state_by_sweep_id(sweep_id)
    if not state:
        raise FileNotFoundError("sweep state not found")
    combos = state.get("combos") or []
    if i < 0 or i >= len(combos):
        raise IndexError("combo index out of range")
    if combos[i].get("status") == "done":
        return state
    combos[i]["status"] = "done"
    combos[i]["done_at"] = int(time.time())

    done_count = sum(1 for c in combos if c.get("status") == "done")
    state["done"] = done_count
    state["updated_at"] = int(time.time())

    save_sweep_state_by_sweep_id(sweep_id, state)
    return state


def _ensure_session_dir(session_id: str, sweep_uuid: Optional[str] = None) -> str:
    """Session klasörünü oluşturur.

    - sweep_uuid verilirse: datasets/_sweeps/<uuid>/sessions/<session_id>/
    - verilmezse (legacy): datasets/<session_id>/
    """
    if sweep_uuid:
        sweep_dir = _ensure_sweep_run_dir(sweep_uuid)
        path = os.path.join(sweep_dir, "sessions", session_id)
    else:
        path = os.path.join(DATASET_ROOT, session_id)
    os.makedirs(path, exist_ok=True)
    return path


def _sweep_state_path(session_id: str) -> str:
    session_dir = _ensure_session_dir(session_id)
    return os.path.join(session_dir, SWEEP_STATE_FILENAME)


def load_sweep_state(session_id: str) -> Optional[Dict[str, Any]]:
    """Session'a ait sweep_state.json varsa okur; yoksa None."""
    path = _sweep_state_path(session_id)
    if not os.path.isfile(path):
        return None
    with open(path, "r") as f:
        return json.load(f)


def save_sweep_state(session_id: str, state: Dict[str, Any]) -> str:
    """sweep_state.json yazar. Döndürür: göreceli path."""
    path = _sweep_state_path(session_id)
    tmp = path + ".tmp"
    # atomic write
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, path)
    return os.path.relpath(path, DATASET_ROOT)


def init_sweep_state(session_id: str, combos: List[Dict[str, Any]], meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Yeni sweep state oluşturur ve diske yazar."""
    meta = meta or {}
    now = int(time.time())
    state: Dict[str, Any] = {
        "schema": 1,
        "created_at": now,
        "updated_at": now,
        "total": len(combos),
        "done": 0,
        "meta": meta,
        "combos": [
            {
                "i": i,
                "params": c,
                "status": "pending",  # pending|running|done|error
                "started_at": None,
                "done_at": None,
                "error": None,
                "meta": {},
            }
            for i, c in enumerate(combos)
        ],
    }
    save_sweep_state(session_id, state)
    return state


def mark_sweep_started(session_id: str, i: int) -> Dict[str, Any]:
    state = load_sweep_state(session_id)
    if not state:
        raise FileNotFoundError("sweep_state.json not found")
    combos = state.get("combos") or []
    if i < 0 or i >= len(combos):
        raise IndexError("combo index out of range")
    if combos[i].get("status") == "done":
        return state
    combos[i]["status"] = "running"
    combos[i]["started_at"] = int(time.time())
    state["updated_at"] = int(time.time())
    save_sweep_state(session_id, state)
    return state


def mark_sweep_done(session_id: str, i: int) -> Dict[str, Any]:
    state = load_sweep_state(session_id)
    if not state:
        raise FileNotFoundError("sweep_state.json not found")
    combos = state.get("combos") or []
    if i < 0 or i >= len(combos):
        raise IndexError("combo index out of range")
    if combos[i].get("status") == "done":
        return state
    combos[i]["status"] = "done"
    combos[i]["done_at"] = int(time.time())

    # recompute done
    done_count = sum(1 for c in combos if c.get("status") == "done")
    state["done"] = done_count
    state["updated_at"] = int(time.time())

    save_sweep_state(session_id, state)
    return state


def delete_sweep_state(session_id: str) -> None:
    path = _sweep_state_path(session_id)
    if os.path.isfile(path):
        os.remove(path)


def first_pending_index(state: Dict[str, Any]) -> Optional[int]:
    combos = state.get("combos") or []
    for c in combos:
        if c.get("status") != "done":
            return int(c.get("i", 0))
    return None


def save_session_configuration(session_id: str, config: json, sweep_uuid: Optional[str] = None) -> str:
    """
    Simülasyon oturumu için yapılandırmayı kaydeder.
    Döndürür: JSON dosyasının yolu (göreceli)
    """
    session_dir = _ensure_session_dir(session_id, sweep_uuid=sweep_uuid)
    config_path = os.path.join(session_dir, "config_session.json")
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
    return os.path.relpath(config_path, DATASET_ROOT)


def save_sample(
    session_id: str,
    sample_index: int,
    mic_signals: np.ndarray,
    label: dict,
    sample_rate: int,
    sweep_uuid: Optional[str] = None,
) -> dict:
    """
    WAV ve JSON dosyalarını kaydeder.
    Döndürür: {"wav_path": str, "json_path": str}
    """
    session_dir = _ensure_session_dir(session_id, sweep_uuid=sweep_uuid)
    base_name = f"sample_{sample_index:05d}"

    wav_path = os.path.join(session_dir, base_name + ".wav")
    json_path = os.path.join(session_dir, base_name + ".json")

    # WAV kaydet
    wav_bytes = encode_wav_bytes(mic_signals, sample_rate)
    with open(wav_path, "wb") as f:
        f.write(wav_bytes)

    # JSON label kaydet
    with open(json_path, "w") as f:
        json.dump(label, f, indent=2)

    return {
        "wav_path": os.path.relpath(wav_path, DATASET_ROOT),
        "json_path": os.path.relpath(json_path, DATASET_ROOT),
    }
