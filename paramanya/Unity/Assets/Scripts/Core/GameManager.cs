using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using Paramanya.Board;
using Paramanya.Data;
using Paramanya.UI;

namespace Paramanya.Core
{
    /// <summary>
    /// Oyun döngüsü (tur tabanlı durum makinesi):
    ///   tur başı → (Ada / Dünya Turu) → zar (güç barı) → hareket → kare etkisi → zafer kontrolü → sıradaki.
    /// Eksik sahne parçaları (tahta, kamera, zar, UI, ışık) çalışma anında otomatik oluşturulur;
    /// sahneye sadece bu bileşeni içeren boş bir GameObject koymak yeterlidir.
    /// </summary>
    public class GameManager : MonoBehaviour
    {
        [Header("Oyuncular")]
        [Range(2, 4)] public int playerCount = 4;
        [Tooltip("İnsan oyuncu sayısı (sırayla ilk N oyuncu). Gerisi bot.")]
        [Range(0, 4)] public int humanPlayers = 1;

        [Header("Zar Kontrolü")]
        [Tooltip("Güç barının hedef aralığa verdiği ağırlık. 0 = saf şans, 0.5 = hafif eğilim.")]
        [Range(0f, 2f)] public float diceControlBias = 0.5f;

        [Header("Referanslar (boşsa otomatik oluşturulur)")]
        public BoardData boardData;
        public BoardManager boardManager;
        public DiceController diceController;
        public BoardCameraController cameraController;
        public GameUI ui;

        private BoardData board;
        private List<Player> players = new List<Player>();
        private CityState[] states;
        private PawnController[] pawns;
        private ChanceDeck deck = new ChanceDeck();
        private int current;
        private bool gameOver;
        private int lastA, lastB;

        private static readonly Color[] PlayerColors =
        {
            new Color(0.90f, 0.15f, 0.15f), new Color(0.15f, 0.40f, 0.95f),
            new Color(1.00f, 0.85f, 0.10f), new Color(0.15f, 0.75f, 0.30f)
        };
        private static readonly string[] PlayerNames = { "Kırmızı", "Mavi", "Sarı", "Yeşil" };

        // ================================================================== kurulum
        private void Awake()
        {
            board = boardData != null ? boardData : DefaultBoardFactory.Create();

            if (boardManager == null)
                boardManager = new GameObject("Board").AddComponent<BoardManager>();
            if (diceController == null)
                diceController = new GameObject("Dice").AddComponent<DiceController>();
            if (cameraController == null)
            {
                var cam = Camera.main;
                if (cam == null)
                {
                    var go = new GameObject("Main Camera");
                    go.tag = "MainCamera";
                    cam = go.AddComponent<Camera>();
                    go.AddComponent<AudioListener>();
                }
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = new Color(0.45f, 0.78f, 0.95f);
                cameraController = cam.GetComponent<BoardCameraController>();
                if (cameraController == null) cameraController = cam.gameObject.AddComponent<BoardCameraController>();
            }
            if (ui == null)
                ui = new GameObject("GameUI").AddComponent<GameUI>();
            if (FindFirstObjectByType<Light>() == null)
            {
                var l = new GameObject("Sun").AddComponent<Light>();
                l.type = LightType.Directional;
                l.intensity = 1.1f;
                l.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
            }
        }

        private void Start()
        {
            boardManager.Build(board);

            states = new CityState[BoardData.TileCount];
            for (int i = 0; i < states.Length; i++) states[i] = new CityState();

            int n = Mathf.Clamp(playerCount, 2, 4);
            pawns = new PawnController[n];
            for (int i = 0; i < n; i++)
            {
                var p = new Player
                {
                    id = i, name = PlayerNames[i], color = PlayerColors[i],
                    isAI = i >= humanPlayers, money = board.startingCash, position = 0
                };
                players.Add(p);
                pawns[i] = boardManager.CreatePawn(p.color, p.name);
                pawns[i].TeleportTo(boardManager.StandPoint(0, i));
            }

            ui.Init(players);
            StartCoroutine(GameLoop());
        }

        // ================================================================== ana döngü
        private IEnumerator GameLoop()
        {
            yield return new WaitForSeconds(0.5f);
            while (!gameOver)
            {
                var p = players[current];
                if (!p.bankrupt) yield return TakeTurn(p);
                if (gameOver) yield break;
                do { current = (current + 1) % players.Count; } while (players[current].bankrupt);
            }
        }

