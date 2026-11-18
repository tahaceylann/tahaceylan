"use strict";
// Eşleşme sunucusu: hesaplar (scrypt + oturum jetonu), REST API, WebSocket ile gerçek zamanlı sohbet.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { WebSocketServer } = require("ws");
const D = require("../data.js");
const BOTLAR = require("./botlar.js");

const PORT = process.env.PORT !== undefined ? +process.env.PORT : 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "veri.db");
const ROOT = path.join(__dirname, "..");
const STATIC = { "/yasal/aydinlatma.html": "yasal/aydinlatma.html", "/yasal/acik-riza.html": "yasal/acik-riza.html", "/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/data.js": "data.js", "/style.css": "style.css", "/manifest.json": "manifest.json" };
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
const GUNLUK_SUPER = 3;

/* ---------- Veritabanı ---------- */
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE, pass TEXT, bot INTEGER DEFAULT 0, created INTEGER, super_d TEXT, super_n INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS profiles(user_id TEXT PRIMARY KEY, cins TEXT, ilgi_cins TEXT, gizli INTEGER DEFAULT 0, data TEXT);
CREATE TABLE IF NOT EXISTS sessions(h TEXT PRIMARY KEY, user_id TEXT, exp INTEGER);
CREATE TABLE IF NOT EXISTS swipes(a TEXT, b TEXT, tip TEXT, t INTEGER, PRIMARY KEY(a,b));
CREATE TABLE IF NOT EXISTS matches(a TEXT, b TEXT, t INTEGER, PRIMARY KEY(a,b));
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT, frm TEXT, to_ TEXT, x TEXT, t INTEGER, read INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS msg_pair ON messages(frm,to_);
CREATE TABLE IF NOT EXISTS blocks(a TEXT, b TEXT, PRIMARY KEY(a,b));
CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT, a TEXT, b TEXT, neden TEXT, t INTEGER);
`);
try { db.exec("ALTER TABLE profiles ADD COLUMN riza_t INTEGER"); db.exec("ALTER TABLE profiles ADD COLUMN riza_v TEXT"); } catch { /* sütunlar zaten var */ }
const RIZA_SURUMU = "1.0";
const cache = new Map();
const st = sql => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };
const get = (sql, ...p) => st(sql).get(...p);
const all = (sql, ...p) => st(sql).all(...p);
const run = (sql, ...p) => st(sql).run(...p);
const pair = (x, y) => (x < y ? [x, y] : [y, x]);

const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const sha = s => crypto.createHash("sha256").update(s).digest("hex");

function botlariYukle() {
  for (const b of BOTLAR) {
    if (get("SELECT 1 FROM users WHERE id=?", b.id)) continue;
    run("INSERT INTO users(id,bot,created) VALUES(?,1,?)", b.id, Date.now());
    const { id, cins, ...rest } = b;
    run("INSERT INTO profiles(user_id,cins,ilgi_cins,data) VALUES(?,?,?,?)", id, cins, cins === "kadin" ? "erkek" : "kadin", JSON.stringify({ ...rest, cins }));
  }
}
botlariYukle();

/* ---------- Şifre & oturum ---------- */
function sifreHashle(pw) { const salt = crypto.randomBytes(16); return salt.toString("hex") + ":" + crypto.scryptSync(pw, salt, 64).toString("hex"); }
function sifreDogru(pw, kayit) {
  const [salt, h] = String(kayit || "").split(":"); if (!salt || !h) return false;
  const x = crypto.scryptSync(pw, Buffer.from(salt, "hex"), 64), y = Buffer.from(h, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function oturumAc(uid) { const tok = crypto.randomBytes(32).toString("base64url"); run("INSERT INTO sessions VALUES(?,?,?)", sha(tok), uid, Date.now() + 30 * 864e5); return tok; }
function kimdir(tok) {
  if (!tok) return null; const r = get("SELECT user_id,exp FROM sessions WHERE h=?", sha(tok));
  if (!r) return null; if (r.exp < Date.now()) { run("DELETE FROM sessions WHERE h=?", sha(tok)); return null; }
  return r.user_id;
}

/* ---------- Profil ---------- */
const LISTE = { sigara: ["İçmiyor", "Ara sıra", "İçiyor"], alkol: ["İçmiyor", "Nadiren", "Sosyal"] };
function yasHesapla(dogum) { const d = new Date(dogum), n = new Date(); let y = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) y--; return y; }
function profilDogrula(b) {
  const str = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";
  const ad = str(b.ad, 20); if (!ad) return { hata: "Ad gerekli." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dogum || "") || isNaN(new Date(b.dogum))) return { hata: "Doğum tarihi geçersiz." };
  const yas = yasHesapla(b.dogum);
  if (yas < 18) return { hata: "Bu uygulamayı yalnızca 18 yaş ve üstü kullanabilir." };
  if (yas > 99) return { hata: "Doğum tarihi geçersiz." };
  if (!["kadin", "erkek"].includes(b.cins)) return { hata: "Cinsiyet geçersiz." };
  if (!["kadin", "erkek", "herkes"].includes(b.ilgi_cins)) return { hata: "İlgilenilen cinsiyet geçersiz." };
  if (!D.ILLER.includes(b.sehir)) return { hata: "Şehir geçersiz." };
  if (!D.HEDEFLER.includes(b.hedef)) return { hata: "Hedef geçersiz." };
  if (!LISTE.sigara.includes(b.sigara) || !LISTE.alkol.includes(b.alkol)) return { hata: "Sigara/alkol seçimi geçersiz." };
  const boy = Math.round(+b.boy); if (!(boy >= 120 && boy <= 230)) return { hata: "Boy geçersiz." };
  const ilgi = [...new Set(Array.isArray(b.ilgi) ? b.ilgi : [])].filter(i => D.ILGILER.includes(i));
  if (ilgi.length < 3) return { hata: "En az 3 ilgi alanı seç." };
  const foto = typeof b.foto === "string" ? b.foto : "";
  if (foto && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(foto) || foto.length > 400000)) return { hata: "Fotoğraf geçersiz veya çok büyük." };
  const renk = Math.min(360, Math.max(0, Math.round(+b.renk) || 340));
  const [ay, gun] = [new Date(b.dogum).getUTCMonth() + 1, new Date(b.dogum).getUTCDate()];
  return { cins: b.cins, ilgi_cins: b.ilgi_cins, data: { ad, dogum: b.dogum, sehir: b.sehir, meslek: str(b.meslek, 30) || "—", boy, burc: D.burcBul(ay, gun), hedef: b.hedef, sigara: b.sigara, alkol: b.alkol, hakkinda: str(b.hakkinda, 300), ilgi, emoji: str(b.emoji, 8) || "😊", renk, foto, dogrulanmis: false } };
}
const online = new Map(); // uid -> Set<ws>
const cevrimiciMi = (uid, bot) => bot ? hash(uid + new Date().toISOString().slice(0, 10)) % 3 === 0 : online.has(uid);
function pub(uid) {
  const r = get("SELECT u.bot,p.data,p.cins FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=?", uid); if (!r) return null;
  const d = JSON.parse(r.data), bot = !!r.bot;
  return { id: uid, ad: d.ad, yas: bot ? d.yas : yasHesapla(d.dogum), cins: r.cins, sehir: d.sehir, meslek: d.meslek, boy: d.boy, burc: d.burc, hedef: d.hedef, sigara: d.sigara, alkol: d.alkol, emoji: d.emoji, renk: d.renk, hakkinda: d.hakkinda, ilgi: d.ilgi, dogrulanmis: !!d.dogrulanmis, foto: d.foto || "", bot, cevrimici: cevrimiciMi(uid, bot) };
}
const engelli = (a, b) => !!get("SELECT 1 FROM blocks WHERE (a=? AND b=?) OR (a=? AND b=?)", a, b, b, a);
const eslesmis = (a, b) => { const [x, y] = pair(a, b); return !!get("SELECT 1 FROM matches WHERE a=? AND b=?", x, y); };
const begendi = (a, b) => !!get("SELECT 1 FROM swipes WHERE a=? AND b=? AND tip IN ('like','super')", a, b);

function durum(uid) {
  const p = get("SELECT cins,ilgi_cins,gizli,data FROM profiles WHERE user_id=?", uid);
  const u = get("SELECT super_d,super_n FROM users WHERE id=?", uid);
  const bugun = new Date().toISOString().slice(0, 10);
  const supers = { d: bugun, n: u.super_d === bugun ? u.super_n : 0 };
  if (!p) return { me: null, profiller: [], act: {}, matches: [], likedMe: [], blocked: [], chats: {}, supers };
  const d = JSON.parse(p.data);
  const me = { ...pub(uid), dogum: d.dogum, ilgi_cins: p.ilgi_cins, gizli: !!p.gizli };
  const act = Object.fromEntries(all("SELECT b,tip FROM swipes WHERE a=?", uid).map(r => [r.b, r.tip]));
  const matches = all("SELECT a,b FROM matches WHERE a=? OR b=?", uid, uid).map(r => r.a === uid ? r.b : r.a).filter(id => !engelli(uid, id));
  const likedMe = all("SELECT a FROM swipes WHERE b=? AND tip IN ('like','super')", uid).map(r => r.a).filter(id => !act[id] && !engelli(uid, id));
  const blocked = all("SELECT b FROM blocks WHERE a=?", uid).map(r => r.b);
  const aday = all("SELECT p.user_id id,p.gizli FROM profiles p WHERE p.user_id!=? AND p.cins IN (?,?) AND (p.ilgi_cins='herkes' OR p.ilgi_cins=?)", uid, p.ilgi_cins === "herkes" ? "kadin" : p.ilgi_cins, p.ilgi_cins === "herkes" ? "erkek" : p.ilgi_cins, p.cins)
    .filter(r => !engelli(uid, r.id) && (!r.gizli || begendi(r.id, uid))).map(r => r.id);
  const ids = [...new Set([...aday, ...matches, ...likedMe, ...Object.keys(act)])].filter(id => !engelli(uid, id));
  const profiller = ids.map(pub).filter(Boolean);
  const chats = {};
  for (const id of matches) {
    const m = all("SELECT frm,x,t FROM messages WHERE (frm=? AND to_=?) OR (frm=? AND to_=?) ORDER BY id DESC LIMIT 200", uid, id, id, uid).reverse().map(r => ({ k: r.frm === uid ? "ben" : "on", x: r.x, t: r.t }));
    chats[id] = { m, okunmadi: get("SELECT COUNT(*) n FROM messages WHERE frm=? AND to_=? AND read=0", id, uid).n };
  }
  return { me, profiller, act, matches, likedMe, blocked, chats, supers };
}

/* ---------- Gerçek zamanlı ---------- */
const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
function yolla(uid, olay) { const s = online.get(uid); if (!s) return; const j = JSON.stringify(olay); for (const w of s) if (w.readyState === 1) w.send(j); }
function karsiTaraflar(uid) { return all("SELECT a,b FROM matches WHERE a=? OR b=?", uid, uid).map(r => r.a === uid ? r.b : r.a); }
function varlikBildir(uid, on) { for (const id of karsiTaraflar(uid)) yolla(id, { t: "presence", id: uid, online: on }); }

wss.on("connection", ws => {
  let uid = null; ws.isAlive = true;
  const zaman = setTimeout(() => { if (!uid) ws.close(4001, "kimlik"); }, 5000);
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!uid) {
      if (m.t !== "auth") return; const k = kimdir(m.token); if (!k) return ws.close(4001, "kimlik");
      uid = k; clearTimeout(zaman); const ilk = !online.has(uid); if (ilk) online.set(uid, new Set()); online.get(uid).add(ws);
      ws.send(JSON.stringify({ t: "hazir" })); if (ilk) varlikBildir(uid, true); return;
    }
    if (m.t === "typing" && typeof m.to === "string" && eslesmis(uid, m.to) && !engelli(uid, m.to)) yolla(m.to, { t: "typing", from: uid });
  });
  ws.on("close", () => {
    clearTimeout(zaman); if (!uid) return; const s = online.get(uid); if (!s) return; s.delete(ws);
    if (!s.size) { online.delete(uid); varlikBildir(uid, false); }
  });
});
setInterval(() => { for (const w of wss.clients) { if (!w.isAlive) { w.terminate(); continue; } w.isAlive = false; w.ping(); } }, 30000).unref();

/* ---------- Bot davranışı ---------- */
function botCevap(bot, kullanici, girdi) {
  const p = pub(bot), ben = pub(kullanici); const ort = p.ilgi.filter(i => ben.ilgi.includes(i)), g = String(girdi).toLowerCase();
  if (girdi === null) return [`Selam! Eşleştik, çok sevindim 😊 ${ort[0] ? ort[0] + " seviyormuşsun, ben de!" : "Nasılsın?"}`, `Merhaba ${ben.ad}! Profilini çok beğendim 🌸`][hash(bot) % 2];
  if (/merhaba|selam|slm|hey/.test(g)) return "Selam! Nasılsın? 😊";
  if (/nasıl|naber|ne yap/.test(g)) return `İyiyim, teşekkürler! Sen nasılsın? Bugün ${p.meslek.toLowerCase()} olarak yoğun bir gün geçirdim 😅`;
  if (/kahve|çay/.test(g)) return "Kahve! ☕ Ama güzel bir çay da olur. Bir ara buluşup içelim mi?";
  if (/hafta sonu|plan|buluş/.test(g)) return `Hafta sonu için henüz planım yok, ${p.sehir}'de güzel bir yer bulabiliriz. Ama önce biraz daha tanışalım 😊`;
  if (/tatil|seyahat/.test(g)) return "Tatil dedin mi aklıma deniz geliyor 🌊 Sen nereyi seversin?";
  if (/dizi|film|sinema/.test(g)) return "Dizi konusunda önerilere açığım! Son zamanlarda sürekli bir şey izliyorum 😄";
  if (/lakap/.test(g)) return `Bana ${p.ad.slice(0, 3)}cik derlerdi 😂 Sen?`;
  if (/\?/.test(g)) return ["Güzel soru! Biraz düşünmem lazım 🤔 Sen ne dersin?", "Bence evet 😄 Peki ya sen?"][g.length % 2];
  return ["Hmm ilginç, biraz daha anlatır mısın? 😊", "Haha çok doğru 😄", `Ben de öyle düşünüyorum! ${ort[0] ? ort[0] + " konusunda da anlaşırız herhalde." : ""}`, "Seninle sohbet etmek çok güzel 🌸"][g.length % 4];
}
function mesajKaydet(frm, to, x) {
  const t = Date.now(); run("INSERT INTO messages(frm,to_,x,t) VALUES(?,?,?,?)", frm, to, x, t);
  yolla(to, { t: "msg", from: frm, x, ts: t }); return t;
}
function botYaz(bot, kullanici, girdi, gecikme) {
  setTimeout(() => yolla(kullanici, { t: "typing", from: bot }), gecikme);
  setTimeout(() => { if (eslesmis(bot, kullanici) && !engelli(bot, kullanici) && get("SELECT 1 FROM users WHERE id=?", kullanici)) mesajKaydet(bot, kullanici, botCevap(bot, kullanici, girdi)); }, gecikme + 1500 + Math.random() * 1500);
}

