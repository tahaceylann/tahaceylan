"use strict";
// Eşleşme — tarayıcıda çalışan tanışma uygulaması (demo; veriler yalnızca bu cihazda tutulur)
const AYAR_KEY = "eslesme_ayar_v1";
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const bugun = () => new Date().toISOString().slice(0, 10);
const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const byId = id => PROFILLER.find(p => p.id === id);
const GUNLUK_SUPER = 3;

let TOKEN = null; try { TOKEN = localStorage.getItem("eslesme_token"); } catch { /* depolama kapalı */ }
let S = varsayilan();
let tab = "kesfet";
let undoStack = [];
let acikSohbetId = null, sohbetYenile = null;
const ONLINE = {};

function ayarYukle() {
  const v = { koyu: false, minYas: 18, maxYas: 45, ayniSehir: false, hedef: "" };
  try { return Object.assign(v, JSON.parse(localStorage.getItem(AYAR_KEY))); } catch { return v; }
}
function varsayilan() {
  return { me: null, act: {}, matches: [], chats: {}, likedMe: [], blocked: [], supers: { d: bugun(), n: 0 }, ayar: ayarYukle() };
}
function save() { try { localStorage.setItem(AYAR_KEY, JSON.stringify(S.ayar)); } catch { /* depolama kapalı */ } }
function toast(t) { const e = $("#toast"); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, 2200); }

