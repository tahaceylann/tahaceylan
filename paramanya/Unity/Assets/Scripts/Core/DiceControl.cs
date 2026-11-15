using UnityEngine;

namespace Paramanya.Core
{
    /// <summary>
    /// Paramanya tarzı "Zar Kontrolü". Güç barının doluluk oranı zar toplamında
    /// hafif bir eğilim yaratır (kesin sonuç vermez):
    ///   0.00-0.33 → düşük aralık (2-6),  0.33-0.67 → orta (6-8),  0.67-1.00 → yüksek (8-12).
    /// Aralığa düşen 36 olası (zar1, zar2) çiftinin ağırlığı 1 + bias olur.
    /// </summary>
    public static class DiceControl
    {
        public static void GetRange(float power, out int lo, out int hi)
        {
            if (power < 0.34f) { lo = 2; hi = 6; }
            else if (power < 0.67f) { lo = 6; hi = 8; }
            else { lo = 8; hi = 12; }
        }

        public static void Roll(float power, float bias, out int a, out int b)
        {
            int lo, hi;
            GetRange(power, out lo, out hi);

            var w = new float[36];
            float total = 0f;
            for (int i = 0; i < 36; i++)
            {
                int sum = (i / 6 + 1) + (i % 6 + 1);
                w[i] = 1f + ((sum >= lo && sum <= hi) ? Mathf.Max(0f, bias) : 0f);
                total += w[i];
            }

            float r = Random.value * total;
            int pick = 35;
            for (int i = 0; i < 36; i++)
            {
                r -= w[i];
                if (r <= 0f) { pick = i; break; }
            }
            a = pick / 6 + 1;
            b = pick % 6 + 1;
        }
    }
}
