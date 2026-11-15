using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using Paramanya.Core;
using Paramanya.Data;
#if ENABLE_INPUT_SYSTEM && !ENABLE_LEGACY_INPUT_MANAGER
using UnityEngine.InputSystem.UI;
#endif

namespace Paramanya.UI
{
    /// <summary>Satın alma diyaloğundaki tek satır.</summary>
    public class PurchaseOption
    {
        public int id;            // -1 = arsa, 0..3 = BuildingTier
        public string label;
        public int cost;
        public bool locked;       // zorunlu (yeni arsa satın alırken arsa)
    }

    /// <summary>
    /// Çalışma anında kodla kurulan arayüz (prefab gerekmez):
    /// oyuncu kartları (HUD), basılı tutarak dolan Güç Barlı "Zar At" butonu, toast mesajları,
    /// seçim / satın alma diyalogları ve zafer ekranı.
    /// </summary>
    public class GameUI : MonoBehaviour
    {
        private Canvas canvas;
        private RectTransform root;

        // HUD
        private class Hud { public RectTransform rt; public Image bg; public Text name, money, info; public Image strip; }
        private readonly List<Hud> huds = new List<Hud>();

        // Toast
        private Text toast;
        private CanvasGroup toastGroup;
        private Coroutine toastRoutine;

        // Zar butonu + güç barı
        private RectTransform rollRoot, gaugeFill;
        private Text rollLabel;
        private bool rollWaiting, holding;
        private float gauge, gaugeDir = 1f;
        private Action<float> rollCallback;
        private const float GaugeSpeed = 0.9f; // saniyede bar doluluğu

        // Diyalog
        private GameObject dialog;

        // ------------------------------------------------------------------ kurulum
        public void Init(List<Player> players)
        {
            EnsureEventSystem();
            BuildCanvas();
            BuildHud(players);
            BuildToast();
            BuildRollControls();
            RefreshHud(players, players[0]);
        }

        private static void EnsureEventSystem()
        {
            if (FindFirstObjectByType<EventSystem>() != null) return;
            var go = new GameObject("EventSystem", typeof(EventSystem));
#if ENABLE_INPUT_SYSTEM && !ENABLE_LEGACY_INPUT_MANAGER
            go.AddComponent<InputSystemUIInputModule>();
#else
            go.AddComponent<StandaloneInputModule>();
#endif
        }

        private void BuildCanvas()
        {
            var go = new GameObject("Canvas", typeof(RectTransform));
            go.transform.SetParent(transform, false);
            canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 10;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = 0.5f;
            go.AddComponent<GraphicRaycaster>();
            root = (RectTransform)go.transform;
        }

        // ------------------------------------------------------------------ HUD
        private void BuildHud(List<Player> players)
        {
            // 0: sol üst, 1: sağ üst, 2: sol alt, 3: sağ orta
            Vector2[] anchors = { new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, 0), new Vector2(1, 0.5f) };
            Vector2[] pos = { new Vector2(30, -30), new Vector2(-30, -30), new Vector2(30, 30), new Vector2(-30, 0) };
            for (int i = 0; i < players.Count && i < 4; i++)
            {
                var h = new Hud();
                h.rt = UIFactory.Panel("Player" + i, root, UIFactory.Navy);
                UIFactory.Anchor(h.rt, anchors[i], anchors[i], anchors[i], pos[i], new Vector2(330, 130));
                h.bg = h.rt.GetComponent<Image>();

                h.strip = UIFactory.Panel("Strip", h.rt, players[i].color).GetComponent<Image>();
                UIFactory.Anchor(h.strip.rectTransform, new Vector2(0, 0), new Vector2(0, 1), new Vector2(0, 0.5f), Vector2.zero, new Vector2(16, 0));

                h.name = UIFactory.Label(h.rt, players[i].name, 30, UIFactory.Gold, TextAnchor.UpperLeft);
                h.name.rectTransform.offsetMin = new Vector2(28, 0); h.name.rectTransform.offsetMax = new Vector2(-10, -8);
                h.money = UIFactory.Label(h.rt, "", 38, Color.white, TextAnchor.MiddleLeft);
                h.money.rectTransform.offsetMin = new Vector2(28, 0); h.money.rectTransform.offsetMax = new Vector2(-10, 0);
                h.info = UIFactory.Label(h.rt, "", 22, new Color(0.8f, 0.85f, 1f), TextAnchor.LowerLeft);
                h.info.rectTransform.offsetMin = new Vector2(28, 8); h.info.rectTransform.offsetMax = new Vector2(-10, 0);
                huds.Add(h);
            }
        }