        private IEnumerator TakeTurn(Player p)
        {
            ui.RefreshHud(players, p);
            cameraController.FollowTarget(pawns[p.id].transform, 14f);
            ui.Toast(p.name + " oynuyor");
            yield return new WaitForSeconds(0.8f);

            // --- Dünya Turu: bu tur zar yok, istediğin kareye uç ---
            if (p.worldTourPending)
            {
                p.worldTourPending = false;
                yield return DoWorldTour(p);
                yield break;
            }

            p.consecutiveDoubles = 0;
            bool again;
            do
            {
                again = false;
                bool haveRoll = false;

                // --- Issız Ada ---
                if (p.islandTurnsLeft > 0)
                {
                    bool pay = false;
                    bool canPay = p.money >= board.islandReleaseFee;
                    if (canPay)
                    {
                        if (p.isAI) pay = p.money > board.islandReleaseFee * 4;
                        else
                        {
                            int c = -1;
                            yield return Ask("Issız Ada (" + p.islandTurnsLeft + " tur kaldı)",
                                new List<string> { "Öde ve çık (₺" + board.islandReleaseFee + ")", "Zar at (çift gelirse çık)" },
                                v => c = v);
                            pay = c == 0;
                        }
                    }
                    if (pay)
                    {
                        yield return Pay(p, board.islandReleaseFee, null, "Adadan çıkış");
                        p.islandTurnsLeft = 0;
                    }
                    else
                    {
                        yield return RollDice(p);
                        haveRoll = true;
                        if (lastA == lastB)
                        {
                            p.islandTurnsLeft = 0;
                            ui.Toast("Çift attın! Adadan çıkıyorsun.");
                        }
                        else
                        {
                            p.islandTurnsLeft--;
                            ui.Toast("Ada'da bekliyorsun.");
                            ui.RefreshHud(players, p);
                            yield return new WaitForSeconds(1f);
                            yield break;
                        }
                    }
                    ui.RefreshHud(players, p);
                }

                if (gameOver) yield break;
                if (!haveRoll) yield return RollDice(p);

                int steps = lastA + lastB;
                bool isDouble = lastA == lastB;

                yield return MovePawn(p, steps);
                if (gameOver) yield break;
                yield return ResolveTile(p);
                if (gameOver) yield break;
                if (CheckVictory(p)) yield break;

                // Çift zar: ekstra atış (3. çift → Ada)
                if (isDouble && !p.bankrupt && p.islandTurnsLeft == 0)
                {
                    p.consecutiveDoubles++;
                    if (p.consecutiveDoubles >= 3)
                    {
                        ui.Toast("3 çift üst üste! Issız Ada'ya gidiyorsun.");
                        yield return SendToIsland(p);
                    }
                    else
                    {
                        ui.Toast("Çift zar! Tekrar at.");
                        yield return new WaitForSeconds(0.8f);
                        again = true;
                    }
                }
            } while (again && !gameOver);

            yield return new WaitForSeconds(0.4f);
        }

        // ================================================================== yardımcı: soru sorma
        private IEnumerator Ask(string title, List<string> options, Action<int> result)
        {
            bool done = false; int val = -1;
            ui.AskChoice(title, options, v => { val = v; done = true; });
            while (!done) yield return null;
            result(val);
        }

        // ================================================================== zar
        private IEnumerator RollDice(Player p)
        {
            cameraController.FocusPoint(boardManager.Center, 22f);
            float power = 0f;
            if (p.isAI)
            {
                ui.Toast(p.name + " zar atıyor...");
                yield return new WaitForSeconds(0.7f);
                power = UnityEngine.Random.value;
            }
            else
            {
                yield return ui.WaitForRoll(p, v => power = v);
            }

            DiceControl.Roll(power, diceControlBias, out lastA, out lastB);
            yield return diceController.Throw(lastA, lastB, power);
            ui.Toast(lastA + " + " + lastB + " = " + (lastA + lastB), 1.6f);
            yield return new WaitForSeconds(1.0f);
            diceController.Clear();
        }

        // ================================================================== hareket
        private IEnumerator MovePawn(Player p, int steps)
        {
            cameraController.FollowTarget(pawns[p.id].transform, 11f);
            for (int s = 0; s < steps; s++)
            {
                p.position = (p.position + 1) % BoardData.TileCount;
                yield return pawns[p.id].HopTo(boardManager.StandPoint(p.position, p.id));
                boardManager.GetTile(p.position).Flash();

                // Başlangıç'tan geçerken maaş (son adımda ise Resolve'da bonus verilir)
                if (p.position == 0 && s < steps - 1)
                {
                    p.money += board.passStartSalary;
                    ui.Toast("Başlangıç'tan geçtin: +₺" + board.passStartSalary.ToString("N0"));
                    ui.RefreshHud(players, p);
                }
            }
        }

