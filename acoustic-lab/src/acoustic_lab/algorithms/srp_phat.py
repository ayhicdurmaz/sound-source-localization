from __future__ import annotations

import numpy as np

from acoustic_lab.algorithms.base import Localizer
from acoustic_lab.types import Estimate, Example
from acoustic_lab.utils.signal import stft


def _steering_phase(mic_positions_m: np.ndarray, doa_deg: float, freqs_hz: np.ndarray, c: float) -> np.ndarray:
    theta = np.radians(doa_deg)
    u = np.array([np.cos(theta), np.sin(theta), 0.0])
    taus = -mic_positions_m @ u / c  # (M,)
    return np.exp(-1j * 2 * np.pi * freqs_hz[None, :] * taus[:, None])  # (M,F)


class SRPPHAT(Localizer):
    def __init__(self, *args, n_fft: int = 512, hop: int = 128, eps: float = 1e-12, **kwargs):
        super().__init__(*args, **kwargs)
        self.n_fft = n_fft
        self.hop = hop
        self.eps = eps

    def estimate(self, ex: Example) -> Estimate:
        if self.doa_grid_deg is None:
            raise ValueError("SRPPHAT requires doa_grid_deg")

        X = ex.signals
        M, _T = X.shape

        Xf = [stft(X[m], n_fft=self.n_fft, hop=self.hop) for m in range(M)]  # each: (F,N)
        if Xf[0].shape[1] == 0:
            return Estimate(doa_deg=float(self.doa_grid_deg[0]), score=None, meta={"warning": "too_short"})

        F, N = Xf[0].shape
        freqs = np.fft.rfftfreq(self.n_fft, d=1.0 / ex.fs)

        # PHAT-normalized cross-spectral matrices for each (f,n)
        Xf_stack = np.stack(Xf, axis=0)  # (M,F,N)
        R = Xf_stack[:, None, :, :] * np.conj(Xf_stack[None, :, :, :])  # (M,M,F,N)
        R /= (np.abs(R) + self.eps)

        best_doa = float(self.doa_grid_deg[0])
        best_score = -1e30

        for doa in self.doa_grid_deg:
            a = _steering_phase(
                self.geometry.mic_positions_m, float(doa), freqs, self.geometry.sound_speed
            )  # (M,F)
            score = 0.0
            for ni in range(N):
                for fi in range(F):
                    af = a[:, fi]
                    Rmn = R[:, :, fi, ni]
                    score += float(np.real(np.conj(af) @ Rmn @ af))

            if score > best_score:
                best_score = score
                best_doa = float(doa)

        return Estimate(doa_deg=best_doa, score=best_score, meta={"n_fft": self.n_fft, "hop": self.hop})