        public void RefreshHud(List<Player> players, Player current)
        {
            for (int i = 0; i < huds.Count; i++)
            {
                var p = players[i]; var h = huds[i];
                h.name.text = p.name + (p.isAI ? " (BOT)" : "");
                h.money.text = p.bankrupt ? "İFLAS" : "₺ " + p.money.ToString("N0");
                string info = "";
                if (p.islandTurnsLeft > 0) info = "Adada: " + p.islandTurnsLeft + " tur";
                else if (p.worldTourPending) info = "Dünya Turu hazır";
                h.info.text = info;
                bool active = p == current && !p.bankrupt;
                h.bg.color = p.bankrupt ? new Color(0.2f, 0.2f, 0.2f, 0.8f) : (active ? UIFactory.Purple : UIFactory.Navy);
                h.rt.localScale = Vector3.one * (active ? 1.08f : 1f);
            }
        }

        // ------------------------------------------------------------------ Toast
        private void BuildToast()
        {
            var rt = UIFactory.Panel("Toast", root, new Color(0, 0, 0, 0.55f));
            UIFactory.Anchor(rt, new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -30), new Vector2(900, 70));
            toastGroup = rt.gameObject.AddComponent<CanvasGroup>();
            toastGroup.alpha = 0; toastGroup.blocksRaycasts = false;
            toast = UIFactory.Label(rt, "", 32, Color.white);
        }

        public void Toast(string msg, float seconds = 2.2f)
        {
            if (toastRoutine != null) StopCoroutine(toastRoutine);
            toast.text = msg;
            toastRoutine = StartCoroutine(ToastRoutine(seconds));
        }

        private IEnumerator ToastRoutine(float s)
        {
            toastGroup.alpha = 1f;
            yield return new WaitForSeconds(s);
            float t = 0f;
            while (t < 0.4f) { t += Time.deltaTime; toastGroup.alpha = 1f - t / 0.4f; yield return null; }
            toastGroup.alpha = 0f;
        }

        // ------------------------------------------------------------------ Zar butonu + Güç Barı
        private void BuildRollControls()
        {
            rollRoot = UIFactory.Rect("RollRoot", root);
            UIFactory.Anchor(rollRoot, new Vector2(1, 0), new Vector2(1, 0), new Vector2(1, 0), new Vector2(-40, 40), new Vector2(430, 220));

            // Güç barı (üstte) ve aralık etiketleri
            var bar = UIFactory.Panel("GaugeBg", rollRoot, new Color(0.08f, 0.08f, 0.2f, 0.95f));
            UIFactory.Anchor(bar, new Vector2(0, 1), new Vector2(1, 1), new Vector2(0.5f, 1), new Vector2(0, 0), new Vector2(0, 44));
            var fill = UIFactory.Panel("GaugeFill", bar, UIFactory.Orange);
            gaugeFill = fill;
            fill.pivot = new Vector2(0, 0.5f);
            SetGauge(0f);

            string[] zones = { "DÜŞÜK", "ORTA", "YÜKSEK" };
            for (int i = 0; i < 3; i++)
            {
                var z = UIFactory.Label(rollRoot, zones[i], 20, new Color(1, 1, 1, 0.85f), TextAnchor.MiddleCenter, false);
                UIFactory.Anchor(z.rectTransform, new Vector2(i / 3f, 1), new Vector2((i + 1) / 3f, 1), new Vector2(0.5f, 1), new Vector2(0, -48), new Vector2(0, 28));
            }

            // Zar At butonu: basılı tut → bar dolar/boşalır, bırak → at
            var btn = UIFactory.Panel("RollButton", rollRoot, UIFactory.Orange);
            UIFactory.Anchor(btn, new Vector2(0, 0), new Vector2(1, 0), new Vector2(0.5f, 0), Vector2.zero, new Vector2(0, 130));
            rollLabel = UIFactory.Label(btn, "ZAR AT\n(basılı tut, bırak)", 34, Color.white);
            var trig = btn.gameObject.AddComponent<EventTrigger>();
            AddTrigger(trig, EventTriggerType.PointerDown, delegate { if (rollWaiting) { holding = true; gauge = 0f; gaugeDir = 1f; } });
            AddTrigger(trig, EventTriggerType.PointerUp, delegate { ReleaseRoll(); });
            AddTrigger(trig, EventTriggerType.PointerExit, delegate { ReleaseRoll(); });
            rollRoot.gameObject.SetActive(false);
        }

        private static void AddTrigger(EventTrigger t, EventTriggerType type, UnityEngine.Events.UnityAction<BaseEventData> cb)
        {
            var e = new EventTrigger.Entry { eventID = type };
            e.callback.AddListener(cb);
            t.triggers.Add(e);
        }

        private void SetGauge(float v)
        {
            gauge = Mathf.Clamp01(v);
            gaugeFill.anchorMin = new Vector2(0f, 0f);
            gaugeFill.anchorMax = new Vector2(gauge, 1f);
            gaugeFill.offsetMin = new Vector2(4f, 4f);
            gaugeFill.offsetMax = new Vector2(gauge >= 0.02f ? -4f : 0f, -4f);
        }

        private void Update()
        {
            if (!rollWaiting || !holding) return;
            float next = gauge + gaugeDir * GaugeSpeed * Time.deltaTime;
            if (next >= 1f) { next = 1f; gaugeDir = -1f; }
            else if (next <= 0f) { next = 0f; gaugeDir = 1f; }
            SetGauge(next);
            // Renk: düşük=mavi, orta=yeşil, yüksek=kırmızı
            gaugeFill.GetComponent<Image>().color = gauge < 0.34f ? UIFactory.Blue : (gauge < 0.67f ? UIFactory.Green : new Color(0.9f, 0.2f, 0.2f));
        }

        private void ReleaseRoll()
        {
            if (!rollWaiting || !holding) return;
            holding = false;
            rollWaiting = false;
            rollRoot.gameObject.SetActive(false);
            var cb = rollCallback; rollCallback = null;
            if (cb != null) cb(gauge);
        }

        /// <summary>İnsan oyuncu için zar butonunu gösterir; bırakınca güç (0-1) ile döner.</summary>
        public IEnumerator WaitForRoll(Player p, Action<float> result)
        {
            float power = -1f;
            rollCallback = v => power = v;
            rollRoot.gameObject.SetActive(true);
            gaugeFill.GetComponent<Image>().color = UIFactory.Orange;
            SetGauge(0f);
            rollLabel.text = p.name + "\nZAR AT (basılı tut)";
            holding = false; rollWaiting = true;
            while (power < 0f) yield return null;
            result(power);
        }

        // ------------------------------------------------------------------ Diyaloglar
        private RectTransform OpenDialog(string title, float width)
        {
            CloseDialog();
            dialog = new GameObject("Dialog", typeof(RectTransform));
            dialog.transform.SetParent(root, false);
            var dim = dialog.AddComponent<Image>();
            dim.color = new Color(0, 0, 0, 0.45f);
            UIFactory.Stretch((RectTransform)dialog.transform);

            var panel = UIFactory.Panel("Panel", dialog.transform, UIFactory.Navy);
            UIFactory.Anchor(panel, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(width, 100));
            UIFactory.VerticalLayout(panel.gameObject, 24, 12);
            var fit = panel.gameObject.AddComponent<ContentSizeFitter>();
            fit.verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            var t = UIFactory.Label(panel, title, 36, UIFactory.Gold, TextAnchor.MiddleCenter, false);
            var le = t.gameObject.AddComponent<LayoutElement>();
            le.minHeight = 60; le.preferredHeight = 60;
            return panel;
        }

        public void CloseDialog()
        {
            if (dialog != null) Destroy(dialog);
            dialog = null;
        }

        /// <summary>Tek seçimli diyalog. 8'den fazla seçenek 8 sütunlu ızgara olarak gösterilir.</summary>
        public void AskChoice(string title, List<string> options, Action<int> callback)
        {
            bool grid = options.Count > 8;
            var panel = OpenDialog(title, grid ? 1300 : 700);
            Transform host = panel;
            if (grid)
            {
                var g = UIFactory.Rect("Grid", panel);
                var gl = g.gameObject.AddComponent<GridLayoutGroup>();
                gl.cellSize = new Vector2(140, 70);
                gl.spacing = new Vector2(8, 8);
                gl.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
                gl.constraintCount = 8;
                host = g;
            }
            for (int i = 0; i < options.Count; i++)
            {
                int idx = i;
                var b = UIFactory.MakeButton(host, options[i], UIFactory.Blue, delegate
                {
                    CloseDialog();
                    callback(idx);
                }, grid ? 20 : 30, grid ? 70f : 64f);
            }
        }

        /// <summary>
        /// Satın alma ekranı: bütçeye göre Villa / Bina / Otel (ve Simge Yapı) seçenekleri AYNI ANDA gösterilir,
        /// oyuncu istediklerini işaretler. Seçilenlerin toplamı bakiyeyi aşamaz. İptal → null.
        /// </summary>
        public void AskPurchase(string title, List<PurchaseOption> options, int budget, Action<List<int>> callback)
        {
            var panel = OpenDialog(title, 760);
            var selected = new HashSet<int>();
            var buttons = new List<Button>();
            var totalText = UIFactory.Label(panel, "", 30, Color.white, TextAnchor.MiddleCenter, false);
            totalText.gameObject.AddComponent<LayoutElement>().preferredHeight = 50;
            var confirmHolder = new Button[1];

            Action refresh = null;
            refresh = delegate
            {
                int total = 0;
                foreach (var o in options) if (selected.Contains(o.id)) total += o.cost;
                for (int i = 0; i < options.Count; i++)
                {
                    var o = options[i]; var b = buttons[i];
                    bool on = selected.Contains(o.id);
                    bool affordable = on || total + o.cost <= budget;
                    b.interactable = !o.locked && affordable;
                    UIFactory.SetButtonText(b, (on ? "[X]  " : "[  ]  ") + o.label + "   ₺" + o.cost.ToString("N0"));
                    UIFactory.SetButtonColor(b, on ? UIFactory.Green : UIFactory.Blue);
                }
                totalText.text = "Toplam: ₺" + total.ToString("N0") + "   |   Bakiye: ₺" + budget.ToString("N0");
                if (confirmHolder[0] != null) confirmHolder[0].interactable = selected.Count > 0 && total <= budget;
            };

            foreach (var o in options)
            {
                var opt = o;
                if (opt.locked) selected.Add(opt.id);
                var b = UIFactory.MakeButton(panel, opt.label, UIFactory.Blue, delegate
                {
                    if (selected.Contains(opt.id)) selected.Remove(opt.id); else selected.Add(opt.id);
                    refresh();
                }, 28, 60f);
                buttons.Add(b);
            }
            // totalText'i listenin sonuna taşı
            totalText.transform.SetAsLastSibling();

            var row = UIFactory.Rect("Row", panel);
            var h = row.gameObject.AddComponent<HorizontalLayoutGroup>();
            h.spacing = 16; h.childControlWidth = true; h.childControlHeight = true; h.childForceExpandWidth = true;
            row.gameObject.AddComponent<LayoutElement>().preferredHeight = 70;
            var cancel = UIFactory.MakeButton(row, "Vazgeç", UIFactory.Grey, delegate { CloseDialog(); callback(null); }, 30, 70f);
            var confirm = UIFactory.MakeButton(row, "ONAYLA", UIFactory.Orange, delegate
            {
                var result = new List<int>(selected);
                CloseDialog();
                callback(result);
            }, 30, 70f);
            confirmHolder[0] = confirm;
            refresh();
        }

        // ------------------------------------------------------------------ Zafer
        public void ShowVictory(Player winner, VictoryType type)
        {
            var panel = OpenDialog(winner.name + " KAZANDI!", 760);
            var sub = UIFactory.Label(panel, type.ToTurkish(), 44, Color.white, TextAnchor.MiddleCenter, false);
            sub.gameObject.AddComponent<LayoutElement>().preferredHeight = 80;
            UIFactory.MakeButton(panel, "Yeniden Oyna", UIFactory.Orange, delegate
            {
                SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
            }, 34, 76f);
        }
    }
}
