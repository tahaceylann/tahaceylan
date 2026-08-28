/* ==========================================================================
   Fenomen Ol! – Yayıncının Odası (3D)
   Three.js ile çizilen, oyuncunun ilerlemesine göre kademeli olarak
   gelişen bir 3D stüdyo odası. app.js'teki global `state`, `STREAMER_TIERS`
   ve `currentStreamerTierIndex()` üzerinden beslenir; kendi başına bir
   modül değildir, app.js ile aynı global kapsamı paylaşır.
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
let roomBuiltForSkin = null;
let roomDragState = null;
let roomYaw = 0.5;
let roomPitch = -0.18;
let roomClock = 0;

function initRoomIfNeeded() {
  if (roomInited) return;
  const container = document.getElementById("roomCanvasWrap");
  if (!container || typeof THREE === "undefined") return;
  roomInited = true;

  roomScene = new THREE.Scene();
  roomScene.background = new THREE.Color(0x0a0718);
  roomScene.fog = new THREE.Fog(0x0a0718, 9, 22);

  roomCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

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

  container.style.touchAction = "none";
  container.addEventListener("pointerdown", e => {
    roomDragState = { x: e.clientX, y: e.clientY, yaw: roomYaw, pitch: roomPitch };
  });
  window.addEventListener("pointermove", e => {
    if (!roomDragState) return;
    const dx = e.clientX - roomDragState.x;
    const dy = e.clientY - roomDragState.y;
    roomYaw = roomDragState.yaw - dx * 0.008;
    roomPitch = Math.max(-0.45, Math.min(0.25, roomDragState.pitch - dy * 0.006));
  });
  window.addEventListener("pointerup", () => { roomDragState = null; });
  window.addEventListener("resize", resizeRoomRenderer);
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

function roomAnimate() {
  if (!roomAnimating) return;
  requestAnimationFrame(roomAnimate);
  roomClock += 0.016;

  const radius = 7.2;
  roomCamera.position.x = Math.sin(roomYaw) * radius * Math.cos(roomPitch);
  roomCamera.position.z = Math.cos(roomYaw) * radius * Math.cos(roomPitch);
  roomCamera.position.y = 2.4 + Math.sin(roomPitch) * radius * 0.6 + 1.2;
  roomCamera.lookAt(0, 1.5, -1);

  if (roomAvatarSprite) {
    roomAvatarSprite.position.y = 1.7 + Math.sin(roomClock * 1.3) * 0.05;
  }
  roomEquipmentGroup.children.forEach((obj, i) => {
    if (obj.userData.float) {
      obj.position.y = obj.userData.baseY + Math.sin(roomClock * (1.1 + i * 0.07) + i) * 0.05;
    }
    if (obj.userData.spin) {
      obj.rotation.y += obj.userData.spinSpeed;
    }
  });

  const rimLight = roomScene.getObjectByName("roomRimLight");
  if (rimLight) rimLight.color.setHex(roomAccentHex());

  roomRenderer.render(roomScene, roomCamera);
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

function clearRoomEquipment() {
  while (roomEquipmentGroup.children.length) {
    const obj = roomEquipmentGroup.children.pop();
    if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
    if (obj.material && obj.material.dispose) obj.material.dispose();
  }
}

/* ------------------------------ Ekipman parçaları ------------------------------ */

function addDesk() {
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x3a2a5c, roughness: 0.6 });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1), deskMat);
  desk.position.set(0, 0.75, -1.2);
  roomEquipmentGroup.add(desk);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x241a3d });
  [[-1.1, -0.45], [1.1, -0.45], [-1.1, 0.45], [1.1, 0.45]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), legMat);
    leg.position.set(x, 0.375, -1.2 + z);
    roomEquipmentGroup.add(leg);
  });
}

function addRingLight() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe9a8, emissiveIntensity: 0.9 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 12, 32), mat);
  ring.position.set(-1.3, 1.75, -1.7);
  roomEquipmentGroup.add(ring);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x2a2040 }));
  stand.position.set(-1.3, 1.1, -1.7);
  roomEquipmentGroup.add(stand);
}

