from __future__ import annotations

import logging
from pathlib import Path

import typer

from acoustic_lab.pipeline.run import load_config, run_benchmark
from acoustic_lab.utils.logging import setup_logging

app = typer.Typer(add_completion=False)


@app.command()
def run(config: Path = typer.Option(..., "--config", "-c", exists=True)) -> None:
    """Run benchmark from a YAML config."""
    setup_logging(logging.INFO)
    cfg = load_config(config)
    rr = run_benchmark(cfg)
    typer.echo(f"Wrote results to: {rr.run_dir}")


if __name__ == "__main__":
    app()
