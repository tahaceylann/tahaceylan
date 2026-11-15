using UnityEngine;

namespace Paramanya.Board
{
    /// <summary>
    /// İzometrik genel tahta görünümü ↔ zar atışı / inşa anında piyonu takip eden
    /// yakın plan. Cinemachine gerektirmez: konum, mesafe, pitch ve yaw yumuşak (üstel) geçişle ilerler.
    /// </summary>
    [RequireComponent(typeof(Camera))]
    public class BoardCameraController : MonoBehaviour
    {
        [Header("İzometrik genel görünüm")]
        public Vector3 overviewPivot = Vector3.zero;
        public float overviewDistance = 32f;
        public float overviewPitch = 50f;
        public float overviewYaw = 45f;

        [Header("Yakın plan")]
        public float closeDistance = 11f;
        public float closePitch = 42f;

        [Header("Yumuşaklık")]
        public float smooth = 3.5f;
        public float fieldOfView = 35f;

        private Camera cam;
        private Vector3 pivot, targetPivot;
        private float distance, targetDistance, pitch, targetPitch, yaw, targetYaw;
        private Transform follow;

        private void Awake()
        {
            cam = GetComponent<Camera>();
            cam.fieldOfView = fieldOfView;
            SnapToOverview();
        }

        public void SnapToOverview()
        {
            follow = null;
            pivot = targetPivot = overviewPivot;
            distance = targetDistance = overviewDistance;
            pitch = targetPitch = overviewPitch;
            yaw = targetYaw = overviewYaw;
            Apply();
        }

        public void Overview()
        {
            follow = null;
            targetPivot = overviewPivot;
            targetDistance = overviewDistance;
            targetPitch = overviewPitch;
            targetYaw = overviewYaw;
        }

        /// <summary>Hareketli bir hedefi (piyon) takip ederek yakınlaş.</summary>
        public void FollowTarget(Transform t, float dist = -1f)
        {
            follow = t;
            targetDistance = dist > 0f ? dist : closeDistance;
            targetPitch = closePitch;
        }

        /// <summary>Sabit bir noktaya odaklan (ör. zar atış alanı).</summary>
        public void FocusPoint(Vector3 p, float dist)
        {
            follow = null;
            targetPivot = p;
            targetDistance = dist;
            targetPitch = overviewPitch;
        }

        private void LateUpdate()
        {
            if (follow != null) targetPivot = follow.position;
            float k = 1f - Mathf.Exp(-smooth * Time.deltaTime);
            pivot = Vector3.Lerp(pivot, targetPivot, k);
            distance = Mathf.Lerp(distance, targetDistance, k);
            pitch = Mathf.Lerp(pitch, targetPitch, k);
            yaw = Mathf.LerpAngle(yaw, targetYaw, k);
            Apply();
        }

        private void Apply()
        {
            Quaternion rot = Quaternion.Euler(pitch, yaw, 0f);
            transform.rotation = rot;
            transform.position = pivot - rot * Vector3.forward * distance;
        }
    }
}
