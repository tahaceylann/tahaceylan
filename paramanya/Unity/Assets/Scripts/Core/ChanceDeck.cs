using System.Collections.Generic;
using UnityEngine;

namespace Paramanya.Core
{
    public enum ChanceKind { Gain, Pay, MoveForward, GoStart, GoIsland, CollectFromAll }

    public struct ChanceCard
    {
        public string text;
        public ChanceKind kind;
        public int value;
        public ChanceCard(string t, ChanceKind k, int v) { text = t; kind = k; value = v; }
    }

    /// <summary>Karıştırılmış şans kartı destesi; bitince yeniden karılır.</summary>
    public class ChanceDeck
    {
        private readonly List<ChanceCard> all = new List<ChanceCard>
        {
            new ChanceCard("Piyango kazandın! +1500", ChanceKind.Gain, 1500),
            new ChanceCard("Hisse senetlerin yükseldi. +1000", ChanceKind.Gain, 1000),
            new ChanceCard("Doğum günü hediyesi. +500", ChanceKind.Gain, 500),
            new ChanceCard("Araba tamiri. -600", ChanceKind.Pay, 600),
            new ChanceCard("Hız cezası. -400", ChanceKind.Pay, 400),
            new ChanceCard("Bağış kampanyası. -800", ChanceKind.Pay, 800),
            new ChanceCard("3 kare ileri git!", ChanceKind.MoveForward, 3),
            new ChanceCard("5 kare ileri git!", ChanceKind.MoveForward, 5),
            new ChanceCard("Başlangıç'a ilerle.", ChanceKind.GoStart, 0),
            new ChanceCard("Issız Ada'ya düştün!", ChanceKind.GoIsland, 0),
            new ChanceCard("Doğum günün! Herkes sana 300 verir.", ChanceKind.CollectFromAll, 300),
        };

        private readonly Queue<ChanceCard> bag = new Queue<ChanceCard>();

        public ChanceCard Draw()
        {
            if (bag.Count == 0)
            {
                var tmp = new List<ChanceCard>(all);
                for (int i = tmp.Count - 1; i > 0; i--)
                {
                    int j = Random.Range(0, i + 1);
                    var t = tmp[i]; tmp[i] = tmp[j]; tmp[j] = t;
                }
                foreach (var c in tmp) bag.Enqueue(c);
            }
            return bag.Dequeue();
        }
    }
}
