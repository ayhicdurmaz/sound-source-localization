## Genel Bakış

Bu modül, verilen parametreler ile bir akustik simülasyon hazırlar.

- `Sample_Rate`, `Signal_duration`, `n_samples`, `room_size`, `uploads` (ses dosyaları), `mic_center` değişkenleri ile simülasyon hazırlanır
- Bu değişkenler çoğunlukla frontend tarafındaki config parametrelerinden gelir
- Eğer `None` bırakılırsa default değerler kullanılır
---
## Fonksiyonlar

#### `_mic_array_3d`

- Verilen `mic_center` pozisyonunda çalışır
- Belirlenen çap ve mikrofon sayısına göre bir mikrofon array’i oluşturur
- Şu an için:
    - Sadece UCA (çembersel) yapı kullanılmaktadır
    - Başka bir mikrofon dizilim modu yoktur

---

#### `_source_position`

- Uzaklık ve açılara göre `mic_center` referans alınarak **(x, y)** koordinatları hesaplanır
- Böylece ses kaynağının geleceği konum belirlenir

Kısıtlar:
- Z ekseninde hareket yoktur
- Kaynak ve mikrofonlar Z ekseninde aynı düzlemdedir

---

#### `_generate_source_signal`

- İki tür sinyal üretilebilir:
    - White noise
    - Kullanıcı tarafından verilen ses dosyası

İşleyiş detayları:
- Eğer ses dosyasının sample rate’i farklıysa:
    - Basit **interpolasyon** ile yeniden örnekleme yapılır
- Eğer ses dosyası:
    - **Kısa ise** → döngüye alınır
    - **Uzun ise** → rastgele bir kısmı seçilir ve istenen süreye kırpılır

---

#### `simulate`

Ana simülasyon fonksiyonudur ve tüm süreci yürütür.

Adımlar:
1. Tüm parametreler ayarlanır
2. `pyroomacoustics` kullanılarak **shoebox oda modeli** oluşturulur
3. Mikrofonlar ve ses kaynağı ortama yerleştirilir
4. Simülasyon çalıştırılır
5. Elde edilen sinyaller istenilen sample sayısına kırpılır
6. Mikrofon sinyallerine gürültü eklenir:
    - Her mikrofon için **kendi SNR değerine göre noise eklenir**
    - Bu gürültü **her mikrofonda farklıdır**
7. Ambient noise eklenir:
    - Tüm mikrofonlara **aynı sinyal** eklenir
8. Son olarak:
    - Tüm sinyaller **[-1, 1] aralığına normalize edilir**
Not:
- İleride **çok kaynaklı ses desteği eklenebilir**

---

#### `encode_wav_bytes`

- `float32` formatındaki veriyi **WAV byte formatına dönüştürür**

---
## Ek Notlar

- Sistem şu an tek ses kaynağı ile çalışır
- Mikrofon ve kaynak aynı düzlemdedir
- Z ekseni desteklenmez