        private IEnumerator FlyPawnTo(Player p, int tile)
        {
            cameraController.FollowTarget(pawns[p.id].transform, 13f);
            p.position = tile;
            yield return pawns[p.id].FlyTo(boardManager.StandPoint(tile, p.id));
            boardManager.GetTile(tile).Flash();
        }

        // ================================================================== kare etkileri
        private IEnumerator ResolveTile(Player p)
        {
            if (p.bankrupt || gameOver) yield break;
            var entry = board[p.position];
            cameraController.FollowTarget(pawns[p.id].transform, 8f);

            switch (entry.type)
            {
                case TileType.Start:
                    p.money += board.landStartBonus + board.passStartSalary;
                    ui.Toast("Başlangıç! Maaş + bonus: +₺" + (board.landStartBonus + board.passStartSalary).ToString("N0"));
                    ui.RefreshHud(players, p);
                    yield return new WaitForSeconds(1f);
                    break;

                case TileType.City:
                case TileType.Tourist:
                    if (entry.city != null) yield return HandleProperty(p, p.position);
                    break;

                case TileType.Chance:
                    yield return HandleChance(p);
                    break;

                case TileType.Tax:
                    ui.Toast("Vergi: -₺" + board.taxAmount.ToString("N0"));
                    yield return new WaitForSeconds(0.6f);
                    yield return Pay(p, board.taxAmount, null, "Vergi");
                    break;

                case TileType.Island:
                    p.islandTurnsLeft = board.islandTurns;
                    ui.Toast("Issız Ada! " + board.islandTurns + " tur beklemelisin.");
                    ui.RefreshHud(players, p);
                    yield return new WaitForSeconds(1f);
                    break;

                case TileType.Festival:
                    yield return HandleFestival(p);
                    break;

                case TileType.WorldTour:
                    p.worldTourPending = true;
                    ui.Toast("Dünya Turu! Sonraki turda istediğin kareye uçacaksın.");
                    ui.RefreshHud(players, p);
                    yield return new WaitForSeconds(1.2f);
                    break;
            }
        }

        private IEnumerator SendToIsland(Player p)
        {
            int island = BoardData.SideLength; // 8
            yield return FlyPawnTo(p, island);
            p.islandTurnsLeft = board.islandTurns;
            p.consecutiveDoubles = 0;
            ui.RefreshHud(players, p);
            yield return new WaitForSeconds(0.8f);
        }

        // ---------------------------------------------------------------- Şans
        private IEnumerator HandleChance(Player p)
        {
            var card = deck.Draw();
            ui.Toast("ŞANS: " + card.text, 3f);
            yield return new WaitForSeconds(2.2f);
            switch (card.kind)
            {
                case ChanceKind.Gain:
                    p.money += card.value;
                    ui.RefreshHud(players, p);
                    break;
                case ChanceKind.Pay:
                    yield return Pay(p, card.value, null, "Şans");
                    break;
                case ChanceKind.MoveForward:
                    yield return MovePawn(p, card.value);
                    yield return ResolveTile(p);
                    break;
                case ChanceKind.GoStart:
                    {
                        int steps = (BoardData.TileCount - p.position) % BoardData.TileCount;
                        if (steps > 0) yield return MovePawn(p, steps);
                        yield return ResolveTile(p);
                        break;
                    }
                case ChanceKind.GoIsland:
                    yield return SendToIsland(p);
                    break;
                case ChanceKind.CollectFromAll:
                    foreach (var other in players)
                    {
                        if (other == p || other.bankrupt) continue;
                        yield return Pay(other, card.value, p, "Doğum günü hediyesi");
                    }
                    break;
            }
        }

