/* ==========================================================================
   Fenomen Ol! – Yayıncının Odası (3D)
   Three.js ile çizilen, oyuncunun ilerlemesine göre kademeli olarak
   gelişen bir 3D stüdyo odası. app.js'teki global `state`, `STREAMER_TIERS`
   ve `currentStreamerTierIndex()` üzerinden beslenir; kendi başına bir
   modül değildir, app.js ile aynı global kapsamı paylaşır.

   Bu sürüm daha "gelişmiş" bir 3D deneyim için şunları ekler:
   - Yumuşak takip eden (lerp) kamera + sekmeye her girişte sinematik giriş
   - Otomatik döndürme modu (elle sürüklemeye ek olarak)
   - Yeni ekipman artık aniden belirmiyor, "sekerek" büyüyor (elastic pop-in)
   - Daha önce statik duran parçalara sürekli hareket: ring light nabzı,
     stüdyo ışığı titremesi, monitör/mikser animasyonu, uydu çanağı dönüşü,
     taç parıltıları
   - Ortam toz parçacıkları (seviyeden bağımsız, her zaman var)
   - Dokunarak etkileşim: ekipmana dokununca tepki verir (ışık patlaması,
     kamera flaşı, taç/avatar parıltı patlaması)
   ========================================================================== */
"use strict";

// Mağazadaki profil temalarının (bkz. style.css [data-skin="..."]) vurgu
// renklerinin 3D karşılığı — oda aydınlatması aktif temaya göre boyanır.
const SKIN_ACCENT_HEX = {
  classic: 0xff2d78,
  gold: 0xffd166,
  neon: 0x39ff88,
  ocean: 0x38bdf8,
  fire: 0xff5e3a,
};

function roomAccentHex() {
  return SKIN_ACCENT_HEX[state.activeSkin] || SKIN_ACCENT_HEX.classic;
}

let roomInited = false;
let roomAnimating = false;
let roomScene, roomCamera, roomRenderer, roomEquipmentGroup, roomAvatarSprite;
let roomBuiltForTier = -1;
let roomAvatarTierIdx = -1;
let roomDragState = null;
let roomYaw = 0.5;
let roomPitch = -0.18;
let roomClock = 0;
let roomCamPos = null;       // THREE.Vector3 — kameranın "yumuşak takip eden" gerçek konumu
let roomAutoRotate = false;
let roomTransientSprites = []; // dokunma tepkileri gibi kısa ömürlü efektler
let roomDustMotes = [];
// CSS'teki genel prefers-reduced-motion kuralı WebGL/Three.js animasyonlarını
// kapsamaz (JS ile sürülüyorlar) — burada ayrıca kontrol ediyoruz: kamera
// hedefine anında gider, yeni ekipman sekmeden belirir, toz zerrecikleri
// sürüklenmez. Dokunma tepkileri (kullanıcı eylemine anlık geri bildirim)
// yine de korunur.
const roomReducedMotion = typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ==========================================================================
   Kurulum
   ========================================================================== */

