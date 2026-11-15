using UnityEngine;

namespace Paramanya.Data
{
    /// <summary>
    /// Hiç asset oluşturmadan oynanabilsin diye varsayılan 32 karelik tahtayı bellekte üretir.
    /// Editor menüsü (Paramanya/Varsayılan Tahtayı Asset Olarak Kaydet) aynı veriyi asset yapar.
    ///
    /// Kenar başına: köşe + 7 kare. 20 şehir (8 renk grubu), 4 turistik bölge, 3 şans, 1 vergi.
    /// </summary>
    public static class DefaultBoardFactory
    {
        private struct Def
        {
            public TileType type; public ColorGroup group; public string name;
            public Def(TileType t, ColorGroup g, string n) { type = t; group = g; name = n; }
        }

        private static Def C(ColorGroup g, string n) { return new Def(TileType.City, g, n); }
        private static Def T(string n) { return new Def(TileType.Tourist, ColorGroup.None, n); }
        private static Def S(TileType t, string n) { return new Def(t, ColorGroup.None, n); }

        private static Def[] Layout()
        {
            return new[]
            {
                // Alt kenar (0-7)
                S(TileType.Start, "BAŞLANGIÇ"),
                C(ColorGroup.Brown, "Kahire"), C(ColorGroup.Brown, "Marakeş"),
                S(TileType.Chance, "ŞANS"), T("Kapadokya"),
                C(ColorGroup.LightBlue, "Atina"), C(ColorGroup.LightBlue, "Roma"), C(ColorGroup.LightBlue, "Barselona"),
                // Sağ kenar (8-15)
                S(TileType.Island, "ISSIZ ADA"),
                C(ColorGroup.Pink, "Prag"), C(ColorGroup.Pink, "Viyana"),
                S(TileType.Tax, "VERGİ"), T("Eyfel Kulesi"),
                C(ColorGroup.Orange, "Londra"), C(ColorGroup.Orange, "Berlin"), C(ColorGroup.Orange, "Amsterdam"),
                // Üst kenar (16-23)
                S(TileType.Festival, "FESTİVAL"),
                C(ColorGroup.Red, "İstanbul"), S(TileType.Chance, "ŞANS"), C(ColorGroup.Red, "Moskova"),
                T("Taj Mahal"), C(ColorGroup.Red, "Dubai"),
                C(ColorGroup.Yellow, "Singapur"), C(ColorGroup.Yellow, "Seul"),
                // Sol kenar (24-31)
                S(TileType.WorldTour, "DÜNYA TURU"),
                C(ColorGroup.Green, "Sidney"), C(ColorGroup.Green, "Tokyo"),
                S(TileType.Chance, "ŞANS"), T("Özgürlük Anıtı"),
                C(ColorGroup.Green, "Pekin"),
                C(ColorGroup.Blue, "Los Angeles"), C(ColorGroup.Blue, "New York"),
            };
        }

        public static BoardData Create()
        {
            var board = ScriptableObject.CreateInstance<BoardData>();
            board.name = "BoardData_Default";
            var defs = Layout();
            board.tiles = new TileEntry[BoardData.TileCount];
            int cityOrdinal = 0;
            for (int i = 0; i < BoardData.TileCount; i++)
            {
                var d = defs[i];
                var e = new TileEntry { type = d.type, label = d.name };
                if (d.type == TileType.City)
                {
                    int land = 300 + cityOrdinal * 60;
                    e.city = MakeCity(d.name, d.group, false, land);
                    cityOrdinal++;
                }
                else if (d.type == TileType.Tourist)
                {
                    e.city = MakeCity(d.name, ColorGroup.None, true, 1000);
                }
                board.tiles[i] = e;
            }
            return board;
        }

        private static CityTileData MakeCity(string name, ColorGroup g, bool tourist, int land)
        {
            var c = ScriptableObject.CreateInstance<CityTileData>();
            c.name = "City_" + name;
            c.displayName = name;
            c.colorGroup = g;
            c.isTourist = tourist;
            c.landPrice = land;
            if (tourist)
            {
                c.buildCosts = new[] { 0, 0, 0 };
                c.landmarkCost = 0;
                c.baseRent = 200;
            }
            else
            {
                c.buildCosts = new[] { Mathf.RoundToInt(land * 0.5f), Mathf.RoundToInt(land * 0.8f), Mathf.RoundToInt(land * 1.2f) };
                c.landmarkCost = land * 3;
                c.baseRent = Mathf.Max(20, land / 10);
            }
            c.rentMultipliers = new[] { 1f, 2f, 4f, 8f };
            return c;
        }
    }
}
