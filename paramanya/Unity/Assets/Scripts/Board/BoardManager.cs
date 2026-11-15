using UnityEngine;
using Paramanya.Data;

namespace Paramanya.Board
{
    /// <summary>
    /// 32 karelik kare tahtayı kurar (4 kenar × 8 kare, köşeler 0/8/16/24) ve
    /// karo konumlarını, yapı görsellerini ve piyonları yönetir.
    /// Prefab alanları boş bırakılırsa ilkel şekillerle (küp/silindir) çalışır;
    /// Blender'dan gelen FBX prefab'ları atanırsa onlar kullanılır.
    /// </summary>
    public class BoardManager : MonoBehaviour
    {
        [Header("Prefab'lar (opsiyonel - Blender FBX)")]
        public GameObject cityTilePrefab;      // Tile_City
        public GameObject cornerTilePrefab;    // Tile_Corner (varyant yoksa)
        [Tooltip("0=Start, 1=Island, 2=Festival, 3=WorldTour")]
        public GameObject[] cornerVariantPrefabs = new GameObject[4];
        [Tooltip("0=Villa, 1=Bina, 2=Otel, 3=Simge Yapı (kristal Landmark prefab'ının içinde olabilir)")]
        public GameObject[] buildingPrefabs = new GameObject[4];
        public GameObject pawnPrefab;          // Pawn_Base

        [Header("Ölçüler (Blender ile aynı)")]
        public float tileWidth = 2.0f;
        public float cornerSize = 2.8f;
        public float tileHeight = 0.25f;
        [Tooltip("FBX içe aktarımında renk şeridi tahtanın dışına bakıyorsa işaretleyin.")]
        public bool flipTileRotation;

        public BoardData Data { get; private set; }
        private TileView[] tiles = new TileView[BoardData.TileCount];

        /// <summary>Köşe karo merkezlerinin tahta merkezine uzaklığı (8.4 m).</summary>
        public float HalfExtent { get { return cornerSize * 0.5f + 7 * tileWidth * 0.5f; } }
        public Vector3 Center { get { return Vector3.zero; } }

        public TileView GetTile(int i) { return tiles[((i % 32) + 32) % 32]; }

        // ------------------------------------------------------------ yerleşim
        public Vector3 TilePosition(int i)
        {
            i = ((i % 32) + 32) % 32;
            int side = i / 8, k = i % 8;
            float h = HalfExtent;
            Vector3[] corners = { new Vector3(-h, 0, -h), new Vector3(h, 0, -h), new Vector3(h, 0, h), new Vector3(-h, 0, h) };
            Vector3[] dirs = { Vector3.right, Vector3.forward, Vector3.left, Vector3.back };
            float along = k == 0 ? 0f : cornerSize * 0.5f + tileWidth * (k - 0.5f);
            return corners[side] + dirs[side] * along;
        }

        /// <summary>Piyonun basacağı nokta (karo üst yüzeyi + oyuncuya özel kayma).</summary>
        public Vector3 StandPoint(int tile, int playerId)
        {
            float ang = (playerId * 90f + 45f) * Mathf.Deg2Rad;
            Vector3 off = new Vector3(Mathf.Cos(ang), 0f, Mathf.Sin(ang)) * 0.55f;
            return TilePosition(tile) + off + Vector3.up * tileHeight;
        }

        private Quaternion TileRotation(int i)
        {
            if (i % 8 == 0) return Quaternion.identity;
            float yaw = -90f * (i / 8) + (flipTileRotation ? 180f : 0f);
            return Quaternion.Euler(0f, yaw, 0f);
        }

        // ------------------------------------------------------------ kurulum
        public void Build(BoardData data)
        {
            Data = data;
            for (int c = transform.childCount - 1; c >= 0; c--) Destroy(transform.GetChild(c).gameObject);

            BuildPlate();
            for (int i = 0; i < BoardData.TileCount; i++) tiles[i] = CreateTile(i);
        }

