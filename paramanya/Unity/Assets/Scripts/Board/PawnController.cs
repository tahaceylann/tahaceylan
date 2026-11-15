using System.Collections;
using UnityEngine;

namespace Paramanya.Board
{
    /// <summary>Piyon: karelerde parabolik zıplama (arc jump) ve Dünya Turu uçuşu.</summary>
    public class PawnController : MonoBehaviour
    {
        public float hopDuration = 0.28f;
        public float hopHeight = 0.9f;

        private Vector3 baseScale = Vector3.one;

        private void Awake() { baseScale = transform.localScale; }

        public void TeleportTo(Vector3 p) { transform.position = p; }

        /// <summary>y = 4h·t·(1−t) parabolü ile zıplayarak hedefe gider, inişte hafif ezilir.</summary>
        public IEnumerator HopTo(Vector3 target)
        {
            yield return Arc(target, hopDuration, hopHeight);
            yield return Squash();
        }

        /// <summary>Daha uzun ve yüksek kavis: Dünya Turu / şans kartı ışınlanması.</summary>
        public IEnumerator FlyTo(Vector3 target)
        {
            float dist = Vector3.Distance(transform.position, target);
            yield return Arc(target, Mathf.Clamp(0.5f + dist * 0.06f, 0.8f, 1.6f), 3f + dist * 0.25f);
            yield return Squash();
        }

        private IEnumerator Arc(Vector3 target, float duration, float height)
        {
            Vector3 a = transform.position;
            Vector3 flat = target - a; flat.y = 0f;
            if (flat.sqrMagnitude > 0.001f) transform.rotation = Quaternion.LookRotation(flat.normalized);

            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / duration;
                float k = Mathf.Clamp01(t);
                Vector3 p = Vector3.Lerp(a, target, k);
                p.y += 4f * height * k * (1f - k);
                transform.position = p;
                yield return null;
            }
            transform.position = target;
        }

        private IEnumerator Squash()
        {
            float t = 0f, d = 0.12f;
            while (t < d)
            {
                t += Time.deltaTime;
                float k = Mathf.Sin(Mathf.Clamp01(t / d) * Mathf.PI);
                transform.localScale = new Vector3(baseScale.x * (1f + 0.15f * k), baseScale.y * (1f - 0.25f * k), baseScale.z * (1f + 0.15f * k));
                yield return null;
            }
            transform.localScale = baseScale;
        }
    }
}
