## Genel Bakış

Bu modül, simülasyon sonucunda üretilen verilerin dosya sistemi üzerinde organize edilmesini ve saklanmasını sağlar.
- Simülasyon çıktıları belirli bir dataset klasörü altında tutulur
- Her oturum (session) için ayrı bir klasör yapısı oluşturulur
- Ses verileri (`.wav`) ve metadata (`.json`) birlikte kaydedilir

---
## Sabitler

### `dataset_root`

- Datasetlerin kaydedileceği ana klasörü temsil eder
- Simülasyon sonucunda oluşturulan tüm datasetler bu klasör altına kaydedilir

---
## Fonksiyonlar

### `ensure_session_dir`

- Girdi olarak bir **session id** alır
- Bu session id kullanılarak `dataset_root` altında bir klasör oluşturur
Amaç:
- Her simülasyon oturumu için ayrı bir dizin yapısı oluşturmak
- Verilerin düzenli ve izole şekilde saklanmasını sağlamak

---

### `save_sample`

- `.wav` ve `.json` dosyalarını kaydeder
- Sample’ları sırasına göre numaralandırır
Detaylar:
- Her sample için:
    - Ses verisi `.wav` formatında saklanır
    - İlgili metadata `.json` dosyası olarak kaydedilir
- Dosya isimleri sıralı olacak şekilde numaralandırılır

---
## Notlar

- Dataset yapısı session bazlı organize edilir
- Her sample hem ses hem metadata içerecek şekilde saklanır