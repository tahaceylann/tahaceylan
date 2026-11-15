using System;

namespace Paramanya.Data
{
    /// <summary>Bir şehir/turistik karenin oyun içi (değişen) durumu.</summary>
    [Serializable]
    public class CityState
    {
        public int ownerId = -1;
        public bool[] built = new bool[4];   // Villa, Bina, Otel, Simge Yapı
        public int festivalMultiplier = 1;   // 1 = yok, 2-5 = festival

        public bool IsOwned { get { return ownerId >= 0; } }
        public bool Has(BuildingTier t) { return built[(int)t]; }
        public void Build(BuildingTier t) { built[(int)t] = true; }
        public bool HasAllBasicTiers { get { return built[0] && built[1] && built[2]; } }

        /// <summary>Simge Yapı varsa şehir rakiplerin satın almasına (devralmasına) kilitlidir.</summary>
        public bool IsLandmark { get { return built[(int)BuildingTier.Landmark]; } }

        public void Reset()
        {
            ownerId = -1;
            festivalMultiplier = 1;
            for (int i = 0; i < built.Length; i++) built[i] = false;
        }
    }
}
