using UnityEngine;

namespace Paramanya.Board
{
    /// <summary>Simge Yapı kristalini döndürür ve hafifçe yüzdürür.</summary>
    public class Spin : MonoBehaviour
    {
        public float degreesPerSecond = 90f;
        public float bobAmplitude = 0.05f;
        private Vector3 basePos;

        private void Start() { basePos = transform.localPosition; }

        private void Update()
        {
            transform.Rotate(0f, degreesPerSecond * Time.deltaTime, 0f, Space.Self);
            transform.localPosition = basePos + Vector3.up * (Mathf.Sin(Time.time * 2f) * bobAmplitude);
        }
    }
}
