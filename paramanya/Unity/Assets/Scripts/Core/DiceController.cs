using System.Collections;
using UnityEngine;
#if UNITY_6000_0_OR_NEWER
using PhysMat = UnityEngine.PhysicsMaterial;
#else
using PhysMat = UnityEngine.PhysicMaterial;
#endif

namespace Paramanya.Core
{
    /// <summary>
    /// İki zarı fizikle (Rigidbody) atar, sektirir; durunca belirlenen yüzü yukarı
    /// getirecek şekilde yumuşak (Slerp) oturtur. Sonuç önceden DiceControl ile belirlenir,
    /// fizik sadece görsel sekmeyi sağlar.
    /// </summary>
    public class DiceController : MonoBehaviour
    {
        [Tooltip("Blender'dan gelen Dice.fbx prefab'ı. Boşsa numaralı küp üretilir.")]
        public GameObject dicePrefab;
        public Vector3 center = Vector3.zero;
        [Tooltip("Zarların yuvarlandığı zemin yüksekliği (tahta ortası).")]
        public float floorY = 0.05f;
        public float areaHalfSize = 6.5f;
        public float diceSize = 0.5f;
        [Range(0f, 1f)] public float bounciness = 0.45f;

        /// <summary>
        /// Zar yüz numarası → zarın yerel uzayındaki yüz normali (index 0 = 1 yüzü).
        /// Karşıt yüzler toplamı 7. FBX içe aktarımında 2/5 veya 3/4 yönleri ters çıkarsa
        /// bu dizideki vektörleri Inspector'dan değiştirin.
        /// </summary>
        public Vector3[] faceNormals =
        {
            Vector3.up, Vector3.left, Vector3.back, Vector3.forward, Vector3.right, Vector3.down
        };

        private Rigidbody[] dice;
        private bool floorBuilt;
        private PhysMat bounceMat;

        // Unity 6'da velocity → linearVelocity
        private static Vector3 GetVel(Rigidbody rb)
        {
#if UNITY_6000_0_OR_NEWER
            return rb.linearVelocity;
#else
            return rb.velocity;
#endif
        }

        private static void SetVel(Rigidbody rb, Vector3 v)
        {
#if UNITY_6000_0_OR_NEWER
            rb.linearVelocity = v;
#else
            rb.velocity = v;
#endif
        }

        private void EnsureSetup()
        {
            if (!floorBuilt)
            {
                bounceMat = new PhysMat("DiceBounce") { bounciness = bounciness, dynamicFriction = 0.4f, staticFriction = 0.4f };
                var floor = new GameObject("DiceFloor");
                floor.transform.SetParent(transform, false);
                var fc = floor.AddComponent<BoxCollider>();
                fc.size = new Vector3(areaHalfSize * 2f, 0.4f, areaHalfSize * 2f);
                fc.center = center + new Vector3(0, floorY - 0.2f, 0);
                fc.sharedMaterial = bounceMat;
                // Görünmez duvarlar: zarlar tahtadan düşmesin
                for (int i = 0; i < 4; i++)
                {
                    var w = new GameObject("DiceWall" + i);
                    w.transform.SetParent(transform, false);
                    var bc = w.AddComponent<BoxCollider>();
                    bool x = i < 2;
                    float s = (i % 2 == 0) ? 1f : -1f;
                    bc.size = x ? new Vector3(0.4f, 8f, areaHalfSize * 2f) : new Vector3(areaHalfSize * 2f, 8f, 0.4f);
                    bc.center = center + (x ? new Vector3(s * (areaHalfSize + 0.2f), 4f, 0) : new Vector3(0, 4f, s * (areaHalfSize + 0.2f)));
                    bc.sharedMaterial = bounceMat;
                }
                floorBuilt = true;
            }

            if (dice == null)
            {
                dice = new Rigidbody[2];
                for (int i = 0; i < 2; i++) dice[i] = CreateDie(i);
            }
        }