function addCameraProp() {
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.4), new THREE.MeshStandardMaterial({ color: 0x111018, roughness: 0.4, metalness: 0.3 }));
  body.position.set(1.0, 1.15, -1.4);
  roomEquipmentGroup.add(body);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.25, 16), new THREE.MeshStandardMaterial({ color: 0x050508 }));
  lens.rotation.z = Math.PI / 2;
  lens.position.set(1.0, 1.15, -1.15);
  roomEquipmentGroup.add(lens);
  const tripod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8), new THREE.MeshStandardMaterial({ color: 0x2a2040 }));
  tripod.position.set(1.0, 0.6, -1.4);
  roomEquipmentGroup.add(tripod);
}

function addMic() {
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x2a2040 }));
  arm.rotation.z = Math.PI / 3.2;
  arm.position.set(0.15, 1.15, -1.15);
  roomEquipmentGroup.add(arm);
  const mic = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), new THREE.MeshStandardMaterial({ color: 0x0d0d12, metalness: 0.5, roughness: 0.3 }));
  mic.position.set(0.34, 1.36, -1.03);
  roomEquipmentGroup.add(mic);
}

function addMonitor() {
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.05), new THREE.MeshStandardMaterial({ color: 0x0d0d14 }));
  frame.position.set(0, 1.35, -1.65);
  roomEquipmentGroup.add(frame);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.45), new THREE.MeshStandardMaterial({ color: 0xff2d78, emissive: 0x7b2ff7, emissiveIntensity: 0.6 }));
  screen.position.set(0, 1.35, -1.62);
  roomEquipmentGroup.add(screen);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), new THREE.MeshStandardMaterial({ color: 0x1a1a24 }));
  stand.position.set(0, 0.95, -1.65);
  roomEquipmentGroup.add(stand);
}

function addMixer() {
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.28), new THREE.MeshStandardMaterial({ color: 0x1a1420 }));
  base.position.set(-0.55, 0.83, -0.95);
  roomEquipmentGroup.add(base);
  for (let i = 0; i < 4; i++) {
    const fader = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), new THREE.MeshStandardMaterial({ color: 0x39ff88, emissive: 0x39ff88, emissiveIntensity: 0.7 }));
    fader.position.set(-0.75 + i * 0.13, 0.88, -0.95);
    roomEquipmentGroup.add(fader);
  }
}

function addGreenScreen() {
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.6), new THREE.MeshStandardMaterial({ color: 0x0e8f4a, roughness: 0.95 }));
  screen.position.set(0, 1.5, -3.9);
  roomEquipmentGroup.add(screen);
}

function addStudioLights() {
  [-2.6, 2.6].forEach(x => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.08), new THREE.MeshStandardMaterial({ color: 0x111018 }));
    box.position.set(x, 2.3, -1.4);
    roomEquipmentGroup.add(box);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1 }));
    glow.position.set(x, 2.3, -1.35);
    roomEquipmentGroup.add(glow);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x2a2040 }));
    stand.position.set(x, 1.2, -1.4);
    roomEquipmentGroup.add(stand);
  });
}

function addExtraMonitors() {
  for (let i = -1; i <= 1; i++) {
    if (i === 0) continue;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.32), new THREE.MeshStandardMaterial({ color: 0x7b2ff7, emissive: 0xff2d78, emissiveIntensity: 0.5 }));
    screen.position.set(i * 0.75, 1.72, -1.66);
    roomEquipmentGroup.add(screen);
  }
}

function addProductionRig() {
  const truss = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a2040, metalness: 0.6, roughness: 0.3 }));
  truss.position.set(0, 2.7, -1.4);
  roomEquipmentGroup.add(truss);
}