        private void BuildPlate()
        {
            float size = HalfExtent * 2f + cornerSize + 0.8f;
            MaterialUtil.Prim(PrimitiveType.Cube, "Plate", transform,
                new Vector3(0, -0.15f, 0), new Vector3(size, 0.3f, size), new Color(0.40f, 0.28f, 0.72f));
            float inner = HalfExtent * 2f - cornerSize;
            MaterialUtil.Prim(PrimitiveType.Cube, "CenterFloor", transform,
                new Vector3(0, 0.0f, 0), new Vector3(inner, 0.1f, inner), new Color(0.97f, 0.90f, 0.84f));
        }

        private TileView CreateTile(int i)
        {
            var e = Data[i];
            bool corner = i % 8 == 0;
            Color accent = AccentFor(e);

            GameObject prefab = null;
            if (corner)
            {
                int v = i / 8;
                if (cornerVariantPrefabs != null && v < cornerVariantPrefabs.Length) prefab = cornerVariantPrefabs[v];
                if (prefab == null) prefab = cornerTilePrefab;
            }
            else prefab = cityTilePrefab;

            var root = new GameObject("Tile_" + i + "_" + Data.NameOf(i));
            root.transform.SetParent(transform, false);
            root.transform.position = TilePosition(i);
            root.transform.rotation = TileRotation(i);
            var view = root.AddComponent<TileView>();
            view.index = i;

            if (prefab != null)
            {
                var inst = Instantiate(prefab, root.transform);
                inst.transform.localPosition = Vector3.zero;
                inst.transform.localRotation = Quaternion.identity;
                foreach (var c in inst.GetComponentsInChildren<Collider>()) Destroy(c);
                MaterialUtil.ApplyDefaultPalette(inst, accent);
                view.baseRenderer = inst.GetComponentInChildren<Renderer>();
            }
            else
            {
                BuildFallbackTile(view, corner, i);
            }

            view.SetAccent(accent);

            // Bina yuvası (şehir karosunda arsa merkezi: z=-0.28)
            var slot = new GameObject("BuildingRoot").transform;
            slot.SetParent(root.transform, false);
            slot.localPosition = corner ? Vector3.zero : new Vector3(0, tileHeight, -0.28f);
            view.buildingRoot = slot;

            // Sahip işareti (karo köşesinde küçük renkli disk)
            var marker = MaterialUtil.Prim(PrimitiveType.Cylinder, "OwnerMarker", root.transform,
                new Vector3(-0.7f, tileHeight + 0.02f, -1.1f), new Vector3(0.35f, 0.02f, 0.35f), Color.white);
            marker.SetActive(false);
            view.ownerMarker = marker.GetComponent<Renderer>();

            AddLabel(root.transform, Data.NameOf(i), corner);
            return view;
        }

        private void BuildFallbackTile(TileView view, bool corner, int i)
        {
            var t = view.transform;
            if (corner)
            {
                var b = MaterialUtil.Prim(PrimitiveType.Cube, "Base", t, new Vector3(0, tileHeight * 0.5f, 0),
                    new Vector3(cornerSize, tileHeight, cornerSize), MaterialUtil.White);
                view.baseRenderer = b.GetComponent<Renderer>();
                MaterialUtil.Prim(PrimitiveType.Cylinder, "Platform", t, new Vector3(0, tileHeight + 0.06f, 0),
                    new Vector3(2.0f, 0.06f, 2.0f), MaterialUtil.Gold);
                var acc = MaterialUtil.Prim(PrimitiveType.Cylinder, "Accent", t, new Vector3(0, tileHeight + 0.13f, 0),
                    new Vector3(1.6f, 0.02f, 1.6f), Color.red);
                view.accentRenderer = acc.GetComponent<Renderer>();
            }
            else
            {
                var b = MaterialUtil.Prim(PrimitiveType.Cube, "Base", t, new Vector3(0, tileHeight * 0.5f, 0),
                    new Vector3(tileWidth, tileHeight, 2.8f), MaterialUtil.White);
                view.baseRenderer = b.GetComponent<Renderer>();
                var h = MaterialUtil.Prim(PrimitiveType.Cube, "Header", t, new Vector3(0, tileHeight + 0.025f, 1.12f),
                    new Vector3(tileWidth - 0.16f, 0.05f, 0.55f), Color.red);
                view.accentRenderer = h.GetComponent<Renderer>();
            }
        }

