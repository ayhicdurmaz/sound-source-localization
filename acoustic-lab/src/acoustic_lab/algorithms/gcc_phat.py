from __future__ import annotations

import numpy as np

from acoustic_lab.algorithms.base import Localizer
from acoustic_lab.types import Estimate, Example
from acoustic_lab.utils.signal import gcc_phat


class GCCPHAT(Localizer):
    """Very simple 2-mic GCC-PHAT DOA estimate (azimuth).

    Assumes a linear 2-mic array on x-axis and far-field plane wave.
    """

    def estimate(self, ex: Example) -> Estimate:
        if ex.signals.shape[0] < 2:
            raise ValueError("GCCPHAT requires at least 2 microphones")

        x0 = ex.signals[0]
        x1 = ex.signals[1]
        cc, lags = gcc_phat(x0, x1)
        lag = float(lags[int(np.argmax(cc))])
        tau = lag / ex.fs

        p0 = self.geometry.mic_positions_m[0]
        p1 = self.geometry.mic_positions_m[1]
        d = float(np.linalg.norm(p1 - p0))
        # tau = (d * sin(theta)) / c  for array along x and azimuth in x-y plane
        s = np.clip(tau * self.geometry.sound_speed / (d + 1e-12), -1.0, 1.0)
        doa = float(np.degrees(np.arcsin(s)))
        return Estimate(doa_deg=doa, score=float(np.max(cc)))
