# 🔊 Acoustic Sim Platform

Gerçekçi oda akustiği simülasyonu ile çok kanallı mikrofon dizi verisi üretmeye yarayan interaktif bir platform. Makine öğrenmesi ve ses işleme araştırmaları için etiketli dataset oluşturmayı hedefler.

---

## 📋 İçindekiler

1. [Genel Bakış](#genel-bakış)
2. [Mimari](#mimari)
3. [Özellikler](#özellikler)
4. [Kurulum](#kurulum)
5. [Kullanım](#kullanım)
6. [Konfigürasyon Parametreleri](#konfigürasyon-parametreleri)
7. [Akustik Model](#akustik-model)
8. [Dataset Yapısı](#dataset-yapısı)
9. [API Referansı](#api-referansı)
10. [Bileşenler](#bileşenler)
11. [Proje Dosya Yapısı](#proje-dosya-yapısı)

---

## Genel Bakış

Platform şu iş akışını otomatikleştirir:

1. Kullanıcı oda boyutları, mikrofon dizisi ve gürültü parametrelerini arayüzden ayarlar.
2. Backend her adımda rastgele bir kaynak konumu (azimut + mesafe) seçer.
3. [pyroomacoustics](https://pyroomacoustics.readthedocs.io/) ile oda impuls yanıtı (RIR) hesaplanır ve kaynak sinyali konvolüsyona sokulur.
4. Mikrofon öz gürültüsü (bağımsız per-kanal) ve ortam gürültüsü (tüm kanallara aynı — diffuse field) eklenir.
5. Her örnek için `sample_XXXXX.wav` (çok kanallı) ve `sample_XXXXX.json` (etiket) diske kaydedilir.
6. Frontend gerçek zamanlı olarak waveform, oda görünümü ve etiket bilgisini gösterir.

---

## Mimari

```
┌─────────────────────────────────────────────┐
│              Tarayıcı (React/Vite)          │
│                                             │
│  ConfigPanel ─┐                             │
│  PolarView    ├─ WebSocket ─────────────┐   │
│  WaveformPanel│  (ws://localhost:8000)  │   │
│  LabelDisplay ┘                         │   │
└─────────────────────────────────────────│───┘
                                          │
                          JSON mesajlar (sample / done / error)
                                          │
┌─────────────────────────────────────────▼───┐
│          Backend (FastAPI + uvicorn)        │
│                                             │
│  /ws/simulate  ──►  simulator.py            │
│                      └─ pyroomacoustics     │
│                      └─ numpy / scipy       │
│                                             │
│  /api/upload-audio  ──►  uploads/           │
│  /api/uploads       ──►  uploads/           │
│                                             │
│  dataset_manager.py ──►  datasets/          │
│                          └─ session_XXX/    │
│                              └─ sample_00000.wav
│                              └─ sample_00000.json
└─────────────────────────────────────────────┘
```

| Katman    | Teknoloji                              | Port  |
|-----------|----------------------------------------|-------|
| Frontend  | React 19, Vite 7, saf SVG              | 5173  |
| Backend   | Python 3.9, FastAPI, uvicorn, asyncio  | 8000  |
| Konteyner | Docker + Docker Compose (bridge ağı)   | —     |

---

## Özellikler

### Backend
- **Gerçekçi oda simülasyonu** — pyroomacoustics `ShoeBox` modeli, Sabine formülüne dayalı RT60 → absorpsiyon katsayısı dönüşümü
- **Dairesel ULA mikrofon dizisi** — istenilen sayıda eleman, isteğe bağlı merkez mikrofon
- **Üç kaynak sinyali tipi** — Beyaz gürültü, sinüs dalgası (rastgele frekans), özel ses dosyası
- **İki ayrı gürültü katmanı**
  - *Mikrofon öz gürültüsü*: her kanala bağımsız Gaussian gürültü (elektronik gürültü modeli)
  - *Ortam gürültüsü*: tüm kanallara aynı sinyal — diffuse field varsayımı (trafik, kalabalık vb. çok uzak kaynak)
- **Near-field / Far-field etiketleme** — Fraunhofer sınırı `d_ff = 2D²/λ` formülüyle hesaplanır (D=dizi çapı, λ=c/f_Nyquist)
- **Asenkron üretim** — simülasyon CPU-bound olduğundan `run_in_executor` ile thread pool'da çalışır, WebSocket engellenmez
- **Ses dosyası yükleme** — WAV/MP3/FLAC/OGG/M4A desteklenir; stereo→mono, örnekleme hızı uyarlaması (scipy resample_poly)

### Frontend
- **Sonsuz Kartezyen koordinat görünümü** — pan (sürükle), zoom (tekerlek), sıfırla (çift tık); otomatik `niceStep` ızgara aralığı
- **Gerçek zamanlı waveform** — her kanal için SVG polilini + RMS göstergesi
- **Sekmeli config paneli** — Dataset / Mikrofon / Ortam / Çıktı
- **Near-field bilgi kutusu** — hesaplanan FF sınırı, Nyquist frekansı, dalga boyu
- **Etiket görüntüleyici** — tüm JSON alanları gruplandırılmış tablo halinde

---

## Kurulum

### Gereksinimler

- [Docker](https://docs.docker.com/get-docker/) ve [Docker Compose](https://docs.docker.com/compose/)

### Adımlar

```bash
# 1. Repoyu klonla
git clone <repo-url>
cd acoustic-sim-platform

# 2. Her iki servisi birlikte derle ve başlat
docker compose up -d --build

# 3. Tarayıcıda aç
# Frontend → http://localhost:5173
# Backend API docs → http://localhost:8000/docs
```

> **Not:** İlk `docker compose up --build` pyroomacoustics ve scipy derlediği için 3-5 dakika sürebilir. Sonraki başlatmalarda imaj önbellekten gelir.

### Servis Yönetimi

```bash
# Servisleri başlat (build etmeden)
docker compose up -d

# Sadece backend'i yeniden derle
docker compose up -d --build backend

# Logları izle
docker logs acoustic-sim-platform_frontend_1 -f
docker logs <backend-container-id> -f

# Durdur
docker compose down
```

### Dataset Temizleme

Dataset dosyaları Docker tarafından `root` sahibiyle oluşturulur. Silmek için:

```bash
docker exec <backend-container-id> sh -c "rm -rf /app/datasets/session_*"
```

---

## Kullanım

### Temel Akış

1. **Sol panel** → Config sekmelerinden parametreleri ayarla.
2. **▶ Start** butonuna tıkla → WebSocket bağlantısı kurulur.
3. Her simülasyon adımında:
   - Orta panel: oda görünümü güncellenir (kaynak, mikrofonlar, FF sınırı)
   - Sağ üst: mikrofon waveform'ları gösterilir
   - Sağ alt: JSON etiket tablosu güncellenir
4. Simülasyon tamamlanınca `backend/datasets/session_<id>/` klasöründe tüm veriler hazır.

### Room View Kontrolleri

| Eylem | Kontrol |
|-------|---------|
| Pan (kaydır) | Sol tık + sürükle |
| Zoom (yakınlaştır/uzaklaştır) | Fare tekerleği |
| Görünümü sıfırla | Çift tık veya ⟲ butonu |

### Özel Ses Dosyası Kullanımı

1. Config paneli → **Çıktı** sekmesi → **Signal Type**: `Custom Audio`
2. **Ses Dosyası Yükle** bölümünden dosya yükle (WAV/MP3/FLAC/OGG/M4A).
3. Listeden dosyayı seç (yeşil ✓ işareti seçili olanı gösterir).
4. Simülasyonu başlat; her adımda dosyadan rastgele 1 saniyelik segment alınır.

### Ortam Gürültüsü Dosyası

Aynı ses yükleme arayüzü **Ortam** sekmesinde de mevcuttur. Burada gerçek ortam ses kayıtları (trafik, kalabalık vb.) kullanılabilir. Dosya yüklenmezse Gaussian beyaz gürültü kullanılır.

---

## Konfigürasyon Parametreleri

Tüm varsayılan ve aralık değerleri `frontend/src/ui.config.js` dosyasında merkezi olarak tanımlanır.

### 📊 Dataset Sekmesi

| Parametre | Açıklama | Varsayılan | Aralık |
|-----------|----------|-----------|--------|
| `n_samples` | Üretilecek örnek sayısı | 20 | 1 – 500 |
| `step_delay_ms` | Adımlar arası bekleme | 300 ms | 50 – 2000 ms |
| `signal_type` | Kaynak sinyali tipi | `custom` | white_noise / sine / custom |
| `field_mode` | Near-field / Far-field mod | `nearfield` | nearfield / farfield |
| `min_distance` | Minimum kaynak mesafesi | 0.5 m | — |
| `max_distance` | Maksimum kaynak mesafesi | 2.5 m | — |

> **field_mode** yalnızca etiket bilgisi için kullanılır; kaynak mesafesi rastgele seçilir ve `is_far_field` Fraunhofer formülüyle otomatik hesaplanır.

### 🎙 Mikrofon Sekmesi

| Parametre | Açıklama | Varsayılan | Aralık |
|-----------|----------|-----------|--------|
| `n_mics` | Dairesel dizideki mikrofon sayısı | 7 | 2 – 15 |
| `mic_radius` | Dizi yarıçapı | 0.15 m | 0.01 – 1.0 m |
| `center_mic` | Merkeze ek mikrofon | `true` | — |
| `snr_db` | Mikrofon öz SNR (yüksek = temiz) | 40 dB | -10 – 60 dB |
| `mic_center_x/y/z` | Dizi merkezi koordinatları | `null` (oda ortası) | — |

#### Near-Field Bilgi Kutusu

Mikrofon sekmesinde, seçili parametrelere göre hesaplanan değerler gösterilir:

```
d_ff = 2D²/λ
D  = 2 × mic_radius        (dizi çapı)
λ  = c / f_Nyquist         (Nyquist dalga boyu)
f_Nyquist = sample_rate / 2
```

### 🏠 Ortam Sekmesi

| Parametre | Açıklama | Varsayılan | Aralık |
|-----------|----------|-----------|--------|
| `room_x` | Oda genişliği (X) | 10.0 m | 2.0 – 20.0 m |
| `room_y` | Oda derinliği (Y) | 10.0 m | 2.0 – 20.0 m |
| `room_z` | Oda yüksekliği (Z) | 3.0 m | 2.0 – 10.0 m |
| `rt60` | Çınlama süresi | 0.3 s | 0.05 – 2.0 s |
| `ambient_snr_db` | Ortam SNR (düşük = daha gürültülü) | 40 dB | -10 – 60 dB |

### 💾 Çıktı Sekmesi

| Parametre | Açıklama | Varsayılan | Aralık |
|-----------|----------|-----------|--------|
| `duration_sec` | Her örneğin süresi | 1.0 s | 0.5 – 5.0 s |
| `sample_rate` | Örnekleme hızı | 16000 Hz | 8000 / 16000 / 22050 / 44100 / 48000 |

---

## Akustik Model

### Oda Simülasyonu

pyroomacoustics `ShoeBox` modeli kullanılır. RT60 → absorpsiyon katsayısı dönüşümü Sabine formülüyle yapılır:

```python
e_absorption, max_order = pra.inverse_sabine(rt60, room_dims)
room = pra.ShoeBox(room_dims, fs=sample_rate,
                   materials=pra.Material(e_absorption),
                   max_order=max_order)
```

### Mikrofon Dizisi

XY düzleminde dairesel tekdüze doğrusal dizi (ULA):

```
x_i = cx + r · cos(2πi/N)
y_i = cy + r · sin(2πi/N)
z_i = cz   (sabit)
i = 0, 1, ..., N-1
```

`center_mic=True` ise (cx, cy, cz) noktasına ek bir mikrofon eklenir.

### Gürültü Modelleri

**Mikrofon öz gürültüsü** (elektronik gürültü):
```
noise_power = signal_power / 10^(snr_db/10)
noise[i] ~ N(0, noise_power)  ← her kanal bağımsız
```

**Ortam gürültüsü** (diffuse field — çok uzak kaynak):
```
ambient_power = signal_power / 10^(ambient_snr_db/10)
ambient[t] ~ N(0, ambient_power)  ← tek sinyal, tüm kanallara aynı
```
> Ortam kaynakları (trafik, kalabalık) mikrofondan çok uzak olduğundan array boyutu (cm mertebesi) phase farkı ihmal edilebilir düzeydedir. Bu nedenle tüm kanallar aynı ortam sinyalini alır.

### Fraunhofer Sınırı

```
d_ff = 2D² / λ
D    = 2 × mic_radius      (dizi çapı)
λ    = 343 / (sr/2)        (Nyquist frekansında dalga boyu)
```

- `distance < d_ff` → **Near-field** (küresel dalga, eğri dalga cephesi)
- `distance ≥ d_ff` → **Far-field** (düzlemsel dalga, paralel dalga cephesi)

---

## Dataset Yapısı

Her simülasyon oturumu `backend/datasets/session_<unix_ts>_<hex6>/` klasörüne kaydedilir.

```
datasets/
└── session_1772424000_de62d9/
    ├── sample_00000.wav    ← çok kanallı WAV (n_mics kanal, 16-bit PCM)
    ├── sample_00000.json   ← etiket
    ├── sample_00001.wav
    ├── sample_00001.json
    └── ...
```

### JSON Etiket Formatı

```json
{
  "sample_index":     0,
  "session_id":       "session_1772424000_de62d9",

  "azimuth_deg":      127.34,
  "distance_m":       1.82,
  "source_pos":       [5.92, 6.44, 1.5],

  "field_mode":       "nearfield",
  "n_mics":           7,
  "center_mic":       true,
  "mic_radius_m":     0.15,
  "mic_center":       [5.0, 5.0, 1.5],

  "ff_boundary_m":    0.0264,
  "is_far_field":     true,

  "room_dims_m":      [10.0, 10.0, 3.0],
  "rt60":             0.3,

  "signal_type":      "custom",
  "custom_audio_file":"a1b2c3d4_konusma.wav",
  "snr_db":           40,
  "ambient_snr_db":   40,

  "sample_rate":      16000,
  "n_audio_samples":  16000
}
```

### WAV Dosya Formatı

| Özellik | Değer |
|---------|-------|
| Format | PCM |
| Bit derinliği | 16-bit |
| Örnekleme hızı | `sample_rate` (16000 Hz varsayılan) |
| Kanal sayısı | `n_mics` (+ 1 merkez varsa) |
| Süre | `duration_sec` (1.0 s varsayılan) |
| Kanal sırası | M1, M2, ..., MN, [C] |

Interleave sırası: `[M1[0], M2[0], ..., MN[0], M1[1], M2[1], ...]`

---

## API Referansı

### WebSocket: `ws://localhost:8000/ws/simulate`

**Bağlantı protokolü:**

```
Client → Server:  config JSON (bağlantı kurulduktan hemen sonra)
Server → Client:  session_start | sample | done | error
```

**1. Client'ten Config Mesajı:**

```json
{
  "n_samples":        20,
  "n_mics":           7,
  "mic_radius":       0.15,
  "snr_db":           40,
  "rt60":             0.3,
  "signal_type":      "custom",
  "custom_audio_file":"a1b2c3d4_ses.wav",
  "field_mode":       "nearfield",
  "min_distance":     0.5,
  "max_distance":     2.5,
  "step_delay_ms":    300,
  "center_mic":       true,
  "ambient_snr_db":   40,
  "ambient_audio_file": null,
  "room_x":           10.0,
  "room_y":           10.0,
  "room_z":           3.0,
  "mic_center_x":     null,
  "mic_center_y":     null,
  "mic_center_z":     null
}
```

**2. Server → `session_start`:**

```json
{
  "type":       "session_start",
  "session_id": "session_1772424000_de62d9",
  "total":      20
}
```

**3. Server → `sample`** (her adımda):

```json
{
  "type":    "sample",
  "index":   0,
  "total":   20,
  "label":   { ... },
  "waveform": [[0.01, -0.02, ...], ...],
  "wav_b64": "UklGRi...",
  "paths": {
    "wav_path":  "session_xxx/sample_00000.wav",
    "json_path": "session_xxx/sample_00000.json"
  }
}
```

> `waveform`: `(n_mics, ~512)` float array — görselleştirme için downsampled  
> `wav_b64`: tam çözünürlüklü çok kanallı WAV, base64 ile kodlanmış

**4. Server → `done`:**

```json
{
  "type":       "done",
  "session_id": "session_1772424000_de62d9",
  "total":      20
}
```

**5. Server → `error`:**

```json
{
  "type":    "error",
  "message": "Ses dosyası bulunamadı: xxx.wav"
}
```

---

### REST Endpoint'leri

#### `POST /api/upload-audio`

Ses dosyası yükler.

- **İstek:** `multipart/form-data`, `file` alanı
- **Desteklenen formatlar:** `.wav .mp3 .flac .ogg .m4a`

```json
{
  "filename":      "a1b2c3d4_konusma.wav",
  "original_name": "konusma.wav",
  "path":          "/app/uploads/a1b2c3d4_konusma.wav",
  "size_bytes":    102400
}
```

#### `GET /api/uploads`

Sunucudaki ses dosyalarını listeler.

```json
{
  "files": [
    { "filename": "a1b2c3d4_konusma.wav", "size_bytes": 102400 }
  ]
}
```

#### `DELETE /api/uploads/{filename}`

Yüklü bir ses dosyasını siler.

```json
{ "deleted": "a1b2c3d4_konusma.wav" }
```

#### `GET /health`

Servis sağlık kontrolü.

```json
{ "status": "ok" }
```

Swagger UI: `http://localhost:8000/docs`

---

## Bileşenler

### Backend

| Dosya | Açıklama |
|-------|----------|
| `app/main.py` | FastAPI uygulama, WebSocket endpoint, REST endpoint'leri |
| `app/simulator.py` | Oda simülasyonu, mikrofon dizisi, gürültü ekleme, WAV encoding |
| `app/dataset_manager.py` | WAV + JSON dosyalarını session klasörüne kaydetme |

### Frontend

| Bileşen | Açıklama |
|---------|----------|
| `App.jsx` | Ana uygulama, WebSocket bağlantısı, state yönetimi |
| `ConfigPanel.jsx` | Sekmeli konfigürasyon paneli (4 sekme) |
| `PolarView.jsx` | Sonsuz Kartezyen koordinat görünümü (oda, microfonlar, kaynak) |
| `WaveformPanel.jsx` | Çok kanallı waveform + RMS göstergesi |
| `LabelDisplay.jsx` | JSON etiket tablosu (gruplandırılmış) |
| `StatusBar.jsx` | Üst durum çubuğu, ilerleme barı |
| `AudioUpload.jsx` | Ses dosyası yükleme ve seçim arayüzü |
| `ui.config.js` | Tüm slider/input min-max-step-default değerleri |

---

## Proje Dosya Yapısı

```
acoustic-sim-platform/
│
├── docker-compose.yml
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py            ← FastAPI + WebSocket
│   │   ├── simulator.py       ← pyroomacoustics + gürültü
│   │   └── dataset_manager.py ← disk I/O
│   ├── datasets/              ← üretilen session'lar (volume mount)
│   └── uploads/               ← yüklenen ses dosyaları (volume mount)
│
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── App.jsx
        ├── App.css
        ├── main.jsx
        ├── index.css
        ├── ui.config.js       ← merkezi UI sabitleri
        └── components/
            ├── ConfigPanel.jsx
            ├── PolarView.jsx
            ├── WaveformPanel.jsx
            ├── LabelDisplay.jsx
            ├── StatusBar.jsx
            └── AudioUpload.jsx
```

---

## Bağımlılıklar

### Backend (Python 3.9)

| Paket | Kullanım |
|-------|----------|
| `fastapi` | HTTP + WebSocket API çerçevesi |
| `uvicorn[standard]` | ASGI sunucu |
| `pyroomacoustics` | Oda akustiği simülasyonu (RIR hesaplama) |
| `numpy` | Sayısal hesaplama |
| `scipy` | Örnekleme hızı dönüşümü (`resample_poly`) |
| `soundfile` | Ses dosyası okuma (WAV/FLAC/OGG) |
| `python-multipart` | Dosya yükleme (form-data) |

### Frontend (Node 20)

| Paket | Kullanım |
|-------|----------|
| `react` 19 | UI çerçevesi |
| `vite` 7 | Geliştirme sunucusu ve bundler |
| `lucide-react` | Simge seti |