        private void AddLabel(Transform parent, string text, bool corner)
        {
            if (string.IsNullOrEmpty(text)) return;
            var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var go = new GameObject("Label");
            go.transform.SetParent(parent, false);
            // Yere yatık yazı: yukarıdan okunur
            go.transform.localPosition = new Vector3(0, tileHeight + (corner ? 0.2f : 0.08f), corner ? -0.9f : 0.55f);
            go.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
            var tm = go.AddComponent<TextMesh>();
            tm.text = text;
            tm.font = font;
            tm.fontSize = 48;
            tm.characterSize = corner ? 0.085f : 0.065f;
            tm.anchor = TextAnchor.MiddleCenter;
            tm.alignment = TextAlignment.Center;
            tm.color = new Color(0.15f, 0.12f, 0.25f);
            go.GetComponent<MeshRenderer>().sharedMaterial = font.material;
        }

        private static Color AccentFor(TileEntry e)
        {
            switch (e.type)
            {
                case TileType.City: return e.city != null ? e.city.colorGroup.ToColor() : Color.white;
                case TileType.Tourist: return ColorGroup.None.ToColor();
                case TileType.Chance: return new Color(0.65f, 0.35f, 0.95f);
                case TileType.Tax: return new Color(0.55f, 0.55f, 0.60f);
                case TileType.Start: return new Color(0.25f, 0.85f, 0.35f);
                case TileType.Island: return new Color(0.25f, 0.75f, 0.95f);
                case TileType.Festival: return new Color(1.00f, 0.45f, 0.60f);
                default: return new Color(0.30f, 0.50f, 1.00f);
            }
        }

        // ------------------------------------------------------------ yapılar
        /// <summary>Şehrin sahip rengini ve inşa edilmiş yapılarını yeniden çizer.</summary>
        public void RefreshCity(int idx, CityState st, Color ownerColor)
        {
            var view = GetTile(idx);
            if (view == null) return;
            view.SetOwner(st.IsOwned, ownerColor);

            for (int c = view.buildingRoot.childCount - 1; c >= 0; c--)
                Destroy(view.buildingRoot.GetChild(c).gameObject);
            if (!st.IsOwned) return;

            if (st.IsLandmark)
            {
                SpawnBuilding(view.buildingRoot, BuildingTier.Landmark, Vector3.zero, 1f, ownerColor);
                return;
            }
            float[] xs = { -0.7f, 0f, 0.7f };
            for (int t = 0; t < 3; t++)
                if (st.built[t]) SpawnBuilding(view.buildingRoot, (BuildingTier)t, new Vector3(xs[t], 0, 0), 0.9f, ownerColor);
        }

        private void SpawnBuilding(Transform parent, BuildingTier tier, Vector3 localPos, float scale, Color color)
        {
            GameObject go;
            var prefab = (buildingPrefabs != null && (int)tier < buildingPrefabs.Length) ? buildingPrefabs[(int)tier] : null;
            if (prefab != null)
            {
                go = Instantiate(prefab, parent);
                foreach (var c in go.GetComponentsInChildren<Collider>()) Destroy(c);
                MaterialUtil.ApplyDefaultPalette(go, color);
                // Simge Yapı kristali ayrı nesne olarak gelirse döndür
                var crystal = go.transform.Find("Landmark_Crystal");
                if (crystal != null && crystal.GetComponent<Spin>() == null) crystal.gameObject.AddComponent<Spin>();
            }
            else
            {
                go = BuildFallbackBuilding(parent, tier, color);
            }
            go.transform.localPosition = localPos;
            go.transform.localRotation = Quaternion.identity;
            go.transform.localScale = Vector3.one * scale;
        }

