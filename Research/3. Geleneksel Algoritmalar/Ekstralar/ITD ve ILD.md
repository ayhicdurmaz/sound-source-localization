Doğada insanların ve hayvanların (veya otonom robotların) sadece iki sensör (kulak/mikrofon) kullanarak sesin yönünü bulmasını sağlayan temel mekanizma **Duplex Teorisi (İkili Teori)** olarak adlandırılır. Bu teori, ses dalgasının frekansına bağlı olarak beynin iki farklı fiziksel ipucunu (ITD ve ILD) kullandığını söyler:

**1. ITD (Interaural Time Difference - Kulaklar Arası Zaman Farkı):**

Sesin bir kulağa (veya mikrofona) diğerinden daha erken ulaşmasıdır. Tıpkı TDOA mantığı gibi çalışır. Beyin, bu iki sinyal arasındaki milisaniyelik faz/zaman kaymasını hesaplayarak yönü bulur. **Özellikle düşük frekanslarda (< 1500 Hz) etkilidir.** Çünkü düşük frekansların dalga boyu uzundur ve iki kulak arasındaki mesafeden (yaklaşık 18-20 cm) daha büyüktür. Bu sayede dalga, bir kulaktan diğerine geçerken kendini tekrar etmez ve faz karmaşası (aliasing) yaşanmaz.

**2. ILD (Interaural Level/Intensity Difference - Kulaklar Arası Şiddet Farkı):**

Ses dalgasının, araya giren fiziksel bir engel (insan kafası, robot gövdesi vb.) nedeniyle bir tarafta yüksek, diğer tarafta düşük şiddette duyulmasıdır. **Özellikle yüksek frekanslarda (> 1500 Hz) etkilidir.** Çünkü düşük frekanslı seslerin dalga boyu kafadan büyük olduğu için kafanın etrafından kolayca dolanır (kırınım/diffraction) ve iki tarafta da aynı şiddette duyulur. Ancak yüksek frekanslı (tiz) seslerin dalga boyu kafadan küçüktür; engele çarparlar ve kafanın diğer tarafında devasa bir **"Akustik Gölge" (Acoustic Shadow)** oluştururlar. Beyin bu şiddet farkını ölçerek yönü bulur.

**Püf Noktalar ve Sınırlar:** Bu iki yöntem doğanın bir mucizesidir; düşük frekanslarda ITD ile zamanı okurken, ITD'nin faz karmaşası yaşayıp çöktüğü yüksek frekanslarda nöbeti ILD devralır ve akustik gölgeye bakar. Ancak her iki sistem de "Ön-Arka Karmaşası" (Cone of Confusion) adı verilen bir fiziksel zaafa sahiptir. Sadece iki sensör olduğu için, tam karşıdan ($0^\circ$) gelen ses ile tam arkadan ($180^\circ$) gelen sesin ITD ve ILD değerleri tamamen aynıdır ($0$'dır). İnsan beyni bu sorunu çözmek için kafasını hafifçe çevirir veya kulak kepçesinin (HRTF - Head Related Transfer Function) seste yarattığı dikey bozulmaları kullanır.

## Literatürdeki Temel Kaynak

İnsan beyninin sesi nasıl konumlandırdığına dair bu iki temel fiziksel ipucunu (ITD ve ILD) ilk kez ortaya koyan ve "Duplex Theory" (İkili Teori) adıyla literatüre kazandıran efsanevi fizikçi Lord Rayleigh'in 1907 tarihli makalesidir:

> **Makale:** _On Our Perception of Sound Direction_
> 
> **Yazar:** Lord Rayleigh (J. W. Strutt)
> 
> **Yayın:** Philosophical Magazine, Vol. 13, No. 74, Şubat 1907.

## Matematiksel Gösterim ve Adım Adım İşleyiş

Sistemde aralarında fiziksel bir engel (örneğin $a$ yarıçaplı küresel bir kafa modeli) bulunan iki adet mikrofon (Sol ve Sağ) olduğunu varsayalım. Gelen sesin açısı $\theta$ olsun (Tam karşı $0^\circ$, tam sağ $90^\circ$).

**1. ITD'nin Hesaplanması (Woodworth Modeli):**

Ses düz bir çizgide gelip kafanın etrafından dolandığında, iki mikrofon arasındaki zaman farkı sadece doğrusal mesafeyle değil, kafanın etrafındaki yayın uzunluğuyla da hesaplanır. Bu durum ünlü Woodworth denklemiyle ifade edilir:

$$ITD = \frac{a}{c} (\theta + \sin\theta)$$

- **Açıklama:** Burada $a$ kafa/engel yarıçapı, $c$ ses hızı, $\theta$ ise radyan cinsinden geliş açısıdır. $\theta = 0^\circ$ olduğunda ITD sıfırdır. Açı büyüdükçe zaman farkı trigonometrik olarak artar.
    

**2. ILD'nin Hesaplanması:**

ILD, yüksek frekanslı dalgaların kafa tarafından yutulması ve yansıtılması sonucu oluşan basınç (şiddet) farkıdır. Zamanla değil, genlikle (amplitude) ilgilidir. Sol kulağa gelen ses basıncı $p_L(f)$, sağ kulağa gelen ses basıncı $p_R(f)$ olmak üzere ILD, genellikle Desibel (dB) cinsinden ifade edilir:

$$ILD(f, \theta) = 20 \log_{10} \left( \frac{|p_L(f, \theta)|}{|p_R(f, \theta)|} \right)$$

- **Açıklama:** Bu değer frekansa ($f$) ve açıya ($\theta$) son derece bağlıdır. Düşük frekanslarda oran $1$'e yaklaşır (yani ILD $\approx 0$ dB olur, gölge oluşmaz). Frekans 3000-4000 Hz'in üzerine çıktığında ve ses tam yandan ($90^\circ$) geldiğinde, ILD farkı 20 dB gibi devasa seviyelere ulaşarak beynin yönü kolayca kestirmesini sağlar.