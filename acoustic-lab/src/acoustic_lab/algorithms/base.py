from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from acoustic_lab.types import ArrayGeometry, Estimate, Example


@dataclass
class AlgorithmConfig:
    name: str
    params: dict[str, object] | None = None


class Localizer:
    """Base interface for all localization algorithms."""

    def __init__(self, geometry: ArrayGeometry, doa_grid_deg: np.ndarray | None = None):
        self.geometry = geometry
        self.doa_grid_deg = doa_grid_deg

    def estimate(self, ex: Example) -> Estimate:  # pragma: no cover
        raise NotImplementedError