        private GameObject BuildFallbackBuilding(Transform parent, BuildingTier tier, Color color)
        {
            var root = new GameObject("Building_" + tier);
            root.transform.SetParent(parent, false);
            switch (tier)
            {
                case BuildingTier.Villa:
                    MaterialUtil.Prim(PrimitiveType.Cube, "Body", root.transform, new Vector3(0, 0.2f, 0), new Vector3(0.5f, 0.4f, 0.5f), MaterialUtil.White);
                    MaterialUtil.Prim(PrimitiveType.Cube, "Roof", root.transform, new Vector3(0, 0.46f, 0), new Vector3(0.6f, 0.12f, 0.6f), color);
                    break;
                case BuildingTier.Apartment:
                    MaterialUtil.Prim(PrimitiveType.Cube, "Body", root.transform, new Vector3(0, 0.45f, 0), new Vector3(0.6f, 0.9f, 0.6f), MaterialUtil.White);
                    MaterialUtil.Prim(PrimitiveType.Cube, "Roof", root.transform, new Vector3(0, 0.95f, 0), new Vector3(0.66f, 0.1f, 0.66f), color);
                    break;
                case BuildingTier.Hotel:
                    MaterialUtil.Prim(PrimitiveType.Cube, "Body", root.transform, new Vector3(0, 0.75f, 0), new Vector3(0.7f, 1.5f, 0.7f), MaterialUtil.White);
                    MaterialUtil.Prim(PrimitiveType.Cube, "Roof", root.transform, new Vector3(0, 1.55f, 0), new Vector3(0.76f, 0.1f, 0.76f), color);
                    break;
                default:
                    MaterialUtil.Prim(PrimitiveType.Cylinder, "Plinth", root.transform, new Vector3(0, 0.1f, 0), new Vector3(1.1f, 0.1f, 1.1f), MaterialUtil.Gold);
                    MaterialUtil.Prim(PrimitiveType.Cylinder, "Tower", root.transform, new Vector3(0, 0.9f, 0), new Vector3(0.6f, 0.8f, 0.6f), MaterialUtil.White);
                    var c = MaterialUtil.Prim(PrimitiveType.Sphere, "Crystal_Spin", root.transform, new Vector3(0, 1.95f, 0), new Vector3(0.35f, 0.5f, 0.35f), color);
                    c.AddComponent<Spin>();
                    break;
            }
            return root;
        }

        // ------------------------------------------------------------ piyon
        public PawnController CreatePawn(Color color, string name)
        {
            GameObject go;
            if (pawnPrefab != null)
            {
                go = Instantiate(pawnPrefab);
                foreach (var c in go.GetComponentsInChildren<Collider>()) Destroy(c);
                MaterialUtil.ApplyDefaultPalette(go, color);
            }
            else
            {
                go = new GameObject();
                MaterialUtil.Prim(PrimitiveType.Cylinder, "Base", go.transform, new Vector3(0, 0.05f, 0), new Vector3(0.5f, 0.05f, 0.5f), MaterialUtil.Gold);
                MaterialUtil.Prim(PrimitiveType.Cylinder, "Body", go.transform, new Vector3(0, 0.3f, 0), new Vector3(0.28f, 0.2f, 0.28f), color);
                MaterialUtil.Prim(PrimitiveType.Sphere, "Head", go.transform, new Vector3(0, 0.62f, 0), new Vector3(0.28f, 0.28f, 0.28f), MaterialUtil.White);
            }
            go.name = "Pawn_" + name;
            return go.AddComponent<PawnController>();
        }
    }
}
