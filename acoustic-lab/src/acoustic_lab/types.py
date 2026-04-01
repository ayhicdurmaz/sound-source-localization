from __future__ import annotations

from dataclasses import dataclass

import numpy as np


ArrayLike = np.ndarray


@dataclass(frozen=True)
class ArrayGeometry:
    mic_positions_m: np.ndarray  # (M, 3)
    sound_speed: float = 343.0


@dataclass(frozen=True)
class Example:
    """One localization example.

    signals: time-domain multichannel audio, shape (M, T)
    doa_deg: ground-truth azimuth (deg). Convention: -180..180 (or -90..90) depending on your setup.
    """

    signals: np.ndarray
    fs: int
    doa_deg: float


@dataclass(frozen=True)
class Estimate:
    doa_deg: float
    score: float | None = None
    meta: dict[str, object] | None = None
