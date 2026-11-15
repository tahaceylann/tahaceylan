using UnityEngine;

namespace Paramanya.Data
{
    /// <summary>Bir şehir (veya turistik bölge) karosunun sabit verisi.</summary>
    [CreateAssetMenu(fileName = "City_", menuName = "Paramanya/City Tile Data")]
    public class CityTileData : ScriptableObject
    {
        public string displayName = "Şehir";
        public ColorGroup colorGroup = ColorGroup.None;
        [Tooltip("Turistik bölge: üzerine yapı inşa edilmez, Turizm Zaferi'ne sayılır.")]
        public bool isTourist;

        [Min(0)] public int landPrice = 600;

        [Tooltip("İnşa maliyetleri: [0]=Villa, [1]=Bina, [2]=Otel")]
        public int[] buildCosts = { 300, 500, 800 };
        [Min(0)] public int landmarkCost = 1800;

        [Min(0)] public int baseRent = 60;

        [Tooltip("Kira çarpanları (arsaya eklenir): [0]=Villa, [1]=Bina, [2]=Otel, [3]=Simge Yapı")]
        public float[] rentMultipliers = { 1f, 2f, 4f, 8f };

        public int GetBuildCost(BuildingTier t)
        {
            if (t == BuildingTier.Landmark) return landmarkCost;
            int i = (int)t;
            return (buildCosts != null && i < buildCosts.Length) ? buildCosts[i] : 0;
        }

        public float GetRentMultiplier(BuildingTier t)
        {
            int i = (int)t;
            return (rentMultipliers != null && i < rentMultipliers.Length) ? rentMultipliers[i] : 0f;
        }

        /// <summary>Kira = taban kira × (1 + inşa edilen yapıların çarpanları) × festival çarpanı.</summary>
        public int CalculateRent(CityState s)
        {
            float mult = 1f;
            for (int i = 0; i < 4; i++)
                if (s.built[i]) mult += GetRentMultiplier((BuildingTier)i);
            return Mathf.RoundToInt(baseRent * mult * Mathf.Max(1, s.festivalMultiplier));
        }

        /// <summary>Arsa + yapılara şimdiye kadar harcanan toplam değer.</summary>
        public int GetInvestedValue(CityState s)
        {
            int v = landPrice;
            for (int i = 0; i < 4; i++)
                if (s.built[i]) v += GetBuildCost((BuildingTier)i);
            return v;
        }

        /// <summary>Devralma bedeli: yatırılan değerin 1.5 katı. Simge Yapı olan şehir devralınamaz.</summary>
        public int GetTakeoverPrice(CityState s)
        {
            return Mathf.RoundToInt(GetInvestedValue(s) * 1.5f);
        }

        private void OnValidate()
        {
            if (buildCosts == null || buildCosts.Length != 3) System.Array.Resize(ref buildCosts, 3);
            if (rentMultipliers == null || rentMultipliers.Length != 4) System.Array.Resize(ref rentMultipliers, 4);
        }
    }
}
