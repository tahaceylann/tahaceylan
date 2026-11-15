# Paramanya tarzı 3D dijital masa oyunu

Claude Tasarım Paketi'ndeki iki aşamanın uygulaması.

```
paramanya/
├─ blender/uret_assetler.py     Aşama 1: bpy ile 12 FBX üretir
└─ Unity/Assets/
   ├─ Models/*.fbx              Aşama 1 çıktısı (hazır, üretilmiş)
   └─ Scripts/{Core,Board,Data,UI,Editor}   Aşama 2: C# kodları
```

## Aşama 1 — Blender

Blender'da **Scripting** sekmesi → `blender/uret_assetler.py` dosyasını aç → **Run Script**.
FBX'ler betiğin yanındaki `fbx/` klasörüne yazılır (komut satırı: `blender -b -P uret_assetler.py -- <klasör>`).
Blender 5.3 ile headless denendi: 12 FBX üretildi, boyutlar spesifikasyonla uyumlu.

| FBX | Ölçü (m) |
|---|---|
| Tile_City | 2.0 × 2.8 × 0.25 (+ şerit/yuva) |
| Tile_Corner (+ Start/Island/Festival/WorldTour) | 2.8 × 2.8 × 0.25 (üstte yükseltilmiş daire) |
| Building_Tier1_Villa / Tier2_Apartment / Tier3_Hotel | taban 0.6 / 0.7 / 0.8 |
| Building_Tier4_Landmark + `Landmark_Crystal` | taban 1.1, toplam 2.2 yükseklik |
| Dice | 0.5 küp, oyuk pipler, Clearcoat |
| Pawn_Base | altın halkalı kaide |

Materyal slotları her nesnede aynı sırada: **0 Base_White, 1 Team_Color_Accent, 2 Gold_Trim, 3 Glass_Emissive**.
Pivot = alt merkez (Z=0). FBX: `axis_forward='-Z'`, `axis_up='Y'`, `FBX_SCALE_ALL`.

## Aşama 2 — Unity (2022.3 LTS / Unity 6, URP)

1. `Assets/` klasörünü Unity projesine kopyala (Scripts + Models).
2. Boş bir sahne aç → menü **Paramanya ▸ Oyunu Sahneye Ekle** → **Play**.
   (Menüyü kullanmazsan sahneye boş bir GameObject + `GameManager` eklemen yeterli; FBX'siz ilkel şekillerle de çalışır.)
3. İsteğe bağlı: **Paramanya ▸ Varsayılan Tahtayı Asset Olarak Kaydet** → `BoardData`'yı `GameManager`'a ata, şehir fiyatlarını düzenle.

Oyun: 4 oyuncu (1 insan + 3 bot; `Human Players` ile değişir). **ZAR AT** butonunu basılı tut: güç barı dolup boşalır,
bıraktığın yer zar toplamında hafif eğilim yaratır (düşük/orta/yüksek).

### Mimari
- `Data/` — `CityTileData`, `BoardData` (ScriptableObject), `CityState`, `DefaultBoardFactory` (32 kare: köşeler 0/8/16/24)
- `Core/` — `GameManager` (tur durum makinesi), `DiceControl` (ağırlıklı zar), `DiceController` (fizik + Slerp),
  `VictoryChecker`, `ChanceDeck`, `Player`
- `Board/` — `BoardManager` (yerleşim, yapılar), `TileView` (parlama), `PawnController` (parabolik zıplama),
  `BoardCameraController` (izometrik ↔ takip), `Spin` (kristal)
- `UI/` — `GameUI` + `UIFactory` (HUD, güç barı, satın alma/seçim diyalogları; prefab gerektirmez, yeni Input System uyumlu)

### Kurallar
- **Satın alma:** boş şehirde arsa + Villa/Bina/Otel aynı ekranda sunulur (bütçe aşılamaz).
- **Simge Yapı:** 3 yapıya sahipken o kareye tekrar gelince çıkar; inşa edilen şehir **devralınamaz**.
- **Devralma:** rakibin şehrine basınca kira + (Simge Yapı yoksa) yatırımın 1.5 katına devralma teklifi.
- **Issız Ada (8):** 3 tur bekle; ₺1000 öde veya çift zar at. **Festival (16):** kendi şehrinde kira ×2–5.
  **Dünya Turu (24):** sonraki tur istediğin kareye uç. 3 çift üst üste → Ada.
- **Anında zafer** (her hamlede kontrol): 3 renk grubu / bir kenarın tüm şehirleri / tüm turistik bölgeler; ayrıca son kalan oyuncu.

### Bilinen sınırlar
- Unity derleyicisi bu ortamda yok: C# kodu **derlenip test edilmedi**; ilk açılışta çıkan hata/uyarıları bildir.
- FBX yön/eksen: renk şeridi tahtanın dışına bakarsa `BoardManager > Flip Tile Rotation`; zar yüzleri yanlışsa
  `DiceController > Face Normals`.
- Blender'daki materyal renkleri Unity'ye taşınmaz; kod slot 0-3'ü varsayılan renklerle boyar, slot 1'i oyuncu/renk grubu rengine çevirir.
