from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator, Protocol

import numpy as np

from acoustic_lab.types import Example


class Dataset(Protocol):
    def __iter__(self) -> Iterator[Example]: ...

    def __len__(self) -> int: ...


@dataclass
class DummyDataset:
    n_examples: int
    fs: int
    duration_s: float
    doa_deg: float
    seed: int = 0

    def __iter__(self) -> Iterator[Example]:
        rng = np.random.default_rng(self.seed)
        T = int(self.fs * self.duration_s)
        M = 4
        for _ in range(self.n_examples):
            # random noise placeholders; replace with your real dataset
            x = rng.standard_normal((M, T)).astype(np.float32)
            yield Example(signals=x, fs=self.fs, doa_deg=float(self.doa_deg))

    def __len__(self) -> int:
        return self.n_examples


def dataset_factory(cfg: dict[str, object], seed: int) -> Dataset:
    name = str(cfg.get("name"))
    if name == "dummy":
        dcfg = cfg.get("dummy", {})
        return DummyDataset(
            n_examples=int(dcfg.get("n_examples", 10)),
            fs=int(dcfg.get("fs", 16000)),
            duration_s=float(dcfg.get("duration_s", 1.0)),
            doa_deg=float(dcfg.get("doa_deg", 0.0)),
            seed=seed,
        )

    raise ValueError(f"Unknown dataset: {name}")