        private Rigidbody CreateDie(int i)
        {
            // Konteyner: pivotu küpün MERKEZİ olan nesne (Rigidbody merkezden döner).
            var root = new GameObject("Die" + (i + 1));
            root.transform.SetParent(transform, false);

            if (dicePrefab != null)
            {
                var visual = Instantiate(dicePrefab, root.transform);
                visual.transform.localPosition = new Vector3(0, -diceSize * 0.5f, 0); // FBX pivotu alt merkez
                visual.transform.localRotation = Quaternion.identity;
                foreach (var c in visual.GetComponentsInChildren<Collider>()) Destroy(c);
                Board.MaterialUtil.ApplyDefaultPalette(visual, Color.white);
            }
            else
            {
                BuildFallbackDie(root.transform);
            }

            var bc = root.AddComponent<BoxCollider>();
            bc.size = Vector3.one * diceSize;
            bc.sharedMaterial = bounceMat;
            var rb = root.AddComponent<Rigidbody>();
            rb.mass = 0.3f;
            rb.interpolation = RigidbodyInterpolation.Interpolate;
            rb.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            root.SetActive(false);
            return rb;
        }

        private void BuildFallbackDie(Transform parent)
        {
            var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
            cube.transform.SetParent(parent, false);
            cube.transform.localScale = Vector3.one * diceSize;
            Destroy(cube.GetComponent<Collider>());
            cube.GetComponent<Renderer>().sharedMaterial = Board.MaterialUtil.Make(new Color(0.97f, 0.96f, 0.92f));

            var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            for (int f = 0; f < 6; f++)
            {
                Vector3 n = faceNormals[f];
                var go = new GameObject("Face" + (f + 1));
                go.transform.SetParent(parent, false);
                go.transform.localPosition = n * (diceSize * 0.5f + 0.003f);
                Vector3 upHint = Mathf.Abs(Vector3.Dot(n, Vector3.up)) > 0.9f ? Vector3.forward : Vector3.up;
                go.transform.localRotation = Quaternion.LookRotation(-n, upHint);
                var tm = go.AddComponent<TextMesh>();
                tm.text = (f + 1).ToString();
                tm.font = font;
                tm.fontSize = 64;
                tm.characterSize = 0.1f;
                tm.anchor = TextAnchor.MiddleCenter;
                tm.alignment = TextAlignment.Center;
                tm.color = new Color(0.8f, 0.1f, 0.1f);
                go.GetComponent<MeshRenderer>().sharedMaterial = font.material;
            }
        }

        /// <summary>İki zarı atar; durduklarında üst yüzlerde a ve b görünür.</summary>
        public IEnumerator Throw(int a, int b, float power)
        {
            EnsureSetup();
            int[] values = { a, b };

            for (int i = 0; i < 2; i++)
            {
                var rb = dice[i];
                rb.gameObject.SetActive(true);
                rb.isKinematic = false;
                rb.position = center + new Vector3(i == 0 ? -0.9f : 0.9f, 4f, Random.Range(-0.6f, 0.6f));
                rb.rotation = Random.rotation;
                SetVel(rb, new Vector3(Random.Range(-1.5f, 1.5f), -1f, Random.Range(-1.5f, 1.5f)) * (1f + power * 2f));
                rb.angularVelocity = Random.onUnitSphere * Mathf.Lerp(8f, 20f, power);
            }

            yield return new WaitForSeconds(0.9f);
            float t = 0f;
            while (t < 2.5f && !AllSettled()) { t += Time.deltaTime; yield return null; }

            // Hedef yüzü yukarı getir (SLERP)
            var start = new Quaternion[2];
            var goal = new Quaternion[2];
            for (int i = 0; i < 2; i++)
            {
                var tr = dice[i].transform;
                dice[i].isKinematic = true;
                start[i] = tr.rotation;
                Vector3 up = tr.rotation * faceNormals[Mathf.Clamp(values[i], 1, 6) - 1];
                goal[i] = Quaternion.FromToRotation(up, Vector3.up) * tr.rotation;
            }

            float k = 0f;
            while (k < 1f)
            {
                k += Time.deltaTime / 0.4f;
                float e = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(k));
                for (int i = 0; i < 2; i++) dice[i].transform.rotation = Quaternion.Slerp(start[i], goal[i], e);
                yield return null;
            }
        }

        private bool AllSettled()
        {
            foreach (var rb in dice)
                if (GetVel(rb).sqrMagnitude > 0.02f || rb.angularVelocity.sqrMagnitude > 0.25f) return false;
            return true;
        }

        public void Clear()
        {
            if (dice == null) return;
            foreach (var rb in dice) rb.gameObject.SetActive(false);
        }
    }
}