function initRoomIfNeeded() {
  if (roomInited) return;
  const container = document.getElementById("roomCanvasWrap");
  if (!container || typeof THREE === "undefined") return;
  roomInited = true;

  roomScene = new THREE.Scene();
  roomScene.background = new THREE.Color(0x0a0718);
  roomScene.fog = new THREE.Fog(0x0a0718, 9, 22);

  roomCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  roomCamPos = new THREE.Vector3(Math.sin(roomYaw) * 7.2, 3.6, Math.cos(roomYaw) * 7.2);
  roomCamera.position.copy(roomCamPos);

  roomRenderer = new THREE.WebGLRenderer({ antialias: true });
  roomRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.innerHTML = "";
  container.appendChild(roomRenderer.domElement);
  resizeRoomRenderer();

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  roomScene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(3, 5, 4);
  roomScene.add(key);
  const rim = new THREE.PointLight(0xff2d78, 1.1, 14);
  rim.position.set(-2.5, 2.2, -1.5);
  rim.name = "roomRimLight";
  roomScene.add(rim);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1c1436, roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.name = "roomFloor";
  roomScene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x150c33, roughness: 1 });
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), wallMat);
  backWall.position.set(0, 3, -4);
  backWall.name = "roomBackWall";
  roomScene.add(backWall);

  const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), wallMat.clone());
  sideWall.rotation.y = Math.PI / 2;
  sideWall.position.set(-4.99, 3, 0);
  sideWall.name = "roomSideWall";
  roomScene.add(sideWall);

  roomEquipmentGroup = new THREE.Group();
  roomScene.add(roomEquipmentGroup);

  spawnDustMotes();

  container.style.touchAction = "none";
  container.addEventListener("pointerdown", e => {
    roomDragState = { x: e.clientX, y: e.clientY, yaw: roomYaw, pitch: roomPitch, moved: false, t0: performance.now() };
  });
  window.addEventListener("pointermove", e => {
    if (!roomDragState) return;
    const dx = e.clientX - roomDragState.x;
    const dy = e.clientY - roomDragState.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) roomDragState.moved = true;
    roomYaw = roomDragState.yaw - dx * 0.008;
    roomPitch = Math.max(-0.45, Math.min(0.25, roomDragState.pitch - dy * 0.006));
  });
  window.addEventListener("pointerup", e => {
    if (roomDragState && !roomDragState.moved && performance.now() - roomDragState.t0 < 450) {
      handleRoomTap(e);
    }
    roomDragState = null;
  });
  window.addEventListener("resize", resizeRoomRenderer);

  const autoBtn = document.getElementById("roomAutoRotateBtn");
  if (autoBtn) autoBtn.addEventListener("click", () => toggleRoomAutoRotate());
}

function resizeRoomRenderer() {
  const container = document.getElementById("roomCanvasWrap");
  if (!container || !roomRenderer) return;
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w === 0 || h === 0) return;
  roomRenderer.setSize(w, h);
  roomCamera.aspect = w / h;
  roomCamera.updateProjectionMatrix();
}

function startRoomLoop() {
  if (!roomInited || roomAnimating) return;
  roomAnimating = true;
  requestAnimationFrame(roomAnimate);
}

function stopRoomLoop() {
  roomAnimating = false;
}

/* ==========================================================================
   Ana döngü — kamera takibi, ekipman animasyonları, geçici efektler
   ========================================================================== */

function roomAnimate() {
  if (!roomAnimating) return;
  requestAnimationFrame(roomAnimate);
  roomClock += 0.016;

  if (roomAutoRotate && !roomDragState) {
    roomYaw += 0.0035;
  }

  const radius = 7.2;
  const targetX = Math.sin(roomYaw) * radius * Math.cos(roomPitch);
  const targetZ = Math.cos(roomYaw) * radius * Math.cos(roomPitch);
  const targetY = 2.4 + Math.sin(roomPitch) * radius * 0.6 + 1.2;
  // Kamera hedefe anında zıplamaz, her karede biraz yaklaşır — hem sürükleme
  // hem sekmeye giriş anındaki "sinematik" yumuşak geçişi tek mekanizma sağlar.
  // Hareket azaltma tercihi açıksa kamera doğrudan hedefe gider.
  const camLerp = roomReducedMotion ? 1 : 0.07;
  roomCamPos.x += (targetX - roomCamPos.x) * camLerp;
  roomCamPos.y += (targetY - roomCamPos.y) * camLerp;
  roomCamPos.z += (targetZ - roomCamPos.z) * camLerp;
  roomCamera.position.copy(roomCamPos);
  roomCamera.lookAt(0, 1.5, -1);

  if (roomAvatarSprite) {
    roomAvatarSprite.position.y = 1.7 + Math.sin(roomClock * 1.3) * 0.05;
    roomAvatarSprite.material.rotation = Math.sin(roomClock * 0.6) * 0.05;
  }

  roomEquipmentGroup.children.forEach((obj, i) => animateEquipmentObject(obj, i));
  updateTransientSprites();
  updateDustMotes();

  const rimLight = roomScene.getObjectByName("roomRimLight");
  if (rimLight) rimLight.color.setHex(roomAccentHex());

  roomRenderer.render(roomScene, roomCamera);
}

