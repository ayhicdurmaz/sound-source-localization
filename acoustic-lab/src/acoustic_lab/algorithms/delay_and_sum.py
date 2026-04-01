from __future__ import annotations

import numpy as np

from acoustic_lab.algorithms.base import Localizer
from acoustic_lab.types import Estimate, Example


def _steering_delays_seconds(mic_positions_m: np.ndarray, doa_deg: float, c: float) -> np.ndarray:
    # 2D: assume sources in x-y plane, azimuth doa_deg
    theta = np.radians(doa_deg)
    u = np.array([np.cos(theta), np.sin(theta), 0.0])  # propagation direction
    # relative delays w.r.t. origin
    return -mic_positions_m @ u / c


class DelayAndSum(Localizer):
    def estimate(self, ex: Example) -> Estimate:
        if self.doa_grid_deg is None:
            raise ValueError("DelayAndSum requires doa_grid_deg")

        X = ex.signals  # (M,T)
        best_doa = float(self.doa_grid_deg[0])
        best_score = -1e30

        for doa in self.doa_grid_deg:
            delays = _steering_delays_seconds(self.geometry.mic_positions_m, float(doa), self.geometry.sound_speed)
            # integer-sample shift (baseline implementation)
            shifts = np.round(delays * ex.fs).astype(int)
            aligned = []
            for m in range(X.shape[0]):
                s = np.roll(X[m], -shifts[m])
                aligned.append(s)
            y = np.mean(np.stack(aligned, axis=0), axis=0)
            score = float(np.sum(y**2))
            if score > best_score:
                best_score = score
                best_doa = float(doa)

        return Estimate(doa_deg=best_doa, score=best_score)