function addSatelliteDish() {
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.28, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8d8e0, metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide }));
  dish.rotation.x = Math.PI;
  dish.position.set(2.4, 3.3, -3.2);
  dish.userData.float = true;
  dish.userData.baseY = dish.position.y;
  roomEquipmentGroup.add(dish);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x555566 }));
  arm.rotation.z = Math.PI / 2.4;
  arm.position.set(2.1, 3.0, -3.2);
  roomEquipmentGroup.add(arm);
}

function addGlowOrbs() {
  const colors = [0xff2d78, 0x7b2ff7, 0x39ff88];
  for (let i = 0; i < 3; i++) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), new THREE.MeshStandardMaterial({ color: colors[i], emissive: colors[i], emissiveIntensity: 1.2 }));
    orb.position.set(-1.6 + i * 1.6, 2.4, 0.6);
    orb.userData.float = true;
    orb.userData.baseY = orb.position.y;
    roomEquipmentGroup.add(orb);
  }
}

function addCrownCenterpiece() {
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xff8a3d, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.25 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 12, 24), gold);
  ring.position.set(0, 2.55, -0.6);
  ring.userData.spin = true;
  ring.userData.spinSpeed = 0.01;
  roomEquipmentGroup.add(ring);
  for (let i = 0; i < 5; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), gold);
    const angle = (i / 5) * Math.PI * 2;
    spike.position.set(Math.cos(angle) * 0.22, 2.68, -0.6 + Math.sin(angle) * 0.22);
    roomEquipmentGroup.add(spike);
  }
}

/* ------------------------------ Oda kurulumu ------------------------------ */

function buildRoomForTier(tierIdx) {
  if (!roomInited) return;
  const skin = state.activeSkin;
  if (roomBuiltForTier === tierIdx && roomBuiltForSkin === skin) return;
  roomBuiltForTier = tierIdx;
  roomBuiltForSkin = skin;

  clearRoomEquipment();

  const tier = STREAMER_TIERS[tierIdx];
  const accentHex = roomAccentHex();
  const t = tierIdx / (STREAMER_TIERS.length - 1);

  const floor = roomScene.getObjectByName("roomFloor");
  const backWall = roomScene.getObjectByName("roomBackWall");
  const sideWall = roomScene.getObjectByName("roomSideWall");
  floor.material.color.set(new THREE.Color(0x1c1436).lerp(new THREE.Color(accentHex), t * 0.22));
  backWall.material.color.set(new THREE.Color(0x150c33).lerp(new THREE.Color(accentHex), t * 0.16));
  sideWall.material.color.copy(backWall.material.color);

  if (!roomAvatarSprite) {
    const mat = new THREE.SpriteMaterial({ map: makeEmojiTexture(tier.avatar), transparent: true });
    roomAvatarSprite = new THREE.Sprite(mat);
    roomAvatarSprite.scale.set(1.8, 1.8, 1);
    roomAvatarSprite.position.set(0.05, 1.7, -0.55);
    roomScene.add(roomAvatarSprite);
  } else {
    roomAvatarSprite.material.map.dispose();
    roomAvatarSprite.material.map = makeEmojiTexture(tier.avatar);
    roomAvatarSprite.material.needsUpdate = true;
  }

  addDesk();
  if (tierIdx >= 1) addRingLight();
  if (tierIdx >= 2) { addCameraProp(); addMic(); }
  if (tierIdx >= 3) { addMonitor(); addMixer(); }
  if (tierIdx >= 4) { addGreenScreen(); addStudioLights(); }
  if (tierIdx >= 5) { addExtraMonitors(); addProductionRig(); }
  if (tierIdx >= 6) { addSatelliteDish(); }
  if (tierIdx >= 7) { addGlowOrbs(); }
  if (tierIdx >= 8) { addCrownCenterpiece(); }
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

// index.html'deki switchTab() bu iki fonksiyonu "room" sekmesine
// girilip çıkılırken çağırır.
function onRoomTabShown() {
  initRoomIfNeeded();
  syncRoomToState();
  resizeRoomRenderer();
  startRoomLoop();
}

function onRoomTabHidden() {
  stopRoomLoop();
}
