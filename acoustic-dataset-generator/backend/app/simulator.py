"""
Acoustic Simulator Module
Pyroomacoustics ile oda simülasyonu, gürültü ekleme ve WAV üretimi.
"""
import numpy as np
import pyroomacoustics as pra
import soundfile as sf
import io
import wave
import math
import os
from typing import Optional

# Varsayılan oda boyutları (metre)
DEFAULT_ROOM_X = 6.0
DEFAULT_ROOM_Y = 6.0
DEFAULT_ROOM_Z = 3.0

# Yüklenen ses dosyaları klasörü
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
UPLOADS_SOURCES_DIR = os.path.join(UPLOADS_DIR, "sources")
UPLOADS_AMBIENT_DIR = os.path.join(UPLOADS_DIR, "ambient")

# Geriye dönük uyumluluk için sabit alias'lar
ROOM_X = DEFAULT_ROOM_X
ROOM_Y = DEFAULT_ROOM_Y
ROOM_Z = DEFAULT_ROOM_Z
MIC_CENTER = np.array([ROOM_X / 2, ROOM_Y / 2, ROOM_Z / 2])


def _mic_array_3d(n_mics: int, radius: float, center_mic: bool = False,
                  mic_center=None) -> np.ndarray:
    """
    Dairesel ULA mikrofon dizisi (XY düzleminde, Z sabit).
    center_mic=True ise diziye merkeze ek bir mikrofon eklenir.
    """
    cx = mic_center if mic_center is not None else MIC_CENTER
    angles = np.linspace(0, 2 * math.pi, n_mics, endpoint=False)
    xs = cx[0] + radius * np.cos(angles)
    ys = cx[1] + radius * np.sin(angles)
    zs = np.full(n_mics, cx[2])
    arr = np.array([xs, ys, zs])
    if center_mic:
        center_col = np.array(cx).reshape(3, 1)
        arr = np.hstack([arr, center_col])
    return arr


def _source_position(azimuth_deg: float, distance_m: float,
                     mic_center=None, room_dims=None) -> np.ndarray:
    """
    Azimut açısı ve mesafeden 3-D kaynak konumu üretir.
    """
    cx = mic_center if mic_center is not None else MIC_CENTER
    rx = room_dims[0] if room_dims is not None else DEFAULT_ROOM_X
    ry = room_dims[1] if room_dims is not None else DEFAULT_ROOM_Y

    az = math.radians(azimuth_deg)
    x = cx[0] + distance_m * math.cos(az)
    y = cx[1] + distance_m * math.sin(az)
    z = cx[2]

    x = float(np.clip(x, 0.1, rx - 0.1))
    y = float(np.clip(y, 0.1, ry - 0.1))
    return np.array([x, y, z])