function animateEquipmentObject(obj, i) {
  const ud = obj.userData;

  // Yeni eklenen ekipman: 0'dan hedef ölçeğe "elastic" bir sekmeyle büyür
  // (hareket azaltma tercihi açıksa doğrudan tam boyutta belirir).
  if (ud.spawnAt !== undefined && !ud.spawnDone) {
    if (roomReducedMotion) {
      obj.scale.setScalar(1);
      ud.spawnDone = true;
    } else {
      const t = Math.min(1, (roomClock - ud.spawnAt) / 0.55);
      const s = t >= 1 ? 1 : elasticOut(t);
      obj.scale.setScalar(Math.max(0.001, s));
      if (t >= 1) { ud.spawnDone = true; obj.scale.setScalar(1); }
    }
  }

  // Sürekli "ambient" hareketler (nabız, titreme, dönüş, sürüklenme) hareket
  // azaltma tercihi açıkken atlanır — sadece dokunma tepkileri (kısa, kullanıcı
  // eylemine bağlı) her koşulda çalışmaya devam eder, aşağıdaki flashUntil
  // bloğunda ayrıca ele alınıyor.
  if (!roomReducedMotion) {
    if (ud.float) {
      obj.position.y = ud.baseY + Math.sin(roomClock * (1.1 + i * 0.07) + i) * 0.05;
    }
    if (ud.spin) {
      obj.rotation.y += ud.spinSpeed * (ud.spinBoostUntil > roomClock ? 4 : 1);
    }
    if (ud.anim === "pulse") {
      obj.material.emissiveIntensity = ud.baseIntensity + Math.sin(roomClock * 2.2 + (ud.phase || 0)) * ud.ampIntensity;
    }
    if (ud.anim === "flicker") {
      obj.material.emissiveIntensity = ud.baseIntensity + (Math.sin(roomClock * 14 + (ud.phase || 0)) > 0.85 ? 0.5 : 0);
    }
    if (ud.anim === "screenColor") {
      const hue = (roomClock * 0.06 + (ud.phase || 0)) % 1;
      obj.material.emissive.setHSL(hue, 0.8, 0.55);
    }
    if (ud.anim === "blink") {
      const on = Math.sin(roomClock * 3 + (ud.phase || 0)) > 0;
      obj.material.emissiveIntensity = on ? 0.9 : 0.15;
    }
    if (ud.anim === "shimmer") {
      obj.material.emissive = obj.material.emissive || new THREE.Color(0x0e8f4a);
      obj.material.emissiveIntensity = 0.15 + Math.sin(roomClock * 1.5 + (ud.phase || 0)) * 0.1;
    }
    if (ud.anim === "sparkle") {
      const t = (Math.sin(roomClock * 2 + (ud.phase || 0)) + 1) / 2;
      obj.material.opacity = 0.2 + t * 0.8;
      obj.scale.setScalar(0.6 + t * 0.5);
    }
  }
  if (ud.flashUntil && ud.flashUntil > roomClock) {
    obj.material.emissiveIntensity = ud.flashIntensity;
  } else if (ud.flashUntil) {
    ud.flashUntil = 0;
  }
}

function elasticOut(t) {
  const c4 = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

function makeEmojiTexture(emoji, size) {
  size = size || 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.font = Math.round(size * 0.72) + "px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.05);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/* ==========================================================================
   Ortam toz parçacıkları (seviyeden bağımsız, sürekli)
   ========================================================================== */

// Toz zerreciği ve parıltı sprite'ları için tek, paylaşılan doku — her
// patlamada yeni bir canvas/texture oluşturup hiç dispose etmemek (GPU
// belleği sızdırır) yerine bunu bir kez üretip yeniden kullanıyoruz.
let roomDotTexture = null;
function getDotTexture() {
  if (roomDotTexture) return roomDotTexture;
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  roomDotTexture = new THREE.CanvasTexture(canvas);
  return roomDotTexture;
}

function spawnDustMotes() {
  const tex = getDotTexture();
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.25 + Math.random() * 0.25, depthWrite: false });
    const mote = new THREE.Sprite(mat);
    const scale = 0.04 + Math.random() * 0.06;
    mote.scale.set(scale, scale, 1);
    mote.position.set((Math.random() - 0.5) * 7, Math.random() * 3.2, (Math.random() - 0.5) * 6 - 1);
    mote.userData.speed = 0.05 + Math.random() * 0.08;
    mote.userData.drift = Math.random() * Math.PI * 2;
    roomScene.add(mote);
    roomDustMotes.push(mote);
  }
}

