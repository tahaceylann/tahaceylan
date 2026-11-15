using UnityEngine;

namespace Paramanya.Data
{
    public enum TileType { Start, City, Tourist, Chance, Tax, Island, Festival, WorldTour }

    public enum ColorGroup { None, Brown, LightBlue, Pink, Orange, Red, Yellow, Green, Blue }

    /// <summary>Yapı kademeleri. Sıra: Blender varlıkları Tier1..Tier4 ile aynıdır.</summary>
    public enum BuildingTier { Villa = 0, Apartment = 1, Hotel = 2, Landmark = 3 }

    public enum VictoryType { None, TripleColor, Line, Tourism, Bankruptcy }

    public static class DataExtensions
    {
        public static Color ToColor(this ColorGroup g)
        {
            switch (g)
            {
                case ColorGroup.Brown: return new Color(0.55f, 0.35f, 0.20f);
                case ColorGroup.LightBlue: return new Color(0.50f, 0.85f, 1.00f);
                case ColorGroup.Pink: return new Color(1.00f, 0.50f, 0.80f);
                case ColorGroup.Orange: return new Color(1.00f, 0.60f, 0.15f);
                case ColorGroup.Red: return new Color(0.90f, 0.20f, 0.20f);
                case ColorGroup.Yellow: return new Color(1.00f, 0.90f, 0.20f);
                case ColorGroup.Green: return new Color(0.20f, 0.75f, 0.30f);
                case ColorGroup.Blue: return new Color(0.20f, 0.35f, 0.90f);
                default: return new Color(1.00f, 0.75f, 0.15f); // turistik/özel = altın
            }
        }

        public static string ToTurkish(this VictoryType v)
        {
            switch (v)
            {
                case VictoryType.TripleColor: return "ÜÇLÜ RENK ZAFERİ";
                case VictoryType.Line: return "HAT ZAFERİ";
                case VictoryType.Tourism: return "TURİZM ZAFERİ";
                case VictoryType.Bankruptcy: return "İFLAS ZAFERİ";
                default: return "";
            }
        }

        public static string ToTurkish(this BuildingTier t)
        {
            switch (t)
            {
                case BuildingTier.Villa: return "Villa";
                case BuildingTier.Apartment: return "Bina";
                case BuildingTier.Hotel: return "Otel";
                default: return "Simge Yapı";
            }
        }
    }
}
