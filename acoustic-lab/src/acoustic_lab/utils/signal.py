from __future__ import annotations

import numpy as np


def stft(x: np.ndarray, n_fft: int, hop: int) -> np.ndarray:
    """Minimal STFT.

    x: (T,) real
    return: (F, N) complex
    """
    x = np.asarray(x)
    win = np.hanning(n_fft).astype(x.dtype)
    n_frames = 1 + (len(x) - n_fft) // hop if len(x) >= n_fft else 0
    if n_frames <= 0:
        return np.empty((n_fft // 2 + 1, 0), dtype=np.complex128)

    frames = np.stack([x[i * hop : i * hop + n_fft] for i in range(n_frames)], axis=0)
    frames = frames * win[None, :]
    X = np.fft.rfft(frames, n=n_fft, axis=1)
    return X.T


def gcc_phat(x: np.ndarray, y: np.ndarray, n_fft: int | None = None, eps: float = 1e-12) -> tuple[np.ndarray, np.ndarray]:
    """Return GCC-PHAT cross-correlation and lag axis (samples)."""
    x = np.asarray(x)
    y = np.asarray(y)
    n = int(2 ** np.ceil(np.log2(len(x) + len(y)))) if n_fft is None else int(n_fft)

    X = np.fft.rfft(x, n=n)
    Y = np.fft.rfft(y, n=n)
    R = X * np.conj(Y)
    R /= (np.abs(R) + eps)
    cc = np.fft.irfft(R, n=n)
    cc = np.concatenate((cc[-(n // 2) :], cc[: n // 2 + 1]))
    lags = np.arange(-n // 2, n // 2 + 1)
    return cc, lags