function updateDustMotes() {
  if (roomReducedMotion) return;
  roomDustMotes.forEach(mote => {
    mote.position.y += mote.userData.speed * 0.016;
    mote.position.x += Math.sin(roomClock * 0.5 + mote.userData.drift) * 0.001;
    if (mote.position.y > 3.4) mote.position.y = 0;
  });
}

/* ==========================================================================
   Geçici efektler (dokunma tepkileri): kısa ömürlü parıltı patlamaları
   ========================================================================== */

function spawn3DSparkles(position, count, colorHex) {
  const tex = getDotTexture();
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, color: colorHex || 0xffffff, transparent: true, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    const scale = 0.06 + Math.random() * 0.08;
    spr.scale.set(scale, scale, 1);
    spr.position.copy(position);
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.6 + Math.random() * 1.2;
    spr.userData.vx = Math.cos(angle) * speed;
    spr.userData.vy = 1.2 + Math.random() * 1.4;
    spr.userData.vz = Math.sin(angle) * speed;
    spr.userData.bornAt = roomClock;
    spr.userData.life = 0.7 + Math.random() * 0.3;
    roomScene.add(spr);
    roomTransientSprites.push(spr);
  }
}

function updateTransientSprites() {
  for (let i = roomTransientSprites.length - 1; i >= 0; i--) {
    const spr = roomTransientSprites[i];
    const age = roomClock - spr.userData.bornAt;
    const t = age / spr.userData.life;
    if (t >= 1) {
      roomScene.remove(spr);
      spr.material.dispose();
      roomTransientSprites.splice(i, 1);
      continue;
    }
    spr.position.x += spr.userData.vx * 0.016;
    spr.position.y += (spr.userData.vy - t * 3) * 0.016;
    spr.position.z += spr.userData.vz * 0.016;
    spr.material.opacity = 1 - t;
  }
}

function flashObject(obj, intensity, duration) {
  obj.userData.flashIntensity = intensity;
  obj.userData.flashUntil = roomClock + duration;
}

/* ==========================================================================
   Dokunarak etkileşim (raycasting)
   ========================================================================== */

function handleRoomTap(e) {
  const container = document.getElementById("roomCanvasWrap");
  if (!container || !roomRenderer) return;
  const rect = container.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, roomCamera);
  const targets = roomEquipmentGroup.children.concat(roomAvatarSprite ? [roomAvatarSprite] : []);
  const hits = raycaster.intersectObjects(targets, false);
  for (const hit of hits) {
    const obj = hit.object;
    if (obj.userData.tapReaction) {
      obj.userData.tapReaction(obj, hit.point);
      return;
    }
  }
}

function tapToast(msg) {
  if (typeof toast === "function") toast(msg);
}

/* ------------------------------ Ekipman parçaları ------------------------------ */

function spawnEquipment(mesh) {
  mesh.userData.spawnAt = roomClock;
  mesh.scale.setScalar(0.001);
  roomEquipmentGroup.add(mesh);
  return mesh;
}

function addDesk() {
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x3a2a5c, roughness: 0.6 });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1), deskMat);
  desk.position.set(0, 0.75, -1.2);
  spawnEquipment(desk);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x241a3d });
  [[-1.1, -0.45], [1.1, -0.45], [-1.1, 0.45], [1.1, 0.45]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), legMat);
    leg.position.set(x, 0.375, -1.2 + z);
    spawnEquipment(leg);
  });
}

function addRingLight() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe9a8, emissiveIntensity: 0.9 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 12, 32), mat);
  ring.position.set(-1.3, 1.75, -1.7);
  ring.userData.anim = "pulse";
  ring.userData.baseIntensity = 0.9;
  ring.userData.ampIntensity = 0.35;
  ring.userData.tapReaction = (obj) => {
    flashObject(obj, 2.2, 0.4);
    spawn3DSparkles(obj.position, 10, 0xffe9a8);
    tapToast("💡 Işıklar patladı!");
  };
  spawnEquipment(ring);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x2a2040 }));
  stand.position.set(-1.3, 1.1, -1.7);
  spawnEquipment(stand);
}

