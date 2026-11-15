using System.Collections;
using UnityEngine;

namespace Paramanya.Board
{
    /// <summary>Tek bir tahta karosunun görseli: renk şeridi, sahip işareti, "parlama" efekti.</summary>
    public class TileView : MonoBehaviour
    {
        public int index;
        /// <summary>Yapıların yerleştirildiği nokta (karo yerel uzayı).</summary>
        public Transform buildingRoot;

        public Renderer baseRenderer;     // FBX: tüm karo; ilkel: taban kutusu
        public Renderer accentRenderer;   // sadece ilkel karoda renk şeridi
        public Renderer ownerMarker;      // sahip rengi işareti

        private Coroutine flashRoutine;
        private Vector3 restLocalPos;
        private bool restSaved;

        public void SetAccent(Color c)
        {
            if (accentRenderer != null) MaterialUtil.Paint(accentRenderer, 0, c);
            else if (baseRenderer != null) MaterialUtil.Paint(baseRenderer, MaterialUtil.SlotAccent, c);
        }

        public void SetOwner(bool owned, Color c)
        {
            if (ownerMarker == null) return;
            ownerMarker.gameObject.SetActive(owned);
            if (owned) MaterialUtil.Paint(ownerMarker, 0, c);
        }

        /// <summary>Piyon bastığında karo kısa süreli parlar ve hafifçe zıplar.</summary>
        public void Flash()
        {
            if (!restSaved) { restLocalPos = transform.localPosition; restSaved = true; }
            if (flashRoutine != null) StopCoroutine(flashRoutine);
            flashRoutine = StartCoroutine(FlashRoutine());
        }

        private IEnumerator FlashRoutine()
        {
            Color glow = new Color(1f, 0.95f, 0.55f);
            float d = 0.45f, t = 0f;
            while (t < d)
            {
                t += Time.deltaTime;
                float k = Mathf.Sin(Mathf.Clamp01(t / d) * Mathf.PI); // 0→1→0
                if (baseRenderer != null)
                {
                    Color c = Color.Lerp(MaterialUtil.White, glow, k);
                    MaterialUtil.Paint(baseRenderer, MaterialUtil.SlotBase, c);
                    MaterialUtil.PaintEmission(baseRenderer, MaterialUtil.SlotBase, glow * (k * 0.6f));
                }
                transform.localPosition = restLocalPos + Vector3.up * (0.12f * k);
                yield return null;
            }
            if (baseRenderer != null)
            {
                MaterialUtil.Paint(baseRenderer, MaterialUtil.SlotBase, MaterialUtil.White);
                MaterialUtil.PaintEmission(baseRenderer, MaterialUtil.SlotBase, Color.black);
            }
            transform.localPosition = restLocalPos;
            flashRoutine = null;
        }
    }
}