        // ---------------------------------------------------------------- Festival
        private IEnumerator HandleFestival(Player p)
        {
            var owned = new List<int>();
            for (int i = 0; i < states.Length; i++)
                if (states[i].ownerId == p.id && board.IsProperty(i)) owned.Add(i);

            if (owned.Count == 0)
            {
                ui.Toast("Festival! Ama henüz şehrin yok.");
                yield return new WaitForSeconds(1.2f);
                yield break;
            }

            int pick = 0;
            if (p.isAI)
            {
                int best = -1;
                for (int k = 0; k < owned.Count; k++)
                {
                    int rent = board[owned[k]].city.CalculateRent(states[owned[k]]);
                    if (rent > best) { best = rent; pick = k; }
                }
            }
            else
            {
                var names = new List<string>();
                foreach (int i in owned) names.Add(board.NameOf(i) + (states[i].festivalMultiplier > 1 ? " (x" + states[i].festivalMultiplier + ")" : ""));
                int c = 0;
                yield return Ask("Festival! Kirası artacak şehri seç", names, v => c = v);
                pick = Mathf.Clamp(c, 0, owned.Count - 1);
            }

            int idx = owned[pick];
            // Önceki festivali kaldır (aynı anda tek festival), yenisini 2x-5x arası uygula
            for (int i = 0; i < states.Length; i++) if (states[i].ownerId == p.id) states[i].festivalMultiplier = 1;
            states[idx].festivalMultiplier = UnityEngine.Random.Range(2, 6);
            ui.Toast(board.NameOf(idx) + " festivali: kira x" + states[idx].festivalMultiplier + "!", 2.5f);
            boardManager.GetTile(idx).Flash();
            yield return new WaitForSeconds(1.5f);
        }

        // ---------------------------------------------------------------- Dünya Turu
        private IEnumerator DoWorldTour(Player p)
        {
            int dest = -1;
            if (p.isAI)
            {
                // Sahipsiz mülk varsa oraya, yoksa rastgele
                var free = new List<int>();
                for (int i = 0; i < states.Length; i++)
                    if (i != p.position && board.IsProperty(i) && !states[i].IsOwned) free.Add(i);
                if (free.Count > 0) dest = free[UnityEngine.Random.Range(0, free.Count)];
                else
                {
                    do { dest = UnityEngine.Random.Range(0, BoardData.TileCount); } while (dest == p.position);
                }
            }
            else
            {
                var names = new List<string>();
                for (int i = 0; i < BoardData.TileCount; i++) names.Add(i + "\n" + board.NameOf(i));
                int c = 0;
                yield return Ask("Dünya Turu: nereye uçalım?", names, v => c = v);
                dest = c;
                if (dest == p.position) dest = (dest + 1) % BoardData.TileCount;
            }

            ui.Toast("Uçuyor: " + board.NameOf(dest));
            yield return FlyPawnTo(p, dest);
            yield return ResolveTile(p);
            if (!gameOver) CheckVictory(p);
        }

        // ================================================================== mülk
        private IEnumerator HandleProperty(Player p, int idx)
        {
            var city = board[idx].city;
            var st = states[idx];

            if (!st.IsOwned)
            {
                yield return OfferPurchase(p, idx, true);
            }
            else if (st.ownerId == p.id)
            {
                yield return OfferPurchase(p, idx, false);
            }
            else
            {
                var owner = players[st.ownerId];
                int rent = city.CalculateRent(st);
                ui.Toast(board.NameOf(idx) + " " + owner.name + "'ın. Kira: ₺" + rent.ToString("N0"));
                yield return new WaitForSeconds(0.8f);
                yield return Pay(p, rent, owner, "Kira");
                if (!p.bankrupt && !gameOver && !st.IsLandmark)
                    yield return OfferTakeover(p, idx);
                else if (st.IsLandmark)
                {
                    ui.Toast("Simge Yapı: devralınamaz!");
                    yield return new WaitForSeconds(0.8f);
                }
            }
        }