function addCameraProp() {
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.4), new THREE.MeshStandardMaterial({ color: 0x111018, roughness: 0.4, metalness: 0.3 }));
  body.position.set(1.0, 1.15, -1.4);
  body.userData.tapReaction = (obj) => {
    spawn3DSparkles(new THREE.Vector3(1.0, 1.3, -1.15), 14, 0xffffff);
    tapToast("📸 Şınk! Harika bir kare.");
  };
  spawnEquipment(body);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.25, 16), new THREE.MeshStandardMaterial({ color: 0x050508 }));
  lens.rotation.z = Math.PI / 2;
  lens.position.set(1.0, 1.15, -1.15);
  spawnEquipment(lens);
  const tripod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8), new THREE.MeshStandardMaterial({ color: 0x2a2040 }));
  tripod.position.set(1.0, 0.6, -1.4);
  spawnEquipment(tripod);
}

function addMic() {
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x2a2040 }));
  arm.rotation.z = Math.PI / 3.2;
  arm.position.set(0.15, 1.15, -1.15);
  spawnEquipment(arm);
  const mic = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), new THREE.MeshStandardMaterial({ color: 0x0d0d12, metalness: 0.5, roughness: 0.3 }));
  mic.position.set(0.34, 1.36, -1.03);
  mic.userData.tapReaction = (obj) => {
    tapToast("🎙️ Ses testi... bir, iki, üç!");
    spawn3DSparkles(obj.position, 6, 0x39ff88);
  };
  spawnEquipment(mic);
}

function addMonitor() {
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.05), new THREE.MeshStandardMaterial({ color: 0x0d0d14 }));
  frame.position.set(0, 1.35, -1.65);
  spawnEquipment(frame);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.45), new THREE.MeshStandardMaterial({ color: 0xff2d78, emissive: 0x7b2ff7, emissiveIntensity: 0.6 }));
  screen.position.set(0, 1.35, -1.62);
  screen.userData.anim = "screenColor";
  spawnEquipment(screen);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), new THREE.MeshStandardMaterial({ color: 0x1a1a24 }));
  stand.position.set(0, 0.95, -1.65);
  spawnEquipment(stand);
}

function addMixer() {
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.28), new THREE.MeshStandardMaterial({ color: 0x1a1420 }));
  base.position.set(-0.55, 0.83, -0.95);
  spawnEquipment(base);
  for (let i = 0; i < 4; i++) {
    const fader = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), new THREE.MeshStandardMaterial({ color: 0x39ff88, emissive: 0x39ff88, emissiveIntensity: 0.7 }));
    fader.position.set(-0.75 + i * 0.13, 0.88, -0.95);
    fader.userData.anim = "blink";
    fader.userData.phase = i * 1.4;
    spawnEquipment(fader);
  }
}

function addGreenScreen() {
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.6), new THREE.MeshStandardMaterial({ color: 0x0e8f4a, roughness: 0.95, emissive: 0x0e8f4a, emissiveIntensity: 0.15 }));
  screen.position.set(0, 1.5, -3.9);
  screen.userData.anim = "shimmer";
  spawnEquipment(screen);
}

function addStudioLights() {
  [-2.6, 2.6].forEach((x, i) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.08), new THREE.MeshStandardMaterial({ color: 0x111018 }));
    box.position.set(x, 2.3, -1.4);
    spawnEquipment(box);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1 }));
    glow.position.set(x, 2.3, -1.35);
    glow.userData.anim = "flicker";
    glow.userData.baseIntensity = 0.85;
    glow.userData.phase = i * 3;
    glow.userData.tapReaction = (obj) => {
      flashObject(obj, 2.5, 0.35);
      tapToast("🔆 Stüdyo ışığı parladı!");
    };
    spawnEquipment(glow);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x2a2040 }));
    stand.position.set(x, 1.2, -1.4);
    spawnEquipment(stand);
  });
}

function addExtraMonitors() {
  for (let i = -1; i <= 1; i++) {
    if (i === 0) continue;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.32), new THREE.MeshStandardMaterial({ color: 0x7b2ff7, emissive: 0xff2d78, emissiveIntensity: 0.5 }));
    screen.position.set(i * 0.75, 1.72, -1.66);
    screen.userData.anim = "screenColor";
    screen.userData.phase = i * 0.3;
    spawnEquipment(screen);
  }
}

