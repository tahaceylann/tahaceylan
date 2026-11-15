using System;
using System.Collections.Generic;
using UnityEngine;

namespace Paramanya.Data
{
    [Serializable]
    public class TileEntry
    {
        public TileType type;
        public string label;
        [Tooltip("Sadece City / Tourist kareleri için")] public CityTileData city;
    }

    /// <summary>
    /// 32 karelik tahta: 4 kenar × 8 kare. Köşeler 0, 8, 16, 24
    /// (Başlangıç, Issız Ada, Festival, Dünya Turu). Sıra: alt kenar soldan sağa,
    /// sağ kenar aşağıdan yukarı, üst kenar sağdan sola, sol kenar yukarıdan aşağı.
    /// </summary>
    [CreateAssetMenu(fileName = "BoardData", menuName = "Paramanya/Board Data")]
    public class BoardData : ScriptableObject
    {
        public const int TileCount = 32;
        public const int SideLength = 8;

        [Header("Ekonomi")]
        public int startingCash = 15000;
        public int passStartSalary = 2000;
        public int landStartBonus = 1000;
        public int taxAmount = 1000;

        [Header("Issız Ada")]
        public int islandTurns = 3;
        public int islandReleaseFee = 1000;

        public TileEntry[] tiles = new TileEntry[TileCount];

        public TileEntry this[int i] { get { return tiles[((i % TileCount) + TileCount) % TileCount]; } }

        public static int SideOf(int index) { return index / SideLength; }
        public static bool IsCorner(int index) { return index % SideLength == 0; }

        public string NameOf(int i)
        {
            var e = this[i];
            if (e.city != null && !string.IsNullOrEmpty(e.city.displayName)) return e.city.displayName;
            return e.label;
        }

        public bool IsProperty(int i)
        {
            var t = this[i].type;
            return (t == TileType.City || t == TileType.Tourist) && this[i].city != null;
        }

        /// <summary>Kenardaki "City" tipindeki kareler (turistik bölgeler hariç).</summary>
        public IEnumerable<int> CityIndicesOnSide(int side)
        {
            for (int k = 0; k < SideLength; k++)
            {
                int i = side * SideLength + k;
                if (this[i].type == TileType.City && this[i].city != null) yield return i;
            }
        }

        public IEnumerable<int> IndicesOfGroup(ColorGroup g)
        {
            for (int i = 0; i < TileCount; i++)
                if (this[i].type == TileType.City && this[i].city != null && this[i].city.colorGroup == g) yield return i;
        }

        public IEnumerable<int> TouristIndices()
        {
            for (int i = 0; i < TileCount; i++)
                if (this[i].type == TileType.Tourist && this[i].city != null) yield return i;
        }

        private void OnValidate()
        {
            if (tiles == null || tiles.Length != TileCount) Array.Resize(ref tiles, TileCount);
            for (int i = 0; i < TileCount; i++) if (tiles[i] == null) tiles[i] = new TileEntry();
        }
    }
}