        private IEnumerator OfferPurchase(Player p, int idx, bool fresh)
        {
            var city = board[idx].city;
            var st = states[idx];
            var opts = new List<PurchaseOption>();

            if (fresh)
                opts.Add(new PurchaseOption { id = -1, label = "Arsa: " + city.displayName, cost = city.landPrice, locked = true });

            if (!city.isTourist)
            {
                bool landmarkTime = !fresh && st.HasAllBasicTiers && !st.IsLandmark;
                if (landmarkTime)
                {
                    // 3 yapıya sahipsin: Simge Yapı inşa et → şehir devralmaya kilitlenir
                    opts.Add(new PurchaseOption { id = (int)BuildingTier.Landmark, label = "SİMGE YAPI (devralınamaz)", cost = city.landmarkCost });
                }
                else if (!st.IsLandmark)
                {
                    for (int t = 0; t < 3; t++)
                        if (!st.built[t])
                            opts.Add(new PurchaseOption { id = t, label = ((BuildingTier)t).ToTurkish(), cost = city.GetBuildCost((BuildingTier)t) });
                }
            }

            if (opts.Count == 0) yield break;

            int cheapest = int.MaxValue;
            foreach (var o in opts) if (!o.locked || fresh) cheapest = Mathf.Min(cheapest, o.cost);
            if (fresh && city.landPrice > p.money)
            {
                ui.Toast("Yetersiz bakiye: " + board.NameOf(idx) + " arsası ₺" + city.landPrice.ToString("N0"));
                yield return new WaitForSeconds(1.2f);
                yield break;
            }
            if (!fresh && cheapest > p.money)
            {
                ui.Toast("İnşaat için bakiye yetersiz.");
                yield return new WaitForSeconds(1.0f);
                yield break;
            }

            List<int> chosen = null;
            if (p.isAI)
            {
                chosen = new List<int>();
                int total = 0, reserve = 2000;
                foreach (var o in opts)
                {
                    if (o.locked) { chosen.Add(o.id); total += o.cost; continue; }
                    if (p.money - (total + o.cost) >= reserve) { chosen.Add(o.id); total += o.cost; }
                }
                if (chosen.Count == 0) chosen = null;
            }
            else
            {
                bool done = false;
                ui.AskPurchase(fresh ? board.NameOf(idx) + " satın al" : board.NameOf(idx) + ": inşaat",
                    opts, p.money, r => { chosen = r; done = true; });
                while (!done) yield return null;
            }

            if (chosen == null || chosen.Count == 0) yield break;

            int cost = 0;
            foreach (var o in opts) if (chosen.Contains(o.id)) cost += o.cost;
            if (cost > p.money) yield break;

            p.money -= cost;
            if (fresh) st.ownerId = p.id;
            foreach (int id in chosen) if (id >= 0) st.Build((BuildingTier)id);

            boardManager.RefreshCity(idx, st, p.color);
            boardManager.GetTile(idx).Flash();
            ui.Toast(p.name + ": " + board.NameOf(idx) + (st.IsLandmark ? " SİMGE YAPI!" : " geliştirildi") + " (-₺" + cost.ToString("N0") + ")");
            ui.RefreshHud(players, p);
            yield return new WaitForSeconds(1.2f);
        }

        private IEnumerator OfferTakeover(Player p, int idx)
        {
            var city = board[idx].city;
            var st = states[idx];
            int price = city.GetTakeoverPrice(st);
            if (p.money < price) yield break;

            bool yes;
            if (p.isAI) yes = p.money > price * 2;
            else
            {
                int c = 1;
                yield return Ask(board.NameOf(idx) + " devral?",
                    new List<string> { "Devral (₺" + price.ToString("N0") + ")", "Hayır" }, v => c = v);
                yes = c == 0;
            }
            if (!yes) yield break;

            var oldOwner = players[st.ownerId];
            yield return Pay(p, price, oldOwner, "Devralma");
            st.ownerId = p.id;
            boardManager.RefreshCity(idx, st, p.color);
            boardManager.GetTile(idx).Flash();
            ui.Toast(p.name + " " + board.NameOf(idx) + " şehrini devraldı!");
            yield return new WaitForSeconds(1.2f);
        }

        // ================================================================== para / iflas
        private IEnumerator Pay(Player payer, int amount, Player receiver, string reason)
        {
            int paid = Mathf.Min(payer.money, amount);
            payer.money -= paid;
            if (receiver != null) receiver.money += paid;
            ui.RefreshHud(players, payer);
            if (paid < amount) yield return Bankrupt(payer, receiver);
        }

        private IEnumerator Bankrupt(Player p, Player creditor)
        {
            p.bankrupt = true;
            ui.Toast(p.name + " İFLAS ETTİ!", 2.5f);
            for (int i = 0; i < states.Length; i++)
            {
                if (states[i].ownerId != p.id) continue;
                states[i].Reset();
                boardManager.RefreshCity(i, states[i], Color.white);
            }
            pawns[p.id].gameObject.SetActive(false);
            ui.RefreshHud(players, players[current]);
            yield return new WaitForSeconds(1.5f);

            Player last = null; int alive = 0;
            foreach (var q in players) if (!q.bankrupt) { alive++; last = q; }
            if (alive == 1) Win(last, VictoryType.Bankruptcy);
        }

        // ================================================================== zafer
        private bool CheckVictory(Player p)
        {
            if (gameOver) return true;
            var v = VictoryChecker.Check(p, board, states);
            if (v == VictoryType.None) return false;
            Win(p, v);
            return true;
        }

        private void Win(Player p, VictoryType type)
        {
            if (gameOver) return;
            gameOver = true;
            cameraController.Overview();
            ui.RefreshHud(players, p);
            ui.ShowVictory(p, type);
        }
    }
}
