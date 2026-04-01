from __future__ import annotations

import numpy as np


def wrap_angle_deg(a: float) -> float:
    # map to (-180, 180]
    x = (a + 180.0) % 360.0 - 180.0
    return float(x)


def angular_error_deg(pred: float, true: float) -> float:
    return abs(wrap_angle_deg(pred - true))


def rmse_deg(errs: list[float]) -> float:
    e = np.asarray(errs, dtype=float)
    return float(np.sqrt(np.mean(e**2))) if e.size else float("nan")