def _generate_source_signal(
    signal_type: str = "white_noise",
    custom_audio_path: Optional[str] = None,
    start_offset: float = 0.0, sample_rate: int = 16000, duration_sec: float = 1.0
) -> np.ndarray:
    """
    Kaynak işareti üretir.

    signal_type:
        "white_noise"  – Gaussian beyaz gürültü
        "sine"         – Rastgele frekanslı sinüs
        "custom"       – uploads/ klasöründeki WAV dosyasından 1 sn segment al
    custom_audio_path: "custom" seçildiğinde kullanılacak dosyanın tam yolu
    start_offset:      WAV içinden başlama noktası (saniye); -1 → rastgele
    """
    
    n_samples = int(sample_rate * duration_sec)

    if signal_type == "custom" and custom_audio_path and os.path.isfile(custom_audio_path):
        data, sr = sf.read(custom_audio_path, dtype="float32", always_2d=False)

        # Stereo ise mono'ya çevir
        if data.ndim > 1:
            data = data.mean(axis=1)

        # Örnekleme hızı farklıysa yeniden örnekle (basit linear interpolation)
        if sr != sample_rate:
            from scipy.signal import resample_poly
            from math import gcd
            g = gcd(sample_rate, sr)
            data = resample_poly(data, sample_rate // g, sr // g).astype(np.float32)

        total = len(data)

        if total < n_samples:
            # Dosya kısaysa döngüye al
            repeats = math.ceil(n_samples / total)
            data = np.tile(data, repeats)

        # Başlangıç noktası
        max_start = len(data) - n_samples
        if start_offset < 0:
            offset = np.random.randint(0, max_start + 1)
        else:
            offset = min(int(start_offset * sample_rate), max_start)

        sig = data[offset: offset + n_samples].astype(np.float32)

    elif signal_type == "sine":
        freq = np.random.uniform(200, 4000)
        t = np.arange(n_samples) / sample_rate
        sig = np.sin(2 * math.pi * freq * t).astype(np.float32)
    else:
        # white_noise (varsayılan)
        sig = np.random.randn(n_samples).astype(np.float32)

    # Normalize
    peak = np.max(np.abs(sig))
    if peak > 0:
        sig /= peak
    return sig


def simulate(
    azimuth_deg: float,
    distance_m: float,
    n_mics: int,
    mic_radius: float,
    snr_db: float,
    rt60: float,
    sample_rate: int,
    duration_sec: float,
    signal_type: str = "white_noise",
    custom_audio_path: Optional[str] = None,
    center_mic: bool = False,
    ambient_snr_db: float = 50.0,
    ambient_audio_path: Optional[str] = None,
    room_x: float = DEFAULT_ROOM_X,
    room_y: float = DEFAULT_ROOM_Y,
    room_z: float = DEFAULT_ROOM_Z,
    mic_center_x: Optional[float] = None,
    mic_center_y: Optional[float] = None,
    mic_center_z: Optional[float] = None,
    sources: Optional[list] = None,
) -> dict:
    """Tek bir simülasyon çalıştırır.

    sources verilirse çoklu kaynak simülasyonu çalışır.

    sources: list of dicts, each:
      {
        "azimuth_deg": float,
        "distance_m": float,
        "signal_type": "white_noise"|"sine"|"custom",
        "custom_audio_path": Optional[str],
      }
    """

    n_samples = int(sample_rate * duration_sec)

    # ─── Oda ve mikrofon merkezi ───
    room_dims = [room_x, room_y, room_z]
    cx = mic_center_x if mic_center_x is not None else room_x / 2
    cy = mic_center_y if mic_center_y is not None else room_y / 2
    cz = mic_center_z if mic_center_z is not None else room_z / 2
    mic_center_arr = np.array([cx, cy, cz])

    mic_arr = _mic_array_3d(n_mics, mic_radius, center_mic=center_mic, mic_center=mic_center_arr)

    # RT60 → absorption katsayısı
    e_absorption, max_order = pra.inverse_sabine(rt60, room_dims)

    room = pra.ShoeBox(
        room_dims,
        fs=sample_rate,
        materials=pra.Material(e_absorption),
        max_order=max_order,
    )

    sources_out = []

    if sources is not None:
        if not isinstance(sources, list) or len(sources) == 0:
            raise ValueError("sources must be a non-empty list")
        for s in sources:
            az = float(s.get("azimuth_deg"))
            di = float(s.get("distance_m"))
            st = str(s.get("signal_type", "white_noise"))
            cap = s.get("custom_audio_path", None)

            src_pos = _source_position(az, di, mic_center=mic_center_arr, room_dims=room_dims)
            src_sig = _generate_source_signal(
                signal_type=st,
                custom_audio_path=cap,
                start_offset=-1,
                sample_rate=sample_rate,
                duration_sec=duration_sec,
            )
            room.add_source(src_pos, signal=src_sig)
            sources_out.append({
                "azimuth_deg": az,
                "distance_m": di,
                "source_pos": src_pos.tolist(),
                "signal_type": st,
                "custom_audio_path": cap,
            })
    else:
        src_pos = _source_position(azimuth_deg, distance_m, mic_center=mic_center_arr, room_dims=room_dims)
        source_signal = _generate_source_signal(
            signal_type=signal_type,
            custom_audio_path=custom_audio_path,
            start_offset=-1,
            sample_rate=sample_rate,
            duration_sec=duration_sec,
        )
        room.add_source(src_pos, signal=source_signal)

    room.add_microphone(mic_arr)
    room.simulate()

    mic_signals = room.mic_array.signals[:, :n_samples].astype(np.float32)

    # ─── Mikrofon öz gürültüsü ekle (her kanal için bağımsız) ───
    if snr_db < 100:
        signal_power = np.mean(mic_signals ** 2, axis=1, keepdims=True)
        mask = signal_power > 0
        noise_power = np.zeros_like(signal_power, dtype=np.float32)
        noise_power[mask] = signal_power[mask] / (10 ** (snr_db / 10))
        noise = np.random.randn(*mic_signals.shape).astype(np.float32) * np.sqrt(noise_power)
        mic_signals += noise

    # ─── Ortam gürültüsü ekle (tüm kanallara aynı sinyal) ───
    if ambient_snr_db < 100:
        signal_power = float(np.mean(mic_signals ** 2))
        if signal_power > 0.0:
            ambient_noise_power = signal_power / (10 ** (ambient_snr_db / 10))
            if ambient_audio_path and os.path.isfile(ambient_audio_path):
                ambient_sig = _generate_source_signal(
                    signal_type="custom",
                    custom_audio_path=ambient_audio_path,
                    start_offset=-1,
                    sample_rate=sample_rate,
                    duration_sec=duration_sec,
                )
                if len(ambient_sig) < n_samples:
                    ambient_sig = np.tile(ambient_sig, math.ceil(n_samples / max(1, len(ambient_sig))))
                seg = ambient_sig[:n_samples].astype(np.float32)
                seg_power = float(np.mean(seg ** 2))
                if seg_power > 0.0:
                    seg = seg * math.sqrt(ambient_noise_power / seg_power)
                mic_signals += seg[np.newaxis, :]
            else:
                ambient_noise = np.random.randn(n_samples).astype(np.float32) * math.sqrt(ambient_noise_power)
                mic_signals += ambient_noise[np.newaxis, :]

    # ─── Normalize ───
    peak = float(np.max(np.abs(mic_signals)))
    if peak > 0.0:
        mic_signals /= peak

    out = {
        "mic_signals": mic_signals,
        "azimuth_deg": azimuth_deg,
        "distance_m": distance_m,
        "mic_array": mic_arr.tolist(),
    }

    if sources is not None:
        out["sources"] = sources_out
    else:
        out["source_signal"] = source_signal
        out["source_pos"] = src_pos.tolist()

    return out


def encode_wav_bytes(mic_signals: np.ndarray, sample_rate: int) -> bytes:
    """
    (n_mics, N_SAMPLES) float32 dizisini çok kanallı WAV bytes olarak döndürür.
    """
    n_channels, n_samples = mic_signals.shape
    buf = io.BytesIO()

    # int16'ya dönüştür
    data_int16 = (mic_signals * 32767).astype(np.int16)

    with wave.open(buf, "wb") as wf:
        wf.setnchannels(n_channels)
        wf.setsampwidth(2)      # 16-bit
        wf.setframerate(sample_rate)
        # Interleave channels: [ch0[0], ch1[0], ..., ch0[1], ch1[1], ...]
        interleaved = data_int16.T.flatten()
        wf.writeframes(interleaved.tobytes())

    return buf.getvalue()
