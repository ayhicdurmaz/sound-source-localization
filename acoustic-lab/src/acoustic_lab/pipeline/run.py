from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from acoustic_lab.algorithms.base import AlgorithmConfig
from acoustic_lab.algorithms.factory import make_doa_grid, make_localizer
from acoustic_lab.dataset.loader import dataset_factory
from acoustic_lab.metrics.angular import angular_error_deg, rmse_deg
from acoustic_lab.types import ArrayGeometry
from acoustic_lab.utils.io import ensure_dir, write_csv, write_json


@dataclass
class RunResult:
    run_dir: Path
    results_df: pd.DataFrame
    summary: dict[str, object]


def load_config(path: str | Path) -> dict[str, object]:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def run_benchmark(cfg: dict[str, object]) -> RunResult:
    log = logging.getLogger(__name__)

    run_cfg = cfg.get("run", {})
    tag = str(run_cfg.get("tag", "run"))
    out_dir = Path(str(run_cfg.get("out_dir", "runs")))
    seed = int(run_cfg.get("seed", 0))

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = ensure_dir(out_dir / f"{ts}_{tag}")

    # geometry
    array_cfg = cfg.get("array", {})
    mic_pos = np.asarray(array_cfg.get("mic_positions_m"), dtype=float)
    c = float(array_cfg.get("sound_speed", 343.0))
    geometry = ArrayGeometry(mic_positions_m=mic_pos, sound_speed=c)

    # grid
    doa_grid = make_doa_grid(cfg.get("search", {}).get("doa_grid_deg", {}))

    # dataset
    dataset = dataset_factory(cfg.get("dataset", {}), seed=seed)
    log.info("Dataset: %s examples", len(dataset))

    alg_cfgs = [AlgorithmConfig(**a) for a in cfg.get("algorithms", [])]

    rows: list[dict[str, object]] = []
    for alg_cfg in alg_cfgs:
        localizer = make_localizer(alg_cfg, geometry=geometry, doa_grid=doa_grid)
        errs: list[float] = []
        for i, ex in enumerate(dataset):
            est = localizer.estimate(ex)
            err = angular_error_deg(est.doa_deg, ex.doa_deg)
            errs.append(err)
            rows.append(
                {
                    "algorithm": alg_cfg.name,
                    "i": i,
                    "doa_true_deg": ex.doa_deg,
                    "doa_pred_deg": est.doa_deg,
                    "ang_err_deg": err,
                    "score": est.score,
                }
            )

        summary_alg = {
            "rmse_deg": rmse_deg(errs),
            "mae_deg": float(np.mean(errs)) if errs else float("nan"),
            "n": len(errs),
        }
        write_json(run_dir / f"summary_{alg_cfg.name}.json", summary_alg)

    df = pd.DataFrame(rows)
    write_csv(run_dir / "results.csv", df)

    summary = {
        "run_dir": str(run_dir),
        "n_rows": int(len(df)),
        "algorithms": [a.name for a in alg_cfgs],
    }
    write_json(run_dir / "run.json", summary)

    return RunResult(run_dir=Path(run_dir), results_df=df, summary=summary)
