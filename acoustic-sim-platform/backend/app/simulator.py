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


# ─────────────────────────────────────────────
# Sabitler (varsayılan — config ile override edilebilir)
# ─────────────────────────────────────────────
SAMPLE_RATE = 16000          # Hz
SIGNAL_DURATION = 1.0        # saniye
N_SAMPLES = int(SAMPLE_RATE * SIGNAL_DURATION)

# Varsayılan oda boyutları (metre)
DEFAULT_ROOM_X = 6.0
DEFAULT_ROOM_Y = 6.0
DEFAULT_ROOM_Z = 3.0

# Yüklenen ses dosyaları klasörü
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")

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
    start_offset: float = 0.0,
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
    if signal_type == "custom" and custom_audio_path and os.path.isfile(custom_audio_path):
        data, sr = sf.read(custom_audio_path, dtype="float32", always_2d=False)

        # Stereo ise mono'ya çevir
        if data.ndim > 1:
            data = data.mean(axis=1)

        # Örnekleme hızı farklıysa yeniden örnekle (basit linear interpolation)
        if sr != SAMPLE_RATE:
            from scipy.signal import resample_poly
            from math import gcd
            g = gcd(SAMPLE_RATE, sr)
            data = resample_poly(data, SAMPLE_RATE // g, sr // g).astype(np.float32)

        total = len(data)

        if total < N_SAMPLES:
            # Dosya kısaysa döngüye al
            repeats = math.ceil(N_SAMPLES / total)
            data = np.tile(data, repeats)

        # Başlangıç noktası
        max_start = len(data) - N_SAMPLES
        if start_offset < 0:
            offset = np.random.randint(0, max_start + 1)
        else:
            offset = min(int(start_offset * SAMPLE_RATE), max_start)

        sig = data[offset: offset + N_SAMPLES].astype(np.float32)

    elif signal_type == "sine":
        freq = np.random.uniform(200, 4000)
        t = np.arange(N_SAMPLES) / SAMPLE_RATE
        sig = np.sin(2 * math.pi * freq * t).astype(np.float32)
    else:
        # white_noise (varsayılan)
        sig = np.random.randn(N_SAMPLES).astype(np.float32)

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
) -> dict:
    """
    Tek bir simülasyon çalıştırır.

    Döndürür:
        {
            "mic_signals": np.ndarray (n_mics, N_SAMPLES),
            "source_signal": np.ndarray (N_SAMPLES,),
            "source_pos": [x, y, z],
            "azimuth_deg": float,
            "distance_m": float,
        }
    """
    # ─── Oda ve mikrofon merkezi ───
    room_dims = [room_x, room_y, room_z]
    cx = mic_center_x if mic_center_x is not None else room_x / 2
    cy = mic_center_y if mic_center_y is not None else room_y / 2
    cz = mic_center_z if mic_center_z is not None else room_z / 2
    mic_center_arr = np.array([cx, cy, cz])

    src_pos = _source_position(azimuth_deg, distance_m,
                               mic_center=mic_center_arr, room_dims=room_dims)
    mic_arr = _mic_array_3d(n_mics, mic_radius, center_mic=center_mic,
                            mic_center=mic_center_arr)
    source_signal = _generate_source_signal(
        signal_type=signal_type,
        custom_audio_path=custom_audio_path,
        start_offset=-1,
    )

    # ─── Pyroomacoustics odası ───

    # RT60 → absorption katsayısı (Sabine formülüne göre yaklaşım)
    e_absorption, max_order = pra.inverse_sabine(rt60, room_dims)

    room = pra.ShoeBox(
        room_dims,
        fs=SAMPLE_RATE,
        materials=pra.Material(e_absorption),
        max_order=max_order,
    )

    room.add_source(src_pos, signal=source_signal)

    mic_array_2d = mic_arr[:2, :]   # pyroomacoustics 2-D veya 3-D kabul eder
    room.add_microphone(mic_arr)

    room.simulate()

    mic_signals = room.mic_array.signals  # (n_mics, N_SAMPLES+tail)
    # Uzunluğu N_SAMPLES'a kes
    mic_signals = mic_signals[:, :N_SAMPLES].astype(np.float32)

    # ─── Mikrofon öz gürültüsü ekle (her kanal için bağımsız) ───
    if snr_db < 100:
        signal_power = np.mean(mic_signals ** 2)
        if signal_power > 0:
            noise_power = signal_power / (10 ** (snr_db / 10))
            noise = np.random.randn(*mic_signals.shape).astype(np.float32) * math.sqrt(noise_power)
            mic_signals += noise

    # ─── Ortam gürültüsü ekle (tüm kanallara aynı sinyal — diffuse field) ───
    # Ortam sesi (trafik, kalabalık vb.) çok uzaktan gelir; array küçük (cm mertebesinde)
    # olduğundan tüm mikrofonlar pratikte aynı ortam sesini aynı anda duyar.
    if ambient_snr_db < 100:
        signal_power = np.mean(mic_signals ** 2)
        if signal_power > 0:
            ambient_noise_power = signal_power / (10 ** (ambient_snr_db / 10))
            if ambient_audio_path and os.path.isfile(ambient_audio_path):
                # Dosyadan ortam gürültüsü al — rastgele bir başlangıç noktası seç (tüm kanallar için aynı)
                ambient_sig = _generate_source_signal(
                    signal_type="custom",
                    custom_audio_path=ambient_audio_path,
                    start_offset=-1,
                )
                offset = np.random.randint(0, max(1, len(ambient_sig) - N_SAMPLES + 1)) if len(ambient_sig) > N_SAMPLES else 0
                looped = np.tile(ambient_sig, math.ceil((N_SAMPLES + offset) / max(1, len(ambient_sig))))
                seg = looped[offset:offset + N_SAMPLES].astype(np.float32)
                # Güce göre ölçekle
                seg_power = np.mean(seg ** 2)
                if seg_power > 0:
                    seg = seg * math.sqrt(ambient_noise_power / seg_power)
                # Tüm kanallara aynı segment ekle
                mic_signals += seg[np.newaxis, :]
            else:
                # Gaussian ortam gürültüsü — tüm kanallara aynı sinyal
                ambient_noise = np.random.randn(N_SAMPLES).astype(np.float32) * math.sqrt(ambient_noise_power)
                mic_signals += ambient_noise[np.newaxis, :]

    # ─── Normalize (clip to [-1, 1]) ───
    peak = np.max(np.abs(mic_signals))
    if peak > 0:
        mic_signals /= peak

    return {
        "mic_signals": mic_signals,
        "source_signal": source_signal,
        "source_pos": src_pos.tolist(),
        "azimuth_deg": azimuth_deg,
        "distance_m": distance_m,
    }


def encode_wav_bytes(mic_signals: np.ndarray, sample_rate: int = SAMPLE_RATE) -> bytes:
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