function addProductionRig() {
  const truss = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a2040, metalness: 0.6, roughness: 0.3 }));
  truss.position.set(0, 2.7, -1.4);
  spawnEquipment(truss);
}

function addSatelliteDish() {
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.28, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8d8e0, metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide }));
  dish.rotation.x = Math.PI;
  dish.position.set(2.4, 3.3, -3.2);
  dish.userData.float = true;
  dish.userData.baseY = dish.position.y;
  dish.userData.spin = true;
  dish.userData.spinSpeed = 0.004;
  dish.userData.spinBoostUntil = 0;
  dish.userData.tapReaction = (obj) => {
    obj.userData.spinBoostUntil = roomClock + 1.5;
    spawn3DSparkles(obj.position, 12, 0xd8d8e0);
    tapToast("📡 Sinyal güçlendirildi!");
  };
  spawnEquipment(dish);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x555566 }));
  arm.rotation.z = Math.PI / 2.4;
  arm.position.set(2.1, 3.0, -3.2);
  spawnEquipment(arm);
}

function addGlowOrbs() {
  const colors = [0xff2d78, 0x7b2ff7, 0x39ff88];
  for (let i = 0; i < 3; i++) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), new THREE.MeshStandardMaterial({ color: colors[i], emissive: colors[i], emissiveIntensity: 1.2 }));
    orb.position.set(-1.6 + i * 1.6, 2.4, 0.6);
    orb.userData.float = true;
    orb.userData.baseY = orb.position.y;
    orb.userData.tapReaction = (obj) => {
      flashObject(obj, 2.5, 0.3);
      spawn3DSparkles(obj.position, 10, colors[i]);
      tapToast("✨ Parıltı!");
    };
    spawnEquipment(orb);
  }
}

function addCrownCenterpiece() {
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xff8a3d, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.25 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 12, 24), gold);
  ring.position.set(0, 2.55, -0.6);
  ring.userData.spin = true;
  ring.userData.spinSpeed = 0.01;
  ring.userData.spinBoostUntil = 0;
  ring.userData.tapReaction = (obj) => {
    obj.userData.spinBoostUntil = roomClock + 2;
    spawn3DSparkles(obj.position, 20, 0xffd166);
    tapToast("👑 Sen bir imparatorsun!");
  };
  spawnEquipment(ring);
  for (let i = 0; i < 5; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), gold);
    const angle = (i / 5) * Math.PI * 2;
    spike.position.set(Math.cos(angle) * 0.22, 2.68, -0.6 + Math.sin(angle) * 0.22);
    spawnEquipment(spike);
  }
  // Tacın etrafında sürekli parıldayan küçük parıltı noktaları
  const tex = getDotTexture();
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffe9a8, transparent: true, depthWrite: false });
    const spark = new THREE.Sprite(mat);
    spark.scale.set(0.08, 0.08, 1);
    const angle = (i / 6) * Math.PI * 2;
    spark.position.set(Math.cos(angle) * 0.5, 2.6 + Math.sin(i) * 0.15, -0.6 + Math.sin(angle) * 0.5);
    spark.userData.anim = "sparkle";
    spark.userData.phase = i * 1.1;
    roomEquipmentGroup.add(spark);
  }
}

/* ------------------------------ Oda kurulumu ------------------------------ */

function recolorRoomSurfaces(tierIdx) {
  const accentHex = roomAccentHex();
  const t = tierIdx / (STREAMER_TIERS.length - 1);
  const floor = roomScene.getObjectByName("roomFloor");
  const backWall = roomScene.getObjectByName("roomBackWall");
  const sideWall = roomScene.getObjectByName("roomSideWall");
  floor.material.color.set(new THREE.Color(0x1c1436).lerp(new THREE.Color(accentHex), t * 0.22));
  backWall.material.color.set(new THREE.Color(0x150c33).lerp(new THREE.Color(accentHex), t * 0.16));
  sideWall.material.color.copy(backWall.material.color);
}