/* ---------- Sunucu bağlantısı ---------- */
async function api(method, yol, body) {
  const r = await fetch("/api" + yol, { method, headers: { "content-type": "application/json", ...(TOKEN ? { authorization: "Bearer " + TOKEN } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch { /* boş yanıt */ }
  if (r.status === 401 && TOKEN && !yol.startsWith("/giris")) { oturumuBitir(); throw new Error("Oturum süresi doldu."); }
  if (!r.ok) throw new Error(j.hata || "Bir hata oluştu.");
  return j;
}
function uygula(d) {
  PROFILLER.length = 0; PROFILLER.push(...d.profiller);
  for (const p of d.profiller) if (!p.bot) ONLINE[p.id] = p.cevrimici;
  S.me = d.me; S.act = d.act; S.matches = d.matches; S.likedMe = d.likedMe; S.blocked = d.blocked; S.chats = d.chats; S.supers = d.supers;
}
function oturumuBitir() {
  TOKEN = null; try { localStorage.removeItem("eslesme_token"); } catch { /* yok say */ }
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  PROFILLER.length = 0; S = varsayilan(); undoStack = []; acikSohbetId = null; kapat(); render();
}
let ws = null, ilkBaglanti = true;
function baglan() {
  if (ws) { ws.onclose = null; ws.close(); }
  ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
  ws.onopen = () => ws.send(JSON.stringify({ t: "auth", token: TOKEN }));
  ws.onmessage = e => { try { olay(JSON.parse(e.data)); } catch { /* bozuk mesaj */ } };
  ws.onclose = () => { if (TOKEN) setTimeout(baglan, 3000); };
}
async function yenidenYukle() { try { uygula(await api("GET", "/durum")); if ($("#overlay").hidden) render(); } catch { /* sonra denenir */ } }
function profilEkle(p) { if (p && !byId(p.id)) PROFILLER.push(p); }
function olay(e) {
  if (e.t === "hazir") { if (!ilkBaglanti) yenidenYukle(); ilkBaglanti = false; return; }
  if (e.t === "presence") { ONLINE[e.id] = e.online; if (acikSohbetId === e.id) { const d = $("#cDurum"); if (d) d.textContent = e.online ? "🟢 Çevrimiçi" : "Çevrimdışı"; } return; }
  if (e.t === "typing") {
    if (acikSohbetId !== e.from || !$("#msgs")) return;
    let t = $("#typing"); if (!t) { t = document.createElement("div"); t.id = "typing"; t.className = "typing"; t.textContent = `${byId(e.from)?.ad || ""} yazıyor...`; $("#msgs").appendChild(t); $("#msgs").scrollTop = 1e9; }
    clearTimeout(olay.tt); olay.tt = setTimeout(() => $("#typing")?.remove(), 3500); return;
  }
  if (e.t === "msg") {
    $("#typing")?.remove();
    const c = S.chats[e.from] ||= { m: [], okunmadi: 0 }; c.m.push({ k: "on", x: e.x, t: e.ts });
    if (acikSohbetId === e.from) { api("POST", "/okundu", { id: e.from }).catch(() => {}); sohbetYenile?.(); }
    else { c.okunmadi = (c.okunmadi || 0) + 1; toast(`💬 ${byId(e.from)?.ad || "Yeni mesaj"}: ${e.x.slice(0, 40)}`); rozetler(); if (tab === "mesajlar" && $("#overlay").hidden) mesajlar(); }
    return;
  }
  if (e.t === "like") { profilEkle(e.profil); if (!S.likedMe.includes(e.profil.id)) S.likedMe.push(e.profil.id); toast("💗 Biri seni beğendi!"); rozetler(); if (tab === "begenenler" && $("#overlay").hidden) begenenler(); return; }
  if (e.t === "match") {
    profilEkle(e.profil); if (!S.matches.includes(e.id)) S.matches.push(e.id); S.chats[e.id] ||= { m: [], okunmadi: 0 };
    S.likedMe = S.likedMe.filter(x => x !== e.id); render();
    if ($("#overlay").hidden) eslesmeEkrani(byId(e.id)); else toast(`🎉 ${e.profil.ad} ile eşleştin!`);
  }
}

/* ---------- Uyum hesaplama ---------- */
function burcUyumu(a, b) {
  const ea = BURC_ELEMENT[a], eb = BURC_ELEMENT[b];
  const k = [ea, eb].sort().join("-");
  const tablo = { "ates-ates": 82, "toprak-toprak": 84, "hava-hava": 80, "su-su": 86, "ates-hava": 90, "su-toprak": 88, "ates-su": 55, "ates-toprak": 58, "hava-toprak": 60, "hava-su": 62 };
  const eaK = [ea, eb].sort().join("-");
  const puan = tablo[eaK] ?? 60;
  const yorum = BURC_YORUM[`${ea}-${eb}`] || BURC_YORUM[`${eb}-${ea}`] || "";
  return { puan: puan + (a === b ? 2 : 0), yorum, k };
}
function uyum(p) {
  const me = S.me; if (!me) return { toplam: 0, burc: 0, ilgi: 0, hedef: 0, ortak: [], yorum: "" };
  const ortak = p.ilgi.filter(i => me.ilgi.includes(i));
  const ilgi = Math.min(100, Math.round((ortak.length / Math.max(3, Math.min(p.ilgi.length, me.ilgi.length))) * 100));
  const b = burcUyumu(me.burc, p.burc);
  const hedef = me.hedef === p.hedef ? 100 : (me.hedef.includes("emin") || p.hedef.includes("emin") ? 65 : (me.hedef === "Sohbet / arkadaşlık" || p.hedef === "Sohbet / arkadaşlık" ? 30 : 75));
  const sehir = me.sehir === p.sehir ? 100 : 40;
  const toplam = Math.round(b.puan * .25 + ilgi * .4 + hedef * .25 + sehir * .1);
  return { toplam: Math.max(35, Math.min(99, toplam)), burc: b.puan, ilgi, hedef, sehir, ortak, yorum: b.yorum };
}

/* ---------- Aday listesi ---------- */
function ilgilenir(me, p) { return me.ilgi_cins === "herkes" || me.ilgi_cins === p.cins; }
function aday() {
  const f = S.ayar, me = S.me;
  return PROFILLER.filter(p => !S.act[p.id] && !S.blocked.includes(p.id) && ilgilenir(me, p) && p.yas >= f.minYas && p.yas <= f.maxYas
    && (!f.ayniSehir || p.sehir === me.sehir) && (!f.hedef || p.hedef === f.hedef))
    .sort((a, b) => uyum(b).toplam - uyum(a).toplam);
}
function gununEslesmesi() {
  const l = PROFILLER.filter(p => ilgilenir(S.me, p) && !S.blocked.includes(p.id) && !S.matches.includes(p.id));
  if (!l.length) return null;
  const top = l.sort((a, b) => uyum(b).toplam - uyum(a).toplam).slice(0, 5);
  return top[hash(bugun() + S.me.ad) % top.length];
}

/* ---------- Görünüm yardımcıları ---------- */
function avatar(p, cls, ekstra = "") {
  const bg = p.foto ? `background-image:url(${p.foto})` : `background:linear-gradient(135deg,hsl(${p.renk} 75% 62%),hsl(${(p.renk + 40) % 360} 80% 52%))`;
  return `<div class="av ${cls}" style="${bg};${ekstra}">${p.foto ? "" : esc(p.emoji)}</div>`;
}
function acik(html) { const o = $("#overlay"); o.innerHTML = html; o.hidden = false; return o; }
function kapat() { const o = $("#overlay"); o.hidden = true; o.innerHTML = ""; }
function cevrimici(p) { return p.bot ? hash(p.id + bugun()) % 3 === 0 : !!ONLINE[p.id]; }

/* ---------- Ana çizim ---------- */
function render() {
  document.documentElement.dataset.tema = S.ayar.koyu ? "koyu" : "";
  const tabs = $("#tabs");
  if (!TOKEN) { tabs.hidden = true; $("#topRight").innerHTML = ""; return girisEkrani(); }
  if (!S.me) { tabs.hidden = true; $("#topRight").innerHTML = ""; return onboarding(); }
  tabs.hidden = false;
  tabs.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  rozetler();
  ({ kesfet, begenenler, mesajlar, profil })[tab]();
}
function rozetler() {
  const lk = S.likedMe.filter(id => !S.act[id] && !S.blocked.includes(id)).length;
  const un = Object.values(S.chats).reduce((a, c) => a + (c.okunmadi || 0), 0);
  const set = (id, n) => { const e = $(id); e.hidden = !n; e.textContent = n; };
  set("#bLikes", lk); set("#bMsgs", un);
  const k = Math.max(0, GUNLUK_SUPER - (S.supers.d === bugun() ? S.supers.n : 0));
  $("#topRight").innerHTML = `<span class="mut">⭐ ${k} süper beğeni</span>`;
}
$("#tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { tab = b.dataset.tab; render(); } });

/* ---------- Giriş / kayıt ---------- */
function girisEkrani(kayit = false) {
  $("#view").innerHTML = `<div class="hero-wel"><div class="big">💘</div><h2>${kayit ? "Hesap oluştur" : "Giriş yap"}</h2></div>
  <div class="card"><label class="f">E-posta</label><input id="aMail" type="email" autocomplete="email" placeholder="ornek@mail.com">
  <label class="f">Şifre ${kayit ? "(en az 8 karakter)" : ""}</label><input id="aSifre" type="password" autocomplete="${kayit ? "new-password" : "current-password"}">
  ${kayit ? '<label class="row" style="margin-top:12px;font-size:14px"><input id="aOnay" type="checkbox" style="width:auto"> 18 yaşından büyüğüm.</label><p class="mut" style="font-size:13px">Kişisel verilerinizin nasıl işlendiğini <a href="/yasal/aydinlatma.html" target="_blank" rel="noopener">KVKK Aydınlatma Metni</a>\'nde okuyabilirsiniz (onay gerektirmez).</p>' : '<p class="mut" style="font-size:13px"><a href="/yasal/aydinlatma.html" target="_blank" rel="noopener">KVKK Aydınlatma Metni</a></p>'}
  <p class="mut" id="aHata" style="color:#d92d2d"></p>
  <button class="btn block" id="aGonder">${kayit ? "Kayıt ol" : "Giriş yap"}</button>
  <button class="btn sec block" id="aGecis" style="margin-top:8px">${kayit ? "Zaten hesabım var" : "Yeni hesap oluştur"}</button></div>`;
  const gonder = async () => {
    const hata = $("#aHata"), btn = $("#aGonder"); hata.textContent = ""; btn.disabled = true;
    try {
      const r = await api("POST", kayit ? "/kayit" : "/giris", { email: $("#aMail").value, sifre: $("#aSifre").value, onay: kayit ? $("#aOnay").checked : undefined });
      TOKEN = r.token; try { localStorage.setItem("eslesme_token", TOKEN); } catch { /* yok say */ }
      await boot();
    } catch (e) { hata.textContent = e.message; btn.disabled = false; }
  };
  $("#aGonder").onclick = gonder; $("#aSifre").onkeydown = e => { if (e.key === "Enter") gonder(); };
  $("#aGecis").onclick = () => girisEkrani(!kayit);
}
async function boot() {
  if (!TOKEN) return render();
  try { uygula(await api("GET", "/durum")); ilkBaglanti = true; baglan(); render(); }
  catch (e) { if (!TOKEN) return; $("#view").innerHTML = `<div class="empty"><div class="e">📡</div><p>Sunucuya ulaşılamadı.</p><button class="btn" id="tekrar">Tekrar dene</button></div>`; $("#tekrar").onclick = boot; }
}

/* ---------- Kayıt / profil formu ---------- */
function onboarding(duzenle) {
  const m = duzenle ? S.me : { ad: "", dogum: "", cins: "kadin", ilgi_cins: "erkek", sehir: "İstanbul", meslek: "", boy: 170, hedef: HEDEFLER[0], sigara: "İçmiyor", alkol: "İçmiyor", hakkinda: "", ilgi: [], emoji: "😊", renk: 340, foto: "" };
  const emojiler = ["😊","😎","🦊","🌸","🎧","☕","🌙","🔥","🐱","🎸","🌊","✨"];
  const v = $("#view");
  v.innerHTML = `
  <div class="hero-wel"><div class="big">💘</div><h2>${duzenle ? "Profilini düzenle" : "Hoş geldin!"}</h2>
  <p class="mut">${duzenle ? "" : "Birkaç bilgi ver, sana uygun insanları gösterelim."}</p></div>
  <div class="card">
  <label class="f">Adın</label><input id="fAd" maxlength="20" value="${esc(m.ad)}" placeholder="Adın">
  <label class="f">Doğum tarihin (18 yaş ve üstü)</label><input id="fDogum" type="date" value="${esc(m.dogum)}">
  <div class="row"><div class="grow"><label class="f">Cinsiyetin</label><select id="fCins"><option value="kadin">Kadın</option><option value="erkek">Erkek</option></select></div>
  <div class="grow"><label class="f">İlgilendiğin</label><select id="fIlgiCins"><option value="kadin">Kadınlar</option><option value="erkek">Erkekler</option><option value="herkes">Herkes</option></select></div></div>
  <label class="f">Şehir</label><select id="fSehir">${ILLER.map(i => `<option>${i}</option>`).join("")}</select>
  <label class="f">Meslek</label><input id="fMeslek" maxlength="30" value="${esc(m.meslek)}" placeholder="Örn. Mühendis, öğrenci">
  <div class="row"><div class="grow"><label class="f">Boy (cm)</label><input id="fBoy" type="number" min="120" max="230" value="${m.boy}"></div>
  <div class="grow"><label class="f">Ne arıyorsun?</label><select id="fHedef">${HEDEFLER.map(i => `<option>${i}</option>`).join("")}</select></div></div>
  <div class="row"><div class="grow"><label class="f">Sigara</label><select id="fSigara"><option>İçmiyor</option><option>Ara sıra</option><option>İçiyor</option></select></div>
  <div class="grow"><label class="f">Alkol</label><select id="fAlkol"><option>İçmiyor</option><option>Nadiren</option><option>Sosyal</option></select></div></div>
  <label class="f">Hakkında</label><textarea id="fHak" maxlength="300" placeholder="Kendini kısaca anlat...">${esc(m.hakkinda)}</textarea>
  <label class="f">İlgi alanların (en az 3)</label><div class="chips" id="fIlgi">${ILGILER.map(i => `<span class="chip ${m.ilgi.includes(i) ? "on" : ""}" data-i="${esc(i)}">${esc(i)}</span>`).join("")}</div>
  <label class="f">Profil görselin</label>
  <div class="row"><div id="fPrev" style="width:80px">${avatar(m, "s")}</div><input id="fFoto" type="file" accept="image/*"></div>
  <div class="chips" style="margin-top:8px" id="fEmoji">${emojiler.map(e => `<span class="chip ${m.emoji === e ? "on" : ""}" data-e="${e}">${e}</span>`).join("")}</div>
  ${duzenle ? "" : `<label class="row" style="margin-top:14px;font-size:14px;align-items:flex-start"><input id="fRiza" type="checkbox" style="width:auto;margin-top:4px"><span><a href="/yasal/acik-riza.html" target="_blank" rel="noopener">Açık Rıza Metni</a>'ni okudum; cinsiyetim ve ilgilendiğim cinsiyet tercihimden anlaşılabilen <b>cinsel yönelim</b> bilgimin (özel nitelikli kişisel veri), yalnızca eşleştirme amacıyla işlenmesine açık rıza veriyorum. Rızamı istediğim zaman geri çekebileceğimi biliyorum.</span></label>`}
  <p class="mut" id="fHata" style="color:#d92d2d"></p>
  <button class="btn block" id="fKaydet">${duzenle ? "Kaydet" : "Başla 🚀"}</button>
  ${duzenle ? '<button class="btn sec block" id="fIptal" style="margin-top:8px">Vazgeç</button>' : ""}
  </div>
  <p class="mut" style="text-align:center">Bu bir demo uygulamadır; veriler sadece bu cihazda saklanır, profiller örnektir.</p>`;
  $("#fCins").value = m.cins; $("#fIlgiCins").value = m.ilgi_cins; $("#fSehir").value = m.sehir; $("#fHedef").value = m.hedef; $("#fSigara").value = m.sigara; $("#fAlkol").value = m.alkol;
  let foto = m.foto, emoji = m.emoji;
  $("#fIlgi").onclick = e => { const c = e.target.closest(".chip"); if (c) c.classList.toggle("on"); };
  $("#fEmoji").onclick = e => { const c = e.target.closest(".chip"); if (!c) return; emoji = c.dataset.e; foto = ""; $("#fEmoji").querySelectorAll(".chip").forEach(x => x.classList.toggle("on", x === c)); $("#fPrev").innerHTML = avatar({ emoji, renk: m.renk }, "s"); };
  $("#fFoto").onchange = e => küçült(e.target.files[0], d => { foto = d; $("#fPrev").innerHTML = avatar({ foto }, "s"); });
  if ($("#fIptal")) $("#fIptal").onclick = render;
  $("#fKaydet").onclick = async () => {
    const ad = $("#fAd").value.trim(), dg = $("#fDogum").value, hata = $("#fHata");
    const ilgi = [...$("#fIlgi").querySelectorAll(".chip.on")].map(c => c.dataset.i);
    if (!ad) return hata.textContent = "Lütfen adını yaz.";
    if (!dg) return hata.textContent = "Doğum tarihini seç.";
    if (ilgi.length < 3) return hata.textContent = "En az 3 ilgi alanı seç.";
    const ilk = !S.me, btn = $("#fKaydet");
    if (ilk && !$("#fRiza").checked) return hata.textContent = "Eşleştirme bu bilgiye dayandığı için devam etmek üzere açık rıza kutusunu işaretlemelisin.";
    btn.disabled = true; hata.textContent = "";
    try {
      uygula(await api("PUT", "/ben", { ad, dogum: dg, cins: $("#fCins").value, ilgi_cins: $("#fIlgiCins").value, sehir: $("#fSehir").value, meslek: $("#fMeslek").value.trim(), boy: +$("#fBoy").value, hedef: $("#fHedef").value, sigara: $("#fSigara").value, alkol: $("#fAlkol").value, hakkinda: $("#fHak").value.trim(), ilgi, emoji, foto, renk: m.renk ?? 340, riza: ilk ? true : undefined }));
      tab = "kesfet"; render(); toast(ilk ? `Hoş geldin ${ad}! 🎉` : "Profil güncellendi");
    } catch (e) { hata.textContent = e.message; btn.disabled = false; }
  };
}
function küçült(file, cb) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => { const im = new Image(); im.onload = () => {
    const c = document.createElement("canvas"), s = Math.min(1, 480 / Math.max(im.width, im.height));
    c.width = im.width * s; c.height = im.height * s; c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); cb(c.toDataURL("image/jpeg", .8)); };
    im.src = r.result; };
  r.readAsDataURL(file);
}

/* ---------- Keşfet ---------- */
function kesfet() {
  const liste = aday(), gun = gununEslesmesi();
  const v = $("#view");
  const gunHtml = gun && !S.act[gun.id] ? `<div class="gun" id="gun">${avatar(gun, "s")}<div class="grow"><b>🌟 Günün eşleşmesi</b><div class="mut" style="color:inherit;opacity:.8">${esc(gun.ad)}, ${gun.yas} · %${uyum(gun).toplam} uyum</div></div><span>›</span></div>` : "";
  if (!liste.length) {
    v.innerHTML = gunHtml + `<div class="empty"><div class="e">🔍</div><h2>Şimdilik bu kadar!</h2><p>Yeni insanlar için filtreleri genişletebilir veya daha sonra tekrar bakabilirsin.</p><button class="btn" id="filtre">Filtreleri aç</button></div>`;
    $("#filtre")?.addEventListener("click", filtrePenceresi); $("#gun")?.addEventListener("click", () => detay(gun.id)); return;
  }
  v.innerHTML = gunHtml + `<div id="deck"></div>
  <div class="acts"><button id="bGeri" title="Geri al">↩️</button><button id="bGec" title="Geç">✖️</button><button class="big" id="bSuper" title="Süper beğeni">⭐</button><button class="big" id="bBegen" title="Beğen">💚</button><button id="bFiltre" title="Filtre">⚙️</button></div>`;
  const deck = $("#deck");
  liste.slice(0, 3).reverse().forEach((p, i, a) => {
    const el = document.createElement("div"); el.className = "sw"; el.dataset.id = p.id;
    const u = uyum(p), derinlik = a.length - 1 - i;
    el.style.transform = `scale(${1 - derinlik * .04}) translateY(${derinlik * 10}px)`;
    el.innerHTML = `${avatar(p, "xl")}<span class="uyum">%${u.toplam} uyum</span>${cevrimici(p) ? '<span class="online"><i></i>Çevrimiçi</span>' : ""}
      <span class="stamp l">BEĞEN</span><span class="stamp p">GEÇ</span><span class="stamp s">SÜPER</span>
      <div class="info"><h3>${esc(p.ad)}, ${p.yas} ${p.dogrulanmis ? '<span class="ver" title="Doğrulanmış">✔</span>' : ""}</h3>
      <p>📍 ${esc(p.sehir)} · 💼 ${esc(p.meslek)}</p><p>${BURC_SIMGE[p.burc]} ${esc(p.burc)} · ${esc(p.hedef)}</p>
      <div>${p.ilgi.slice(0, 4).map(i => `<span class="pill">${esc(i)}</span>`).join("")}</div></div>`;
    deck.appendChild(el);
  });
  const ust = () => deck.lastElementChild;
  sürükle(ust());
  $("#bGec").onclick = () => uç("pass"); $("#bBegen").onclick = () => uç("like"); $("#bSuper").onclick = () => uç("super");
  $("#bGeri").onclick = geriAl; $("#bFiltre").onclick = filtrePenceresi; $("#gun")?.addEventListener("click", () => detay(gun.id));
  function uç(tip) {
    const el = ust(); if (!el) return;
    if (tip === "super" && !superHakki()) return toast("Bugünkü süper beğeni hakkın bitti ⭐");
    el.classList.remove("drag"); el.style.transform = `translate(${tip === "pass" ? -600 : tip === "like" ? 600 : 0}px,${tip === "super" ? -700 : 0}px) rotate(${tip === "pass" ? -25 : tip === "like" ? 25 : 0}deg)`;
    const id = el.dataset.id; setTimeout(() => karar(id, tip), 220);
  }
}
function sürükle(el) {
  if (!el) return;
  let x0 = 0, y0 = 0, dx = 0, dy = 0, aktif = false, hareket = false;
  const deck = el.parentElement;
  el.addEventListener("pointerdown", e => { aktif = true; hareket = false; x0 = e.clientX; y0 = e.clientY; el.classList.add("drag"); el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", e => {
    if (!aktif) return; dx = e.clientX - x0; dy = e.clientY - y0; if (Math.abs(dx) + Math.abs(dy) > 6) hareket = true;
    el.style.transform = `translate(${dx}px,${dy}px) rotate(${dx / 18}deg)`;
    el.querySelector(".stamp.l").style.opacity = Math.min(1, dx / 90); el.querySelector(".stamp.p").style.opacity = Math.min(1, -dx / 90);
    el.querySelector(".stamp.s").style.opacity = dy < -40 && Math.abs(dx) < 60 ? Math.min(1, -dy / 90) : 0;
  });
  const bitir = () => {
    if (!aktif) return; aktif = false; el.classList.remove("drag");
    if (!hareket) { return detay(el.dataset.id); }
    const id = el.dataset.id;
    if (dx > 100) { el.style.transform = `translate(600px,${dy}px) rotate(25deg)`; setTimeout(() => karar(id, "like"), 200); }
    else if (dx < -100) { el.style.transform = `translate(-600px,${dy}px) rotate(-25deg)`; setTimeout(() => karar(id, "pass"), 200); }
    else if (dy < -120 && Math.abs(dx) < 80) { if (!superHakki()) { toast("Bugünkü süper beğeni hakkın bitti ⭐"); el.style.transform = ""; el.querySelectorAll(".stamp").forEach(s => s.style.opacity = 0); return; } el.style.transform = "translateY(-700px)"; setTimeout(() => karar(id, "super"), 200); }
    else { el.style.transform = ""; el.querySelectorAll(".stamp").forEach(s => s.style.opacity = 0); }
    dx = dy = 0;
  };
  el.addEventListener("pointerup", bitir); el.addEventListener("pointercancel", bitir);
}
function superHakki() { if (S.supers.d !== bugun()) S.supers = { d: bugun(), n: 0 }; return S.supers.n < GUNLUK_SUPER; }

/* ---------- Karar & eşleşme ---------- */
async function karar(id, tip) {
  const p = byId(id); if (!p || S.act[id]) return render();
  S.act[id] = tip; if (tip === "super") { superHakki(); S.supers.n++; }
  const giris = { id, eslesti: false }; undoStack.push(giris); undoStack = undoStack.slice(-5);
  render();
  try {
    const r = await api("POST", "/begeni", { id, tip });
    if (r.eslesti) { giris.eslesti = true; if (!S.matches.includes(id)) S.matches.push(id); S.chats[id] ||= { m: [], okunmadi: 0 }; render(); eslesmeEkrani(p); }
  } catch (e) { delete S.act[id]; if (tip === "super") S.supers.n = Math.max(0, S.supers.n - 1); undoStack = undoStack.filter(x => x !== giris); toast(e.message); render(); }
}
async function geriAl() {
  const son = undoStack.pop(); if (!son) return toast("Geri alınacak bir şey yok");
  if (son.eslesti) { undoStack.push(son); return toast("Eşleşmeyi geri alamazsın"); }
  try { await api("POST", "/geri", { id: son.id }); delete S.act[son.id]; render(); toast("Son kararın geri alındı"); } catch (e) { toast(e.message); }
}
function eslesmeEkrani(p) {
  const o = acik(`<div class="match"><div style="font-size:48px">🎉</div><h1>Eşleştiniz!</h1><p>Sen ve ${esc(p.ad)} birbirinizi beğendiniz.</p>
    <div class="pair">${avatar(S.me, "s")}${avatar(p, "s")}</div>
    <button class="btn block" style="background:#fff;color:var(--pri)" id="mYaz">Mesaj gönder 💬</button>
    <button class="btn block" style="background:transparent;box-shadow:none;margin-top:6px" id="mDevam">Keşfetmeye devam et</button></div>`);
  o.style.justifyContent = "center";
  $("#mYaz").onclick = () => { o.style.justifyContent = ""; kapat(); sohbet(p.id); };
  $("#mDevam").onclick = () => { o.style.justifyContent = ""; kapat(); };
}

/* ---------- Detay penceresi ---------- */
function detay(id) {
  const p = byId(id); const u = uyum(p), eslesme = S.matches.includes(id);
  const o = acik(`<div class="sheet"><button class="x" id="dKapat">✕</button><div class="hero">${avatar(p, "xl")}</div><div class="body">
    <h2 style="margin:0">${esc(p.ad)}, ${p.yas} ${p.dogrulanmis ? '<span class="ver" title="Doğrulanmış profil">✔</span>' : ""}</h2>
    <div class="mut">📍 ${esc(p.sehir)} · 💼 ${esc(p.meslek)} ${cevrimici(p) ? "· 🟢 Çevrimiçi" : ""}</div>
    <p>${esc(p.hakkinda)}</p>
    <h3>Uyumunuz: %${u.toplam}</h3>
    ${[["Burç " + BURC_SIMGE[S.me.burc] + BURC_SIMGE[p.burc], u.burc], ["Ortak ilgi", u.ilgi], ["Hedef", u.hedef]].map(([n, v]) => `<div class="row" style="margin:6px 0"><span style="width:110px;font-size:14px">${n}</span><div class="bar grow"><i style="width:${v}%"></i></div><span class="mut">%${v}</span></div>`).join("")}
    <p class="mut">${BURC_SIMGE[S.me.burc]} ${esc(S.me.burc)} & ${BURC_SIMGE[p.burc]} ${esc(p.burc)}: ${esc(u.yorum)}</p>
    <h3>İlgi alanları</h3><div class="chips">${p.ilgi.map(i => `<span class="chip ${u.ortak.includes(i) ? "ortak" : ""}">${u.ortak.includes(i) ? "✓ " : ""}${esc(i)}</span>`).join("")}</div>
    <h3>Detaylar</h3><div class="dtl"><div><small>Boy</small>${p.boy} cm</div><div><small>Burç</small>${BURC_SIMGE[p.burc]} ${esc(p.burc)}</div><div><small>Ne arıyor</small>${esc(p.hedef)}</div><div><small>Sigara / Alkol</small>${esc(p.sigara)} / ${esc(p.alkol)}</div></div>
    <div class="row" style="margin-top:18px">${eslesme ? '<button class="btn grow" id="dMsj">💬 Mesaj gönder</button>' : S.act[id] ? "" : '<button class="btn sec grow" id="dGec">✖️ Geç</button><button class="btn grow" id="dBegen">💚 Beğen</button>'}</div>
    <div class="row" style="margin-top:14px;justify-content:center"><button class="btn sec" id="dSikayet" style="padding:8px 14px;font-size:14px">🚩 Şikayet et</button><button class="btn sec" id="dEngel" style="padding:8px 14px;font-size:14px">⛔ Engelle</button></div></div></div>`);
  o.onclick = e => { if (e.target === o) kapat(); };
  $("#dKapat").onclick = kapat;
  $("#dBegen")?.addEventListener("click", () => { kapat(); karar(id, "like"); });
  $("#dGec")?.addEventListener("click", () => { kapat(); karar(id, "pass"); });
  $("#dMsj")?.addEventListener("click", () => { kapat(); sohbet(id); });
  $("#dSikayet").onclick = () => sikayet(id);
  $("#dEngel").onclick = () => { if (confirm(`${p.ad} engellensin mi? Artık birbirinizi göremezsiniz.`)) api("POST", "/engelle", { id }).then(() => { S.blocked.push(id); S.matches = S.matches.filter(x => x !== id); S.likedMe = S.likedMe.filter(x => x !== id); kapat(); render(); toast("Kullanıcı engellendi"); }).catch(e => toast(e.message)); };
}
function sikayet(id) {
  const nedenler = ["Sahte profil", "Uygunsuz içerik", "Taciz / rahatsız edici davranış", "Dolandırıcılık / para isteme", "Reşit olmayan kullanıcı"];
  const n = prompt("Şikayet nedenini yaz (numara):\n" + nedenler.map((x, i) => `${i + 1}) ${x}`).join("\n"));
  if (!n) return; api("POST", "/sikayet", { id, neden: nedenler[+n - 1] || n }).then(() => toast("Şikayetin alındı, teşekkürler 🙏")).catch(e => toast(e.message));
}

/* ---------- Beğenenler ---------- */
function begenenler() {
  const l = S.likedMe.filter(id => !S.act[id] && !S.blocked.includes(id)).map(byId);
  $("#view").innerHTML = `<h2>💗 Seni beğenenler</h2>` + (l.length ? `<div class="grid">${l.map(p => `<div class="gi" data-id="${p.id}">${avatar(p, "m")}<div class="n">${esc(p.ad)}, ${p.yas}</div><div class="mut">%${uyum(p).toplam} uyum · ${esc(p.sehir)}</div></div>`).join("")}</div>`
    : `<div class="empty"><div class="e">💞</div><p>Şu an bekleyen beğeni yok. Keşfet'te biraz dolaş, yenileri gelecek!</p></div>`);
  $("#view").onclick = e => { const g = e.target.closest(".gi"); if (g) detay(g.dataset.id); };
}

/* ---------- Mesajlar ---------- */
function mesajlar() {
  const ms = S.matches.filter(id => !S.blocked.includes(id)).map(byId);
  const yeni = ms.filter(p => !(S.chats[p.id]?.m.length));
  const konus = ms.filter(p => S.chats[p.id]?.m.length).sort((a, b) => S.chats[b.id].m.at(-1).t - S.chats[a.id].m.at(-1).t);
  $("#view").innerHTML = `<h2>💬 Mesajlar</h2>` + (!ms.length ? `<div class="empty"><div class="e">💌</div><p>Henüz eşleşmen yok. Beğenmeye devam et!</p></div>` : `
    ${yeni.length ? `<h3>Yeni eşleşmeler</h3><div class="yeni">${yeni.map(p => `<div data-id="${p.id}">${avatar(p, "s")}${esc(p.ad)}</div>`).join("")}</div>` : ""}
    ${konus.length ? `<h3>Sohbetler</h3>${konus.map(p => { const c = S.chats[p.id], son = c.m.at(-1); return `<div class="li" data-id="${p.id}">${avatar(p, "s")}<div class="grow"><div class="t">${esc(p.ad)}</div><p>${son.k === "ben" ? "Sen: " : ""}${esc(son.x)}</p></div>${c.okunmadi ? `<span class="u">${c.okunmadi}</span>` : ""}</div>`; }).join("")}` : ""}`);
  $("#view").onclick = e => { const g = e.target.closest("[data-id]"); if (g) sohbet(g.dataset.id); };
}
const BUZ_KIRICI = ["Hafta sonu planın ne? ☕", "Kahve mi çay mı? ", "En son izlediğin güzel dizi neydi?", "Hayalindeki tatil nerede?", "Çocukluk lakabın neydi? 😄", "İstanbul mu, İzmir mi?"];
function sohbet(id) {
  const p = byId(id); const c = S.chats[id] ||= { m: [], okunmadi: 0 };
  acikSohbetId = id; if (c.okunmadi) api("POST", "/okundu", { id }).catch(() => {}); c.okunmadi = 0; rozetler();
  const o = acik(`<div class="full" style="position:absolute"><div class="chat-h"><button class="back" id="cGeri">‹</button>${avatar(p, "s")}<div class="grow"><b>${esc(p.ad)}</b><div class="mut" id="cDurum">${cevrimici(p) ? "🟢 Çevrimiçi" : "Çevrimdışı"}</div></div><button class="back" id="cDetay" title="Profil">ⓘ</button></div>
    <div id="msgs"></div><div class="ice" id="ice"></div>
    <div class="chat-f"><input id="cIn" maxlength="500" placeholder="Mesaj yaz..." autocomplete="off"><button class="btn" id="cGonder">➤</button></div></div>`);
  o.style.justifyContent = "stretch";
  const msgs = $("#msgs");
  const ciz = () => {
    msgs.innerHTML = c.m.map(m => `<div class="m ${m.k === "ben" ? "me" : "on"}">${esc(m.x)}<small>${new Date(m.t).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}${m.k === "ben" ? " ✓✓" : ""}</small></div>`).join("") || `<p class="mut" style="text-align:center;margin-top:40px">Eşleştiniz! İlk mesajı sen at 👋<br>Ortak: ${esc(uyum(p).ortak.join(", ") || "—")}</p>`;
    msgs.scrollTop = msgs.scrollHeight;
  };
  ciz();
  const ice = $("#ice"); ice.innerHTML = c.m.length ? "" : BUZ_KIRICI.concat(uyum(p).ortak.slice(0, 2).map(i => `${i} konusunda ne düşünüyorsun?`)).map(t => `<span class="chip">${esc(t)}</span>`).join("");
  ice.onclick = e => { const ch = e.target.closest(".chip"); if (ch) { $("#cIn").value = ch.textContent; $("#cIn").focus(); } };
  sohbetYenile = ciz;
  const sonYaz = { t: 0 };
  $("#cIn").addEventListener("input", () => { if (Date.now() - sonYaz.t > 2000 && ws?.readyState === 1) { sonYaz.t = Date.now(); ws.send(JSON.stringify({ t: "typing", to: id })); } });
  const gonder = async () => {
    const i = $("#cIn"), t = i.value.trim(); if (!t) return;
    const msj = { k: "ben", x: t, t: Date.now() }; c.m.push(msj); i.value = ""; ice.innerHTML = ""; ciz();
    try { await api("POST", "/mesaj", { to: id, text: t }); } catch (e) { c.m = c.m.filter(x => x !== msj); ciz(); toast(e.message); }
  };
  $("#cGonder").onclick = gonder; $("#cIn").onkeydown = e => { if (e.key === "Enter") gonder(); };
  const cik = () => { acikSohbetId = null; sohbetYenile = null; o.style.justifyContent = ""; };
  $("#cGeri").onclick = () => { cik(); kapat(); render(); };
  $("#cDetay").onclick = () => { cik(); detay(id); };
}
/* ---------- Profil & ayarlar ---------- */
function filtrePenceresi() {
  const f = S.ayar;
  const o = acik(`<div class="sheet"><div class="body"><h2>⚙️ Filtreler</h2>
    <label class="f">Yaş aralığı</label><div class="range"><input id="yMin" type="number" min="18" max="99" value="${f.minYas}"> – <input id="yMax" type="number" min="18" max="99" value="${f.maxYas}"></div>
    <div class="sw-row"><span>Sadece ${esc(S.me.sehir)} şehrindekiler</span><button class="tg ${f.ayniSehir ? "on" : ""}" id="fSeh"></button></div>
    <label class="f">İlişki hedefi</label><select id="fH"><option value="">Hepsi</option>${HEDEFLER.map(h => `<option ${f.hedef === h ? "selected" : ""}>${h}</option>`).join("")}</select>
    <div class="row" style="margin-top:16px"><button class="btn sec grow" id="fSifir">Sıfırla</button><button class="btn grow" id="fUygula">Uygula</button></div></div></div>`);
  o.onclick = e => { if (e.target === o) kapat(); };
  $("#fSeh").onclick = e => e.target.classList.toggle("on");
  $("#fSifir").onclick = () => { Object.assign(S.ayar, { minYas: 18, maxYas: 45, ayniSehir: false, hedef: "" }); save(); kapat(); render(); };
  $("#fUygula").onclick = () => { S.ayar.minYas = Math.max(18, +$("#yMin").value || 18); S.ayar.maxYas = Math.max(S.ayar.minYas, +$("#yMax").value || 99); S.ayar.ayniSehir = $("#fSeh").classList.contains("on"); S.ayar.hedef = $("#fH").value; save(); kapat(); render(); };
}
function profil() {
  const m = S.me;
  const alanlar = [m.hakkinda, m.foto || m.emoji, m.ilgi.length >= 5, m.meslek !== "—", m.foto];
  const tam = Math.round(40 + alanlar.filter(Boolean).length / alanlar.length * 60);
  $("#view").innerHTML = `<div class="card" style="text-align:center">${avatar(m, "s", "margin:0 auto;width:96px;height:96px;font-size:48px")}
    <h2 style="margin:10px 0 0">${esc(m.ad)}, ${m.yas} ${m.dogrulanmis ? '<span class="ver">✔</span>' : ""}</h2>
    <div class="mut">${BURC_SIMGE[m.burc]} ${esc(m.burc)} · 📍 ${esc(m.sehir)} · ${esc(m.hedef)}</div>
    <div class="row" style="margin:12px 0 4px"><span class="mut">Profil doluluğu</span><div class="bar grow"><i style="width:${tam}%"></i></div><b>%${tam}</b></div>
    <div class="row" style="margin-top:12px"><button class="btn sec grow" id="pDuzenle">✏️ Düzenle</button><button class="btn sec grow" id="pCikis">🚪 Çıkış yap</button></div></div>
    <div class="card"><div class="sw-row"><div><b>Gizli mod</b><div class="mut">Sadece beğendiklerin seni görür</div></div><button class="tg ${m.gizli ? "on" : ""}" id="pGizli"></button></div>
    <div class="sw-row"><div><b>Koyu tema</b></div><button class="tg ${S.ayar.koyu ? "on" : ""}" id="pKoyu"></button></div>
    <div class="sw-row" style="border:0"><div><b>Keşfet filtreleri</b><div class="mut">${S.ayar.minYas}–${S.ayar.maxYas} yaş${S.ayar.ayniSehir ? " · aynı şehir" : ""}${S.ayar.hedef ? " · " + esc(S.ayar.hedef) : ""}</div></div><button class="btn sec" id="pFiltre" style="padding:8px 14px">Aç</button></div></div>
    <div class="card"><b>🔒 Güvenlik ipuçları</b><ul class="mut" style="padding-left:18px;margin:8px 0 0"><li>Para isteyen veya yatırım öneren kişilere karşı dikkatli ol.</li><li>İlk buluşmayı kalabalık, herkese açık bir yerde yap.</li><li>Kişisel bilgilerini (TC, adres, banka) paylaşma.</li><li>Rahatsız edici biri olursa engelle ve şikayet et.</li></ul></div>
    <div class="card"><b>🔐 Gizlilik ve KVKK</b><div class="mut" style="margin:6px 0"><a href="/yasal/aydinlatma.html" target="_blank" rel="noopener">Aydınlatma Metni</a> · <a href="/yasal/acik-riza.html" target="_blank" rel="noopener">Açık Rıza Metni</a></div>
    <button class="btn sec block" id="pIndir" style="margin-bottom:8px">⬇️ Verilerimi indir</button>
    <div class="mut" style="font-size:13px">Açık rızanı geri çekmek için hesabını silebilirsin; verilerin silinir.</div></div>
    <div class="card"><div class="mut">Engellenenler: ${S.blocked.length} · Eşleşmeler: ${S.matches.length}</div>
    <button class="btn sec block" id="pSifirla" style="margin-top:10px">Hesabımı ve verilerimi sil</button></div>`;
  $("#pDuzenle").onclick = () => onboarding(true);
  $("#pIndir").onclick = async () => {
    try { const d = await api("GET", "/verilerim"), a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" })); a.download = "eslesme-verilerim.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast("Verilerin indirildi"); } catch (e) { toast(e.message); }
  };
  $("#pCikis").onclick = () => api("POST", "/cikis").catch(() => {}).finally(oturumuBitir);
  $("#pGizli").onclick = () => api("PUT", "/gizli", { gizli: !S.me.gizli }).then(() => { S.me.gizli = !S.me.gizli; profil(); }).catch(e => toast(e.message));
  $("#pKoyu").onclick = () => { S.ayar.koyu = !S.ayar.koyu; save(); render(); };
  $("#pFiltre").onclick = filtrePenceresi;
  $("#pSifirla").onclick = () => { if (confirm("Hesabın ve tüm verilerin kalıcı olarak silinecek. Emin misin?")) api("DELETE", "/ben").then(oturumuBitir).catch(e => toast(e.message)); };
}

boot();
