"""
Dataset Manager
Her simülasyondan üretilen WAV + JSON label dosyalarını diske kaydeder.
"""
import os
import json
import time
import numpy as np
from .simulator import encode_wav_bytes, SAMPLE_RATE

DATASET_ROOT = os.path.join(os.path.dirname(__file__), "..", "datasets")


def _ensure_session_dir(session_id: str) -> str:
    path = os.path.join(DATASET_ROOT, session_id)
    os.makedirs(path, exist_ok=True)
    return path


def save_sample(
    session_id: str,
    sample_index: int,
    mic_signals: np.ndarray,
    label: dict,
) -> dict:
    """
    WAV ve JSON dosyalarını kaydeder.
    Döndürür: {"wav_path": str, "json_path": str}
    """
    session_dir = _ensure_session_dir(session_id)
    base_name = f"sample_{sample_index:05d}"

    wav_path = os.path.join(session_dir, base_name + ".wav")
    json_path = os.path.join(session_dir, base_name + ".json")

    # WAV kaydet
    wav_bytes = encode_wav_bytes(mic_signals, SAMPLE_RATE)
    with open(wav_path, "wb") as f:
        f.write(wav_bytes)

    # JSON label kaydet
    with open(json_path, "w") as f:
        json.dump(label, f, indent=2)

    return {
        "wav_path": os.path.relpath(wav_path, DATASET_ROOT),
        "json_path": os.path.relpath(json_path, DATASET_ROOT),
    }
