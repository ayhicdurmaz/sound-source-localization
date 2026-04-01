<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

Bu repo bir Python benchmark/pipeline projesidir.

- Kod stili: ruff + black, type hints tercih edilir.
- Algoritmalar modüler olmalı: her estimator `fit()` gerektirmeden `estimate(example)->Estimate` şeklinde çalışmalı.
- Dataset kodu I/O ile sınırlı kalmalı; sinyal işleme/algoritma kodu `algorithms/` altında olmalı.
- Reprodüksiyon için config (YAML) tek kaynak olsun; her run `runs/<timestamp>_<tag>/` içine yazılsın.