function updateAvatarForTier(tierIdx) {
  if (roomAvatarTierIdx === tierIdx && roomAvatarSprite) return;
  roomAvatarTierIdx = tierIdx;
  const tier = STREAMER_TIERS[tierIdx];
  if (!roomAvatarSprite) {
    const mat = new THREE.SpriteMaterial({ map: makeEmojiTexture(tier.avatar), transparent: true });
    roomAvatarSprite = new THREE.Sprite(mat);
    roomAvatarSprite.scale.set(1.8, 1.8, 1);
    roomAvatarSprite.position.set(0.05, 1.7, -0.55);
    roomAvatarSprite.userData.tapReaction = (obj) => {
      spawn3DSparkles(obj.position, 16, roomAccentHex());
      tapToast(`${STREAMER_TIERS[roomAvatarTierIdx].avatar} Selam! Yayına devam!`);
    };
    roomScene.add(roomAvatarSprite);
  } else {
    roomAvatarSprite.material.map.dispose();
    roomAvatarSprite.material.map = makeEmojiTexture(tier.avatar);
    roomAvatarSprite.material.needsUpdate = true;
  }
}

const ROOM_TIER_BUILDERS = [
  () => addDesk(),
  () => addRingLight(),
  () => { addCameraProp(); addMic(); },
  () => { addMonitor(); addMixer(); },
  () => { addGreenScreen(); addStudioLights(); },
  () => { addExtraMonitors(); addProductionRig(); },
  () => addSatelliteDish(),
  () => addGlowOrbs(),
  () => addCrownCenterpiece(),
];

function clearRoomEquipment() {
  while (roomEquipmentGroup.children.length) {
    const obj = roomEquipmentGroup.children.pop();
    if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
    if (obj.material && obj.material.dispose) obj.material.dispose();
  }
}

function buildRoomForTier(tierIdx) {
  if (!roomInited) return;
  recolorRoomSurfaces(tierIdx);
  updateAvatarForTier(tierIdx);

  if (tierIdx === roomBuiltForTier) return;

  if (tierIdx < roomBuiltForTier || roomBuiltForTier === -1) {
    // İlk kurulum ya da (nadiren) daha düşük bir seviye yüklendi: sıfırdan kur.
    clearRoomEquipment();
    roomBuiltForTier = -1;
  }
  // Eksik seviyeleri kümülatif olarak ekle — sadece YENİ eklenen parçalar
  // "sekerek" büyüyen giriş animasyonunu oynatır, mevcut ekipman yerinde kalır.
  for (let i = roomBuiltForTier + 1; i <= tierIdx; i++) {
    ROOM_TIER_BUILDERS[i]();
  }
  roomBuiltForTier = tierIdx;
}

/* ------------------------------ Sekme ile entegrasyon ------------------------------ */

// app.js -> renderStreamerProfile() tarafından, seviye her hesaplandığında
// çağrılır (oda sekmesi kapalıyken de çağrılabilir; initRoomIfNeeded o an
// sekme görünür değilse sessizce hiçbir şey yapmaz — bir sonraki açılışta
// güncel seviyeyle kurulur).
function syncRoomToState() {
  if (!roomInited) return;
  const tierIdx = currentStreamerTierIndex();
  buildRoomForTier(tierIdx);
  const titleEl = document.getElementById("roomTierTitle");
  const descEl = document.getElementById("roomTierDesc");
  if (titleEl) titleEl.textContent = `${STREAMER_TIERS[tierIdx].avatar} ${STREAMER_TIERS[tierIdx].title}`;
  if (descEl) descEl.textContent = STREAMER_TIERS[tierIdx].desc;
}

function toggleRoomAutoRotate() {
  roomAutoRotate = !roomAutoRotate;
  const btn = document.getElementById("roomAutoRotateBtn");
  if (btn) btn.classList.toggle("active", roomAutoRotate);
  return roomAutoRotate;
}

// index.html'deki switchTab() bu iki fonksiyonu "room" sekmesine
// girilip çıkılırken çağırır.
function onRoomTabShown() {
  initRoomIfNeeded();
  syncRoomToState();
  resizeRoomRenderer();
  // Sinematik giriş: kamerayı geniş/yüksek bir başlangıç noktasından başlat,
  // render döngüsü onu birkaç kare içinde normal konuma yumuşakça çeker.
  if (roomCamPos) {
    roomCamPos.set(Math.sin(roomYaw) * 12.5, 7.2, Math.cos(roomYaw) * 12.5);
  }
  startRoomLoop();
}

function onRoomTabHidden() {
  stopRoomLoop();
}
