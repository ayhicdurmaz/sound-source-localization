## Genel Bilgiler

- **FastAPI Title**: `Acoustic Sim Platform`
- Bu servis, ses dosyası yönetimi ve akustik simülasyon süreçlerini API üzerinden sağlar
---
## Yardımcı Fonksiyonlar

### `_to_python`

- Basit tür dönüşümleri yapar
- Gelen verileri Python veri tiplerine çevirir

---

## API Endpoints

### `POST /api/upload-audio`

#### `upload_audio`

- Ses dosyasını yüklemek için kullanılır
- Dosya formatı kontrol edilir
- Dosya adı:
    - **UUID (Universally Unique Identifier)** ile yeniden adlandırılır
- Dosya, sistemdeki upload klasörüne kaydedilir

---

### `GET /api/uploads`

#### `list_uploads`

- Upload klasöründeki yüklü ses dosyalarını listeler

---

### `DELETE /api/uploads/{filename}`

#### `delete_upload`

- Belirtilen dosyayı dosya sisteminden siler

---

### `WebSocket /ws/simulate`

#### `ws_simulate`

- WebSocket tabanlı bir endpointtir
- Frontend’den gelen config dosyasını alır
- Simülasyonu başlatır

İşleyiş:
1. Config alınır
2. Simülasyon:
    - `simulator` modülü kullanılarak gerçekleştirilir
3. Üretilen veriler:
    - `dataset_manager` kullanılarak ilgili session’a kaydedilir

Üretim süreci:

- Üretilecek ses dosyası sayısı kadar döngü çalışır
- Her iterasyonda:
    - Yeni bir sample üretilir
    - Üretilen veri arayüze (frontend) gönderilir
Not:
- Döngü içinde bir **bekleme süresi (delay)** vardır
- Bu süre **kısaltılabilir / optimize edilebilir**

---

### `GET /health`

#### `health`

- Servisin durumunu kontrol etmek için kullanılır
- Eğer sistem düzgün çalışıyorsa:
    - `"ok"` sonucu döndürür

---

## Notlar

- Dosya yükleme işlemleri UUID ile çakışma riskine karşı güvenli hale getirilmiştir
- Simülasyon süreci gerçek zamanlı olarak WebSocket üzerinden frontend’e aktarılır
- Dataset oluşturma süreci session bazlı yönetilir