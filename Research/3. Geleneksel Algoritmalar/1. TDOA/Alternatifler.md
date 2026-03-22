## 1. GCC Ailesinin Diğer Filtreleri (SCOT ve Eckart)

GCC-PHAT'ın kalbindeki frekans ağırlıklandırma filtresinin değiştirilmiş versiyonlarıdır. PHAT tüm frekansları eşitlerken, bu yöntemler sinyal ve gürültünün yapısına göre seçici davranır.

- **Artıları (+):**
    - **SCOT (Smoothed Coherence Transform):** Sinyal-Gürültü oranının (SNR) düşük olduğu, yani ortamda çok fazla gürültü olan durumlarda PHAT'tan daha temiz sonuçlar verebilir.
    - **Eckart:** Ortamdaki spesifik gürültünün (örneğin sabit bir motor sesi) karakteristik profili önceden biliniyorsa, teorik olarak **en kusursuz** zaman farkını verir.
- **Eksileri (-):**
    - **Eckart:** Gerçek dünyada akustik ortam gürültüsünü önceden tam olarak bilmek imkansıza yakın olduğu için pratik kullanımı neredeyse yoktur.
    - **SCOT:** Yankılı (reverberant) ortamlarda performansı ciddi şekilde düşer ve PHAT'ın gerisinde kalır.
## 2. AED (Adaptive Eigenvalue Decomposition)

Sadece gelen sinyale odaklanmak yerine, ortamın fiziksel yapısını (Oda İmpuls Yanıtı - RIR) körlemesine tahmin edip yankı filtrelerini tersine mühendislikle çözerek çalışan gelişmiş bir yöntemdir.

- **Artıları (+):**
    - Kapalı ve yüksek yankılı (RT60 süresi uzun) ortamlarda **tartışmasız en başarılı** TDOA yöntemidir. Yankıyı sistemin kafasını karıştıran bir hata olarak değil, çözülmesi gereken bir matematiksel parametre olarak gördüğü için harika sonuçlar verir.
- **Eksileri (-):**
    - Ağır matris işlemleri ve adaptif filtreleme gerektirdiği için **işlemci yükü astronomik seviyededir**. Kısıtlı donanıma sahip gömülü sistemlerde (SoC veya mikrodenetleyicilerde) gecikmesiz (real-time) çalıştırılması çok zordur.

## 3. AMDF (Average Magnitude Difference Function)

Sinyalleri frekans uzayına (FFT) hiç taşımadan, doğrudan zaman uzayında birbiri üzerinden kaydırıp genlik farklarının mutlak değerini alarak çalışan oldukça ilkel bir yöntemdir.

- **Artıları (+):**
    - FFT, karmaşık sayılar veya matris tersi alma gibi hiçbir ağır işlem barındırmaz. **Hesaplama maliyeti neredeyse sıfırdır.** Çok düşük kapasiteli, basit işlemcilerde bile anında çalışır.
- **Eksileri (-):**    
    - Yankıya ve çevresel gürültüye karşı **tamamen savunmasızdır**. Çözünürlüğü ve hassasiyeti çok düşük olduğu için, modern ve çok mikrofonlu (örn. 8'li dairesel) sistemlerde güvenilir bir yön bulma verisi sağlayamaz.