/* ---------- HTTP ---------- */
const limitler = new Map();
function hizSiniri(ip, ad, max) {
  const k = ad + ip, n = Date.now(); let r = limitler.get(k);
  if (!r || r.s < n) r = { s: n + 60000, n: 0 }; r.n++; limitler.set(k, r); return r.n <= max;
}
setInterval(() => { const n = Date.now(); for (const [k, r] of limitler) if (r.s < n) limitler.delete(k); }, 60000).unref();
const json = (res, kod, o) => { const b = JSON.stringify(o); res.writeHead(kod, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(b); };
const hata = (res, kod, m) => json(res, kod, { hata: m });
function govde(req) {
  return new Promise((ok, no) => { let b = "", n = 0; req.on("data", c => { n += c.length; if (n > 1.5e6) { no(new Error("büyük")); req.destroy(); } else b += c; }); req.on("end", () => { try { ok(b ? JSON.parse(b) : {}); } catch { no(new Error("json")); } }); req.on("error", no); });
}
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

async function api(req, res, yol) {
  const ip = req.socket.remoteAddress || "?", m = req.method;
  if (!hizSiniri(ip, "genel", 300)) return hata(res, 429, "Çok fazla istek, biraz bekle.");
  let b; try { b = m === "GET" || m === "DELETE" ? {} : await govde(req); } catch { return hata(res, 400, "Geçersiz istek."); }

  if (m === "POST" && (yol === "/kayit" || yol === "/giris")) {
    if (!hizSiniri(ip, "auth", 10)) return hata(res, 429, "Çok fazla deneme. Bir dakika sonra tekrar dene.");
    const email = String(b.email || "").trim().toLowerCase(), sifre = String(b.sifre || "");
    if (!EMAIL.test(email)) return hata(res, 400, "Geçerli bir e-posta gir.");
    if (yol === "/kayit") {
      if (sifre.length < 8 || sifre.length > 100) return hata(res, 400, "Şifre en az 8 karakter olmalı.");
      if (b.onay !== true) return hata(res, 400, "18 yaşından büyük olduğunu onaylamalısın.");
      if (get("SELECT 1 FROM users WHERE email=?", email)) return hata(res, 409, "Bu e-posta zaten kayıtlı.");
      const id = "u" + crypto.randomBytes(8).toString("hex");
      run("INSERT INTO users(id,email,pass,created) VALUES(?,?,?,?)", id, email, sifreHashle(sifre), Date.now());
      return json(res, 201, { token: oturumAc(id) });
    }
    const u = get("SELECT id,pass FROM users WHERE email=? AND bot=0", email);
    if (!u) crypto.scryptSync(sifre, "x", 64); // kullanıcı yokken de aynı işi yap (zamanlama farkını azalt)
    if (!u || !sifreDogru(sifre, u.pass)) return hata(res, 401, "E-posta veya şifre hatalı.");
    return json(res, 200, { token: oturumAc(u.id) });
  }

  const tok = (req.headers.authorization || "").replace(/^Bearer /, ""), uid = kimdir(tok);
  if (!uid) return hata(res, 401, "Oturum gerekli.");

  if (m === "POST" && yol === "/cikis") { run("DELETE FROM sessions WHERE h=?", sha(tok)); return json(res, 200, {}); }
  if (m === "GET" && yol === "/durum") return json(res, 200, durum(uid));
  if (m === "DELETE" && yol === "/ben") {
    karsiTaraflar(uid).forEach(id => yolla(id, { t: "presence", id: uid, online: false }));
    for (const t of ["sessions", "swipes", "matches", "blocks"]) { const sütun = t === "sessions" ? ["user_id"] : ["a", "b"]; for (const c of sütun) run(`DELETE FROM ${t} WHERE ${c}=?`, uid); }
    run("DELETE FROM messages WHERE frm=? OR to_=?", uid, uid); run("DELETE FROM profiles WHERE user_id=?", uid); run("DELETE FROM users WHERE id=?", uid);
    for (const w of online.get(uid) || []) w.close(4002, "silindi"); online.delete(uid); return json(res, 200, {});
  }
  if (m === "PUT" && yol === "/ben") {
    const v = profilDogrula(b); if (v.hata) return hata(res, 400, v.hata);
    const var_ = get("SELECT gizli FROM profiles WHERE user_id=?", uid);
    if (!var_ && b.riza !== true) return hata(res, 400, "Eşleştirme için cinsel yönelim bilgisinin işlenmesine açık rıza vermelisin.");
    run("INSERT INTO profiles(user_id,cins,ilgi_cins,data,riza_t,riza_v) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET cins=excluded.cins,ilgi_cins=excluded.ilgi_cins,data=excluded.data", uid, v.cins, v.ilgi_cins, JSON.stringify(v.data), Date.now(), RIZA_SURUMU);
    if (!var_) { // ilk profil: sana ilgi duyan birkaç demo hesap seni beğenmiş olsun
      const ben = v.data; const aday = BOTLAR.filter(x => v.ilgi_cins === "herkes" || x.cins === v.ilgi_cins)
        .sort((x, y) => y.ilgi.filter(i => ben.ilgi.includes(i)).length - x.ilgi.filter(i => ben.ilgi.includes(i)).length).slice(0, 6);
      for (const x of aday) run("INSERT OR IGNORE INTO swipes VALUES(?,?,?,?)", x.id, uid, "like", Date.now());
    }
    return json(res, 200, durum(uid));
  }
  if (m === "GET" && yol === "/verilerim") { // KVKK m.11: kişinin kendi verilerine erişimi
    const u = get("SELECT email,created FROM users WHERE id=?", uid), p = get("SELECT cins,ilgi_cins,gizli,riza_t,riza_v,data FROM profiles WHERE user_id=?", uid);
    return json(res, 200, {
      hesap: { id: uid, email: u.email, olusturma: new Date(u.created).toISOString() },
      profil: p ? { ...JSON.parse(p.data), cinsiyet: p.cins, ilgilenilen_cinsiyet: p.ilgi_cins, gizli_mod: !!p.gizli } : null,
      acik_riza: p?.riza_t ? { tarih: new Date(p.riza_t).toISOString(), metin_surumu: p.riza_v } : null,
      kararlarim: all("SELECT b hedef,tip,t FROM swipes WHERE a=?", uid),
      beni_begenen_sayisi: get("SELECT COUNT(*) n FROM swipes WHERE b=? AND tip IN ('like','super')", uid).n,
      eslesmeler: all("SELECT a,b,t FROM matches WHERE a=? OR b=?", uid, uid),
      mesajlar: all("SELECT frm gonderen,to_ alici,x metin,t zaman FROM messages WHERE frm=? OR to_=? ORDER BY id", uid, uid),
      engellediklerim: all("SELECT b FROM blocks WHERE a=?", uid).map(r => r.b),
      sikayetlerim: all("SELECT b,neden,t FROM reports WHERE a=?", uid)
    });
  }
  if (m === "PUT" && yol === "/gizli") { run("UPDATE profiles SET gizli=? WHERE user_id=?", b.gizli ? 1 : 0, uid); return json(res, 200, {}); }
  if (!get("SELECT 1 FROM profiles WHERE user_id=?", uid)) return hata(res, 400, "Önce profilini tamamla.");

  const hedef = typeof b.id === "string" ? b.id : typeof b.to === "string" ? b.to : "";
  const bilinen = hedef && hedef !== uid && get("SELECT 1 FROM profiles WHERE user_id=?", hedef);

  if (m === "POST" && yol === "/begeni") {
    if (!bilinen || engelli(uid, hedef)) return hata(res, 404, "Kullanıcı bulunamadı.");
    if (!["like", "pass", "super"].includes(b.tip)) return hata(res, 400, "Geçersiz işlem.");
    if (get("SELECT 1 FROM swipes WHERE a=? AND b=?", uid, hedef)) return hata(res, 409, "Zaten karar verdin.");
    if (b.tip === "super") {
      const bugun = new Date().toISOString().slice(0, 10), u = get("SELECT super_d,super_n FROM users WHERE id=?", uid), n = u.super_d === bugun ? u.super_n : 0;
      if (n >= GUNLUK_SUPER) return hata(res, 429, "Bugünkü süper beğeni hakkın bitti.");
      run("UPDATE users SET super_d=?,super_n=? WHERE id=?", bugun, n + 1, uid);
    }
    run("INSERT INTO swipes VALUES(?,?,?,?)", uid, hedef, b.tip, Date.now());
    let eslesti = false;
    if (b.tip !== "pass") {
      const bot = get("SELECT bot FROM users WHERE id=?", hedef).bot;
      if (bot && !begendi(hedef, uid) && hash(hedef + uid) % 100 < (b.tip === "super" ? 85 : 55)) run("INSERT OR IGNORE INTO swipes VALUES(?,?,?,?)", hedef, uid, "like", Date.now());
      if (begendi(hedef, uid) && !eslesmis(uid, hedef)) {
        const [x, y] = pair(uid, hedef); run("INSERT INTO matches VALUES(?,?,?)", x, y, Date.now()); eslesti = true;
        if (bot) botYaz(hedef, uid, null, 3000 + hash(hedef) % 3000);
        else yolla(hedef, { t: "match", id: uid, profil: pub(uid) });
      } else if (!bot) yolla(hedef, { t: "like", profil: pub(uid) });
    }
    return json(res, 200, { eslesti });
  }
  if (m === "POST" && yol === "/geri") {
    if (!bilinen || eslesmis(uid, hedef)) return hata(res, 409, "Geri alınamaz.");
    const s = get("SELECT tip FROM swipes WHERE a=? AND b=?", uid, hedef); if (!s) return hata(res, 404, "Karar bulunamadı.");
    run("DELETE FROM swipes WHERE a=? AND b=?", uid, hedef);
    if (s.tip === "super") run("UPDATE users SET super_n=MAX(0,super_n-1) WHERE id=?", uid);
    return json(res, 200, {});
  }
  if (m === "POST" && yol === "/engelle") {
    if (!bilinen) return hata(res, 404, "Kullanıcı bulunamadı.");
    run("INSERT OR IGNORE INTO blocks VALUES(?,?)", uid, hedef); const [x, y] = pair(uid, hedef); run("DELETE FROM matches WHERE a=? AND b=?", x, y);
    yolla(hedef, { t: "presence", id: uid, online: false }); return json(res, 200, {});
  }
  if (m === "POST" && yol === "/sikayet") {
    if (!bilinen) return hata(res, 404, "Kullanıcı bulunamadı."); run("INSERT INTO reports(a,b,neden,t) VALUES(?,?,?,?)", uid, hedef, String(b.neden || "").slice(0, 200), Date.now()); return json(res, 200, {});
  }
  if (m === "POST" && yol === "/mesaj") {
    const x = typeof b.text === "string" ? b.text.trim() : "";
    if (!bilinen || !eslesmis(uid, hedef) || engelli(uid, hedef)) return hata(res, 403, "Bu kişiyle eşleşmedin.");
    if (!x || x.length > 500) return hata(res, 400, "Mesaj 1-500 karakter olmalı.");
    if (!hizSiniri(uid, "mesaj", 60)) return hata(res, 429, "Çok hızlı mesaj gönderiyorsun.");
    const t = mesajKaydet(uid, hedef, x);
    if (get("SELECT bot FROM users WHERE id=?", hedef).bot) botYaz(hedef, uid, x, 700);
    return json(res, 200, { t });
  }
  if (m === "POST" && yol === "/okundu") { if (bilinen) run("UPDATE messages SET read=1 WHERE frm=? AND to_=?", hedef, uid); return json(res, 200, {}); }
  return hata(res, 404, "Bulunamadı.");
}

const server = http.createServer(async (req, res) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("content-security-policy", "default-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
  const u = new URL(req.url, "http://x"), yol = u.pathname;
  try {
    if (yol.startsWith("/api/")) return await api(req, res, yol.slice(4));
    const dosya = STATIC[yol];
    if (!dosya || req.method !== "GET") { res.writeHead(404); return res.end("Bulunamadı"); }
    res.writeHead(200, { "content-type": MIME[path.extname(dosya)], "cache-control": "no-cache" });
    fs.createReadStream(path.join(ROOT, dosya)).pipe(res);
  } catch (e) { console.error(e); if (!res.headersSent) hata(res, 500, "Sunucu hatası."); else res.end(); }
});
server.on("upgrade", (req, sock, head) => {
  if (new URL(req.url, "http://x").pathname !== "/ws") return sock.destroy();
  wss.handleUpgrade(req, sock, head, ws => wss.emit("connection", ws, req));
});
server.listen(PORT, () => console.log(`Eşleşme sunucusu: http://localhost:${PORT}`));
module.exports = { server, db };
