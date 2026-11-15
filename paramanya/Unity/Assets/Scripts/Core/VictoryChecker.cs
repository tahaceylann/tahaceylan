using Paramanya.Data;

namespace Paramanya.Core
{
    /// <summary>
    /// Anında zafer koşulları. Her hamlede (hareket + satın alma/devralma sonrası) çağrılır.
    ///  - Üçlü Renk: 3 farklı renk grubunun TAMAMI oyuncuda.
    ///  - Hat: tahtanın 4 kenarından birindeki TÜM şehirler oyuncuda.
    ///  - Turizm: tahtadaki TÜM turistik bölgeler oyuncuda.
    /// (İflas ile zafer GameManager'da, son kalan oyuncu kuralıyla verilir.)
    /// </summary>
    public static class VictoryChecker
    {
        public static VictoryType Check(Player p, BoardData board, CityState[] states)
        {
            if (p == null || p.bankrupt) return VictoryType.None;
            if (HasTourism(p, board, states)) return VictoryType.Tourism;
            if (HasLine(p, board, states)) return VictoryType.Line;
            if (CountCompleteColorGroups(p, board, states) >= 3) return VictoryType.TripleColor;
            return VictoryType.None;
        }

        public static int CountCompleteColorGroups(Player p, BoardData board, CityState[] states)
        {
            int complete = 0;
            for (int g = (int)ColorGroup.Brown; g <= (int)ColorGroup.Blue; g++)
            {
                int total = 0, owned = 0;
                foreach (int i in board.IndicesOfGroup((ColorGroup)g))
                {
                    total++;
                    if (states[i].ownerId == p.id) owned++;
                }
                if (total > 0 && owned == total) complete++;
            }
            return complete;
        }

        public static bool HasLine(Player p, BoardData board, CityState[] states)
        {
            for (int side = 0; side < 4; side++)
            {
                int total = 0, owned = 0;
                foreach (int i in board.CityIndicesOnSide(side))
                {
                    total++;
                    if (states[i].ownerId == p.id) owned++;
                }
                if (total > 0 && owned == total) return true;
            }
            return false;
        }

        public static bool HasTourism(Player p, BoardData board, CityState[] states)
        {
            int total = 0, owned = 0;
            foreach (int i in board.TouristIndices())
            {
                total++;
                if (states[i].ownerId == p.id) owned++;
            }
            return total > 0 && owned == total;
        }
    }
}
