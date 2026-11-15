using UnityEngine;

namespace Paramanya.Core
{
    public class Player
    {
        public int id;
        public string name;
        public Color color;
        public bool isAI;
        public int money;
        public int position;            // 0-31
        public int islandTurnsLeft;     // Issız Ada'da kalan bekleme turu
        public bool worldTourPending;   // Sonraki tur istediği kareye uçacak
        public bool bankrupt;
        public int consecutiveDoubles;
    }
}
