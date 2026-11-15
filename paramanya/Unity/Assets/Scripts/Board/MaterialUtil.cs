using System.Collections.Generic;
using UnityEngine;

namespace Paramanya.Board
{
    /// <summary>
    /// Materyal yardımcıları. Blender varlıklarında slot sırası sabittir:
    ///   0 Base_White, 1 Team_Color_Accent, 2 Gold_Trim, 3 Glass_Emissive.
    /// Oyuncu/renk grubu rengi MaterialPropertyBlock ile slot 1'e yazılır (materyal kopyası üretilmez).
    /// </summary>
    public static class MaterialUtil
    {
        public const int SlotBase = 0, SlotAccent = 1, SlotGold = 2, SlotGlass = 3;

        private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor"); // URP
        private static readonly int ColorId = Shader.PropertyToID("_Color");         // Built-in
        private static readonly int EmissionId = Shader.PropertyToID("_EmissionColor");
        private static readonly Dictionary<Color, Material> cache = new Dictionary<Color, Material>();

        public static readonly Color Gold = new Color(1f, 0.72f, 0.15f);
        public static readonly Color Glass = new Color(0.45f, 0.85f, 1f);
        public static readonly Color White = new Color(0.95f, 0.94f, 0.90f);

        /// <summary>Düz renkli (URP Lit, yoksa Standard) paylaşımlı materyal.</summary>
        public static Material Make(Color c)
        {
            Material m;
            if (cache.TryGetValue(c, out m) && m != null) return m;
            Shader sh = Shader.Find("Universal Render Pipeline/Lit");
            if (sh == null) sh = Shader.Find("Standard");
            m = new Material(sh);
            m.SetColor(BaseColorId, c);
            m.SetColor(ColorId, c);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0.6f);
            cache[c] = m;
            return m;
        }

        public static void Paint(Renderer r, int slot, Color c)
        {
            if (r == null) return;
            int count = r.sharedMaterials.Length;
            if (slot < 0 || slot >= count) return;
            var mpb = new MaterialPropertyBlock();
            r.GetPropertyBlock(mpb, slot);
            mpb.SetColor(BaseColorId, c);
            mpb.SetColor(ColorId, c);
            r.SetPropertyBlock(mpb, slot);
        }

        public static void PaintEmission(Renderer r, int slot, Color c)
        {
            if (r == null || slot >= r.sharedMaterials.Length) return;
            var mpb = new MaterialPropertyBlock();
            r.GetPropertyBlock(mpb, slot);
            mpb.SetColor(EmissionId, c);
            r.SetPropertyBlock(mpb, slot);
        }

        /// <summary>
        /// FBX'ten içe aktarılan 4 slotlu nesnelere varsayılan renkleri verir
        /// (Unity Blender renklerini her zaman taşımaz). Slot 1 = accent.
        /// </summary>
        public static void ApplyDefaultPalette(GameObject go, Color accent)
        {
            foreach (var r in go.GetComponentsInChildren<Renderer>())
            {
                if (r.sharedMaterials.Length >= 4)
                {
                    Paint(r, SlotBase, White);
                    Paint(r, SlotAccent, accent);
                    Paint(r, SlotGold, Gold);
                    Paint(r, SlotGlass, Glass);
                }
            }
        }

        /// <summary>Nesnedeki tüm renderer'larda accent rengini günceller.</summary>
        public static void SetAccent(GameObject go, Color accent)
        {
            foreach (var r in go.GetComponentsInChildren<Renderer>())
            {
                if (r.sharedMaterials.Length >= 4) Paint(r, SlotAccent, accent);
                else Paint(r, 0, accent);
            }
        }

        // ---- Prefab yoksa kullanılan ilkel şekiller ----
        public static GameObject Prim(PrimitiveType type, string name, Transform parent,
            Vector3 localPos, Vector3 scale, Color c)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            var col = go.GetComponent<Collider>();
            if (col != null) Object.Destroy(col);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = scale;
            go.GetComponent<Renderer>().sharedMaterial = Make(c);
            return go;
        }
    }
}
