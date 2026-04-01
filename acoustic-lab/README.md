# acoustic-lab

Bu repo, akustik kaynak lokalizasyonu algoritmalarını aynı pipeline altında çalıştırıp performanslarını kıyaslamak için minimal bir benchmark iskeleti sağlar.

Tasarım prensipleri:
- **Tek kaynak config**: Her şey YAML ile kontrol edilir.
- **Modüler algoritmalar**: Her algoritma `fit()` gerektirmeden `estimate(example) -> Estimate` şeklinde çalışır.
- **Dataset kodu I/O ile sınırlı**: Sinyal işleme / beamforming / spektral işlemler `src/acoustic_lab/algorithms/` ve `src/acoustic_lab/utils/` altında.
- **Reprodüksiyon**: Her koşu `runs/<timestamp>_<tag>/` altına yazılır.

## Hızlı başlangıç

### 1) Sanal ortam (venv)
Workspace içinde `.venv` kullanılır.

- VS Code task: **Install (venv)**

### 2) Örnek config ile çalıştır
- VS Code task: **Run benchmark (example config)**

CLI ile:
- `aclab run --config configs/example.yaml`

Çıktılar `runs/<timestamp>_<tag>/` altına yazılır.

## Konfigürasyon (YAML) nasıl çalışır?
Örnek: `configs/example.yaml`

### `run`
- `tag`: run klasör adında kullanılacak etiket
- `out_dir`: runs dizini (default: `runs`)
- `seed`: dataset/deney tekrarlanabilirliği

### `dataset`
`dataset.name` seçimi `src/acoustic_lab/dataset/loader.py` içindeki `dataset_factory()` tarafından çözülür.

Şu an:
- `dummy`: sadece iskeleti test etmek için sahte veri üretir.

Kendi datasetin için yeni bir loader ekleyip `dataset_factory()` içine register etmen yeterli.

### `array`
- `mic_positions_m`: mikrofonların 3D konumları (metre cinsinden), shape `(M, 3)`
- `sound_speed`: ses hızı (m/s), default `343.0`

Not: Şu anki baseline algoritmalar **azimuth (2D) / far-field** varsayımına yakındır (özellikle DAS/SRP).

### `algorithms`
Çalıştırılacak algoritma listesi.

Örnek:
```yaml
algorithms:
  - name: "gcc_phat"
  - name: "delay_and_sum"
  - name: "srp_phat"
```

Algoritma isimleri `src/acoustic_lab/algorithms/factory.py` içindeki `make_localizer()` tarafından eşlenir.

Desteklenen isimler (şu an):
- `gcc_phat`
- `delay_and_sum` (alias: `das`)
- `srp_phat`

> MVDR / MUSIC / ESPRIT config alanları bu iskelette **henüz implement edilmedi**. Datasetini netleştirdikten sonra aynı arayüzle eklemek amaç.

### `search`
Grid tabanlı yöntemler için arama ızgarası.

```yaml
search:
  doa_grid_deg:
    start: -90
    stop: 90
    step: 1
```

Bu grid şunlar için gereklidir:
- Delay-and-Sum
- SRP-PHAT

GCC-PHAT grid kullanmaz.

## Algoritmalar nasıl çalışıyor? (kısa açıklama)

### 1) GCC-PHAT (`gcc_phat`)
- Amaç: iki mikrofon arasındaki **TDOA** (time difference of arrival) tahmini
- İşlem: GCC-PHAT cross-correlation ile en iyi lag bulunur, basit 2-mic geometriyle azimuth’a çevrilir.
- Kısıtlar (baseline): en az 2 kanal gerekir; şimdilik **2 mic lineer case** basit kabul.

Kod: `src/acoustic_lab/algorithms/gcc_phat.py`

### 2) Delay-and-Sum (`delay_and_sum` / `das`)
- Amaç: DOA grid üzerinde delay ile sinyalleri hizalayıp enerji maksimize etmek
- İşlem: her DOA için integer-sample shift ile hizalama yapar, çıkış enerjisini skor olarak kullanır.
- Kısıtlar (baseline): fractional delay yok (hız için sonra eklenebilir), far-field 2D steering varsayımı.

Kod: `src/acoustic_lab/algorithms/delay_and_sum.py`

### 3) SRP-PHAT (`srp_phat`)
- Amaç: steered response power + PHAT ağırlığıyla grid üzerinde maksimumu bulmak
- İşlem: STFT → cross-spectrum → PHAT normalize → her DOA için steering phase ile skor.
- Kısıtlar (baseline): skor hesabı sade ve yavaştır; doğru çalışmayı hedefleyen referans implementasyon.

Kod: `src/acoustic_lab/algorithms/srp_phat.py`

## Çıktılar / Sonuç formatı
Her run, örn:
- `runs/20260322_123456_example/`

içine şunları yazar:
- `results.csv`: her örnek için satır
  - `algorithm`, `i`, `doa_true_deg`, `doa_pred_deg`, `ang_err_deg`, `score`
- `summary_<algorithm>.json`: algoritma bazlı özet
  - `rmse_deg`, `mae_deg`, `n`
- `run.json`: run meta

Runner kodu: `src/acoustic_lab/pipeline/run.py`

## Dataset entegrasyonu (kendi datanı bağlama)

### Beklenen örnek tipi
Pipeline her iterasyonda `Example` bekler:
- `signals`: `np.ndarray`, shape `(M, T)`
- `fs`: örnekleme frekansı
- `doa_deg`: ground-truth azimuth (derece)

Tipler: `src/acoustic_lab/types.py`

### Adım adım
1) `src/acoustic_lab/dataset/loader.py` içine yeni bir dataset sınıfı ekle (örn. WAV/NPZ okuyacak).
2) `dataset_factory()` içinde `dataset.name` değerine göre onu döndür.
3) YAML config’de:
```yaml
dataset:
  name: "my_dataset"
  my_dataset:
    root: "/path/to/data"
    ...
```

Dataset yapını söylersen (dosya formatı + klasör düzeni + label formatı), loader’ı doğrudan senin yapına göre ekleyebilirim.

## Geliştirme / kalite
- Test: `pytest -q` (VS Code task: **Tests**)
- Lint: `ruff check .` (VS Code task: **Lint (ruff)**)

## Troubleshooting
- VS Code “Import could not be resolved” görürsen, Python interpreter olarak workspace içindeki `.venv` seçili olduğundan emin ol.
