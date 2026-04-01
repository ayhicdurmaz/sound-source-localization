from __future__ import annotations

import numpy as np

from acoustic_lab.algorithms.base import AlgorithmConfig, Localizer
from acoustic_lab.algorithms.delay_and_sum import DelayAndSum
from acoustic_lab.algorithms.gcc_phat import GCCPHAT
from acoustic_lab.algorithms.srp_phat import SRPPHAT
from acoustic_lab.types import ArrayGeometry


def make_doa_grid(cfg: dict[str, object] | None) -> np.ndarray | None:
    if not cfg:
        return None
    start = float(cfg.get("start", -90))
    stop = float(cfg.get("stop", 90))
    step = float(cfg.get("step", 1))
    return np.arange(start, stop + 1e-9, step, dtype=float)


def make_localizer(alg: AlgorithmConfig, geometry: ArrayGeometry, doa_grid: np.ndarray | None) -> Localizer:
    name = alg.name.lower()
    params = alg.params or {}

    if name == "gcc_phat":
        return GCCPHAT(geometry=geometry, doa_grid_deg=None)
    if name in {"delay_and_sum", "das"}:
        return DelayAndSum(geometry=geometry, doa_grid_deg=doa_grid)
    if name in {"srp_phat", "srpphat"}:
        return SRPPHAT(geometry=geometry, doa_grid_deg=doa_grid, **params)

    raise ValueError(f"Unknown algorithm: {alg.name}")
