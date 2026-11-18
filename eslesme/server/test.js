"use strict";
// Entegrasyon testi: geçici veritabanıyla sunucuyu başlatır; hesap, eşleşme, gerçek zamanlı sohbet, bot ve güvenlik denetimleri.
process.env.DB_PATH = require("node:os").tmpdir() + "/eslesme-test-" + process.pid + ".db";
process.env.PORT = "0";
const assert = require("node:assert/strict");
const WebSocket = require("ws");
const { server } = require("./server.js");
(async () => {
  await new Promise(r => server.listening ? r() : server.on("listening", r));
  const base = "http://localhost:" + server.address().port;
  const call = async (m, p, b, tok) => { const r = await fetch(base + "/api" + p, { method: m, headers: { "content-type": "application/json", ...(tok ? { authorization: "Bearer " + tok } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  const prof = (ad, cins, ilgi_cins, extra = {}) => ({ ad, dogum: "1996-05-10", cins, ilgi_cins, sehir: "İstanbul", meslek: "Test", boy: 175, hedef: "Ciddi ilişki", sigara: "İçmiyor", alkol: "İçmiyor", hakkinda: "<b>x</b>", ilgi: ["Kahve", "Kedi", "Sinema"], emoji: "😊", renk: 100, foto: "", ...extra });
  const ws = (tok) => new Promise(res => { const w = new WebSocket(base.replace("http", "ws") + "/ws"); const ev = []; w.on("message", d => ev.push(JSON.parse(d))); w.on("open", () => w.send(JSON.stringify({ t: "auth", token: tok }))); const bekle = async (fn, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const x = ev.find(fn); if (x) return x; await new Promise(r => setTimeout(r, 50)); } throw new Error("olay gelmedi " + JSON.stringify(ev)); }; w.on("message", function f(d) { if (JSON.parse(d).t === "hazir") { w.off("message", f); res({ w, ev, bekle }); } }); });

  // --- hesap ---
  assert.equal((await call("POST", "/kayit", { email: "kotu", sifre: "12345678", onay: true })).s, 400);
  assert.equal((await call("POST", "/kayit", { email: "a@b.co", sifre: "kisa", onay: true })).s, 400);
  assert.equal((await call("POST", "/kayit", { email: "a@b.co", sifre: "12345678" })).s, 400, "18 yaş onayı şart");
  const a = (await call("POST", "/kayit", { email: "ayse@test.co", sifre: "parola-123", onay: true })).j.token;
  const b = (await call("POST", "/kayit", { email: "can@test.co", sifre: "parola-123", onay: true })).j.token;
  assert.ok(a && b);
  assert.equal((await call("POST", "/kayit", { email: "AYSE@test.co", sifre: "parola-123", onay: true })).s, 409);
  assert.equal((await call("POST", "/giris", { email: "ayse@test.co", sifre: "yanlis-parola" })).s, 401);
  assert.ok((await call("POST", "/giris", { email: "ayse@test.co", sifre: "parola-123" })).j.token);
  assert.equal((await call("GET", "/durum")).s, 401);
  assert.equal((await call("POST", "/begeni", { id: "k1", tip: "like" }, a)).s, 400, "profilsiz işlem yok");

  // --- profil doğrulama ---
  assert.equal((await call("PUT", "/ben", prof("Ayşe", "kadin", "erkek", { dogum: "2015-01-01" }), a)).s, 400, "18 yaş altı");
  assert.equal((await call("PUT", "/ben", prof("Ayşe", "kadin", "erkek", { foto: "data:text/html;base64,AAAA" }), a)).s, 400);
  assert.equal((await call("PUT", "/ben", prof("Ayşe", "kadin", "erkek"), a)).s, 400, "açık rıza olmadan profil yok");
  const da = (await call("PUT", "/ben", { ...prof("Ayşe", "kadin", "erkek"), riza: true }, a)).j;
  assert.equal(da.me.yas > 18, true); assert.equal(da.likedMe.length, 6, "demo beğeniler");
  assert.equal(da.me.dogrulanmis, false);
  assert.ok(!JSON.stringify(da.profiller).includes("@test.co") && !da.profiller.some(p => "dogum" in p), "özel veri sızmıyor");
  await call("PUT", "/ben", { ...prof("Can", "erkek", "kadin"), riza: true }, b);
  const vr = (await call("GET", "/verilerim", null, a)).j;
  assert.equal(vr.hesap.email, "ayse@test.co"); assert.equal(vr.acik_riza.metin_surumu, "1.0"); assert.ok(vr.acik_riza.tarih, "rıza kaydı tutuluyor");
  assert.equal((await call("GET", "/verilerim")).s, 401);
  for (const y of ["/yasal/aydinlatma.html", "/yasal/acik-riza.html"]) assert.equal((await fetch(base + y)).status, 200, y);

  // --- gerçek zamanlı: iki gerçek kullanıcı ---
  const wa = await ws(a), wb = await ws(b);
  const idA = da.me.id, idB = (await call("GET", "/durum", null, b)).j.me.id;
  assert.ok((await call("GET", "/durum", null, a)).j.profiller.some(p => p.id === idB), "Can keşfette");
  assert.equal((await call("POST", "/mesaj", { to: idB, text: "selam" }, a)).s, 403, "eşleşmeden mesaj yok");
  assert.equal((await call("POST", "/begeni", { id: idB, tip: "like" }, a)).j.eslesti, false);
  await wb.bekle(e => e.t === "like");
  assert.equal((await call("POST", "/begeni", { id: idB, tip: "like" }, a)).s, 409, "çift oy yok");
  assert.equal((await call("POST", "/begeni", { id: idA, tip: "like" }, b)).j.eslesti, true);
  await wa.bekle(e => e.t === "match" && e.id === idB);
  wb.w.send(JSON.stringify({ t: "typing", to: idA })); await wa.bekle(e => e.t === "typing");
  await call("POST", "/mesaj", { to: idA, text: "Merhaba Ayşe!" }, b);
  assert.equal((await wa.bekle(e => e.t === "msg")).x, "Merhaba Ayşe!");
  assert.equal((await call("GET", "/durum", null, a)).j.chats[idB].okunmadi, 1);
  await call("POST", "/okundu", { id: idB }, a);
  assert.equal((await call("GET", "/durum", null, a)).j.chats[idB].okunmadi, 0);
  assert.equal((await call("POST", "/mesaj", { to: idA, text: "x".repeat(501) }, b)).s, 400);

  // --- bot ---
  const bot = da.likedMe[0];
  assert.equal((await call("POST", "/begeni", { id: bot, tip: "like" }, a)).j.eslesti, true, "beni beğenen botla eşleşir");
  const ilk = await wa.bekle(e => e.t === "msg" && e.from === bot); assert.ok(ilk.x);
  await call("POST", "/mesaj", { to: bot, text: "kahve içelim mi?" }, a);
  assert.match((await wa.bekle(e => e.t === "msg" && e.from === bot && /Kahve/.test(e.x))).x, /Kahve/);

  // --- süper beğeni limiti, geri al, engel, şikayet ---
  const ids = da.profiller.filter(p => p.bot && !da.act[p.id] && p.id !== bot && !da.likedMe.includes(p.id)).map(p => p.id);
  for (let i = 0; i < 3; i++) assert.equal((await call("POST", "/begeni", { id: ids[i], tip: "super" }, a)).s, 200);
  assert.equal((await call("POST", "/begeni", { id: ids[3], tip: "super" }, a)).s, 429, "günde 3 süper");
  assert.equal((await call("POST", "/begeni", { id: ids[4], tip: "pass" }, a)).s, 200);
  assert.equal((await call("POST", "/geri", { id: ids[4] }, a)).s, 200);
  assert.equal((await call("POST", "/sikayet", { id: idB, neden: "test" }, a)).s, 200);
  await call("POST", "/engelle", { id: idB }, a);
  const dd = (await call("GET", "/durum", null, a)).j;
  assert.ok(!dd.matches.includes(idB) && !dd.profiller.some(p => p.id === idB), "engellenen görünmez");
  assert.equal((await call("POST", "/mesaj", { to: idA, text: "hâlâ?" }, b)).s, 403);

  // --- güvenlik ---
  const ac = new WebSocket(base.replace("http", "ws") + "/ws"); await new Promise(r => ac.on("open", r)); ac.send(JSON.stringify({ t: "auth", token: "sahte" })); await new Promise(r => ac.on("close", r));
  const st = await fetch(base + "/server.js"); assert.equal(st.status, 404, "sunucu kodu servis edilmiyor");
  assert.equal((await fetch(base + "/index.html")).status, 200);

  // --- hesap silme ---
  assert.equal((await call("DELETE", "/ben", null, b)).s, 200);
  assert.equal((await call("GET", "/durum", null, b)).s, 401);
  console.log("TÜM TESTLER GEÇTİ ✔"); process.exit(0);
})().catch(e => { console.error("TEST HATASI:", e); process.exit(1); });
