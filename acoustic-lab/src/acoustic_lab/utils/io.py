from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


def ensure_dir(p: str | Path) -> Path:
    path = Path(p)
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_json(path: str | Path, obj: object) -> None:
    path = Path(path)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2))


def write_csv(path: str | Path, df: pd.DataFrame) -> None:
    path = Path(path)
    df.to_csv(path, index=False)
