using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace Paramanya.UI
{
    /// <summary>Prefab gerektirmeden uGUI öğeleri üreten yardımcılar (Paramanya renk paleti).</summary>
    public static class UIFactory
    {
        public static readonly Color Navy = new Color(0.10f, 0.14f, 0.45f, 0.95f);
        public static readonly Color Purple = new Color(0.36f, 0.20f, 0.70f, 0.96f);
        public static readonly Color Gold = new Color(1.00f, 0.72f, 0.15f, 1f);
        public static readonly Color Orange = new Color(1.00f, 0.55f, 0.10f, 1f);
        public static readonly Color Green = new Color(0.20f, 0.70f, 0.30f, 1f);
        public static readonly Color Blue = new Color(0.20f, 0.45f, 0.95f, 1f);
        public static readonly Color Grey = new Color(0.45f, 0.45f, 0.52f, 1f);

        private static Font font;
        public static Font DefaultFont
        {
            get
            {
                if (font == null) font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                return font;
            }
        }

        public static RectTransform Rect(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            return (RectTransform)go.transform;
        }

        public static RectTransform Panel(string name, Transform parent, Color c)
        {
            var rt = Rect(name, parent);
            rt.gameObject.AddComponent<Image>().color = c;
            return rt;
        }

        public static void Anchor(RectTransform rt, Vector2 min, Vector2 max, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            rt.anchorMin = min; rt.anchorMax = max; rt.pivot = pivot;
            rt.anchoredPosition = pos; rt.sizeDelta = size;
        }

        public static void Stretch(RectTransform rt)
        {
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
            rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
        }

        public static Text Label(Transform parent, string text, int size, Color c, TextAnchor anchor = TextAnchor.MiddleCenter, bool stretch = true)
        {
            var rt = Rect("Text", parent);
            var t = rt.gameObject.AddComponent<Text>();
            t.font = DefaultFont;
            t.text = text;
            t.fontSize = size;
            t.color = c;
            t.alignment = anchor;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false;
            if (stretch) Stretch(rt);
            return t;
        }

        public static Button MakeButton(Transform parent, string text, Color c, UnityAction onClick, int fontSize = 30, float height = 64f)
        {
            var rt = Panel("Button", parent, c);
            var btn = rt.gameObject.AddComponent<Button>();
            var colors = btn.colors;
            colors.highlightedColor = new Color(1.1f, 1.1f, 1.1f, 1f);
            colors.pressedColor = new Color(0.8f, 0.8f, 0.8f, 1f);
            colors.disabledColor = new Color(0.5f, 0.5f, 0.5f, 0.7f);
            btn.colors = colors;
            btn.targetGraphic = rt.GetComponent<Image>();
            if (onClick != null) btn.onClick.AddListener(onClick);
            var le = rt.gameObject.AddComponent<LayoutElement>();
            le.minHeight = height; le.preferredHeight = height;
            var lbl = Label(rt, text, fontSize, Color.white);
            lbl.name = "Label";
            return btn;
        }

        public static void SetButtonText(Button b, string text)
        {
            var t = b.transform.Find("Label");
            if (t != null) t.GetComponent<Text>().text = text;
        }

        public static void SetButtonColor(Button b, Color c) { b.GetComponent<Image>().color = c; }

        public static VerticalLayoutGroup VerticalLayout(GameObject go, int padding, int spacing)
        {
            var v = go.AddComponent<VerticalLayoutGroup>();
            v.padding = new RectOffset(padding, padding, padding, padding);
            v.spacing = spacing;
            v.childAlignment = TextAnchor.UpperCenter;
            v.childControlWidth = true; v.childControlHeight = true;
            v.childForceExpandWidth = true; v.childForceExpandHeight = false;
            return v;
        }
    }
}
