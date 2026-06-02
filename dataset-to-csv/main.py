import os
import json
import glob
import pandas as pd
from sklearn.model_selection import train_test_split

dataset_dir = "/home/ay/Documents/dataset"
data_list = []

print(f"Veri seti klasörü: {dataset_dir}")

session_folders = glob.glob(os.path.join(dataset_dir, "session_*"))
print(f"Toplam {len(session_folders)} adet 'session_*' klasörü bulundu.")

if not session_folders:
    print("UYARI: 'session_*' ile başlayan hiçbir klasör bulunamadı. Klasör adlarını kontrol edin.")

for folder_path in session_folders:
    if os.path.isdir(folder_path):
        print(f"\n-> İşleniyor: {folder_path}")

        gen_config_path = os.path.join(folder_path, "config_session.json")

        if not os.path.exists(gen_config_path):
            print(f"  - UYARI: '{os.path.basename(gen_config_path)}' bulunamadı, bu klasör atlanıyor.")
            continue

        with open(gen_config_path, 'r', encoding='utf-8') as f:
            gen_cfg = json.load(f)

        room_dim = (gen_cfg.get("room_x"), gen_cfg.get("room_y"), gen_cfg.get("room_z"))

        wav_files = glob.glob(os.path.join(folder_path, "*.wav"))
        print(f"  - {len(wav_files)} adet .wav dosyası bulundu.")

        for wav_path in wav_files:
            base_name = os.path.splitext(os.path.basename(wav_path))[0]

            sample_config_path = os.path.join(folder_path, f"{base_name}.json")

            if os.path.exists(sample_config_path):
                with open(sample_config_path, 'r', encoding='utf-8') as f:
                    sample_cfg = json.load(f)

                source_info = sample_cfg.get("sources", [{}])[0]

                data_list.append({
                    "audio_path": wav_path,
                    "azimuth_deg": source_info.get("azimuth_deg"),
                    "distance_m": source_info.get("distance_m"),
                    "pos_x": source_info.get("source_pos", [None, None, None])[0],
                    "pos_y": source_info.get("source_pos", [None, None, None])[1],
                    "pos_z": source_info.get("source_pos", [None, None, None])[2],
                    "snr_db": gen_cfg.get("snr_db"),
                    "ambient_noise_db": gen_cfg.get("ambient_snr_db"),
                    "rt60": gen_cfg.get("rt60"),
                    "room_dimension": f"({room_dim[0]}, {room_dim[1]}, {room_dim[2]})"
                })
            else:
                print(f"    - UYARI: '{os.path.basename(wav_path)}' için eşleşen '{os.path.basename(sample_config_path)}' bulunamadı.")

df = pd.DataFrame(data_list)
print(f"Toplam başarıyla eşleşen sample sayısı: {len(df)}")

if len(df) > 0:
    df.to_csv("all_metadata.csv", index=False)
    print(f"Tüm metadata kaydedildi: all_metadata.csv ({len(df)} satır)")

    train_df, test_df = train_test_split(df, test_size=0.20, random_state=42)

    train_df.to_csv("train_metadata.csv", index=False)
    test_df.to_csv("test_metadata.csv", index=False)

    print(f"Eğitim seti boyutu: {len(train_df)} satır")
    print(f"Test seti boyutu: {len(test_df)} satır")
else:
    print("Hiç eşleşen veri bulunamadı. JSON veya WAV isimlendirmelerini kontrol etmeliyiz.")