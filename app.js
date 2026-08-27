/* ==========================================================================
   Patron Ol! – İş İmparatorluğu Tycoon
   Tüm oyun mantığı, kayıt sistemi ve arayüz güncellemeleri burada.
   Harici kütüphane / build aracı yok: doğrudan tarayıcıda çalışır.
   ========================================================================== */
"use strict";

/* ==========================================================================
   1) AYARLANABİLİR OYUN VERİLERİ
   Dengelemeyi değiştirmek isteyen biri sadece bu bölümü düzenlemeli.
   ========================================================================== */

const GROWTH = 1.15;              // her birim alımda maliyet artış oranı
const MILESTONE_THRESHOLDS = [10, 25, 50, 100, 200, 300, 500, 750, 1000];
const PRESTIGE_DIVISOR = 1e9;     // prestij puanı = floor(sqrt(toplamKazanc / bu değer))
const SAVE_KEY = "patronOlTycoonSave_v1";
const AUTOSAVE_EVERY_TICKS = 50;  // 50 * 100ms = 5 sn
const ACHIEVEMENT_CHECK_EVERY_TICKS = 10; // 1 sn

const BUSINESSES = [
  { id: "simit",     name: "Simit Arabası",        icon: "🥨", baseCost: 10,                 baseRevenue: 1.2,              baseCycle: 1,  managerCost: 1000 },
  { id: "kahve",     name: "Kahveci",               icon: "☕", baseCost: 100,                baseRevenue: 9,                baseCycle: 2,  managerCost: 12000 },
  { id: "firin",     name: "Fırın",                 icon: "🍞", baseCost: 1200,               baseRevenue: 72,               baseCycle: 4,  managerCost: 150000 },
  { id: "restoran",  name: "Restoran",               icon: "🍽️", baseCost: 15000,              baseRevenue: 720,              baseCycle: 7,  managerCost: 2000000 },
  { id: "kuafor",    name: "Kuaför Zinciri",        icon: "💈", baseCost: 200000,             baseRevenue: 8200,             baseCycle: 10, managerCost: 26000000 },
  { id: "market",    name: "Market Zinciri",        icon: "🛒", baseCost: 2600000,            baseRevenue: 92000,            baseCycle: 14, managerCost: 340000000 },
  { id: "otel",      name: "Otel",                   icon: "🏨", baseCost: 34000000,           baseRevenue: 1050000,          baseCycle: 18, managerCost: 4400000000 },
  { id: "insaat",    name: "İnşaat Firması",        icon: "🏗️", baseCost: 440000000,          baseRevenue: 11500000,         baseCycle: 24, managerCost: 56000000000 },
  { id: "avm",       name: "AVM",                    icon: "🏬", baseCost: 5700000000,         baseRevenue: 132000000,        baseCycle: 30, managerCost: 720000000000 },
  { id: "fabrika",   name: "Fabrika",               icon: "🏭", baseCost: 74000000000,        baseRevenue: 1550000000,       baseCycle: 38, managerCost: 9300000000000 },
  { id: "banka",     name: "Banka",                  icon: "🏦", baseCost: 960000000000,       baseRevenue: 17500000000,      baseCycle: 46, managerCost: 120000000000000 },
  { id: "teknoloji", name: "Teknoloji Şirketi",     icon: "💻", baseCost: 12500000000000,     baseRevenue: 205000000000,     baseCycle: 55, managerCost: 1550000000000000 },
  { id: "gokdelen",  name: "Gökdelen İmparatorluğu", icon: "🌆", baseCost: 160000000000000,    baseRevenue: 2350000000000,    baseCycle: 65, managerCost: 20000000000000000 },
  { id: "uzay",      name: "Uzay Şirketi",          icon: "🚀", baseCost: 2100000000000000,   baseRevenue: 27500000000000,   baseCycle: 80, managerCost: 260000000000000000 },
];

const PERKS = [
  { id: "income",           name: "Küresel Sinerji",     icon: "📈", baseCost: 5,  maxLevel: 10, per: 0.05, unit: "%",  desc: lvl => `Tüm işletme geliri +%${Math.round(lvl * 5)}` },
  { id: "discount",         name: "Ucuz Genişleme",      icon: "🏷️", baseCost: 8,  maxLevel: 5,  per: 0.02, unit: "%",  desc: lvl => `Satın alma maliyetleri -%${Math.round(lvl * 2)}` },
  { id: "speed",            name: "Hız Ustası",          icon: "⚡", baseCost: 8,  maxLevel: 5,  per: 0.05, unit: "%",  desc: lvl => `Üretim süresi -%${Math.round(lvl * 5)}` },
  { id: "managerDiscount",  name: "Yönetici Anlaşması",  icon: "🤝", baseCost: 10, maxLevel: 5,  per: 0.10, unit: "%",  desc: lvl => `Yönetici maliyeti -%${Math.round(lvl * 10)}` },
  { id: "orbLuck",          name: "Şanslı Hediyeler",    icon: "🎁", baseCost: 6,  maxLevel: 5,  per: 0.20, unit: "%",  desc: lvl => `Bonus ödülleri +%${Math.round(lvl * 20)}` },
  { id: "offline",          name: "Offline Patron",      icon: "🌙", baseCost: 10, maxLevel: 5,  per: 1,    unit: "",   desc: lvl => `Offline süre sınırı ${2 + lvl * 2} saat, verim %${Math.min(100, 50 + lvl * 10)}` },
];

const ACHIEVEMENTS = [
  { id: "cash_1k",     icon: "🥉", name: "İlk Adım",            desc: "₺1.000 biriktir",              cond: s => s.cash >= 1e3 },
  { id: "cash_1m",     icon: "🥈", name: "Milyoner",             desc: "₺1.000.000 biriktir",           cond: s => s.cash >= 1e6 },
  { id: "cash_1b",     icon: "🥇", name: "Milyarder",            desc: "₺1 Milyar biriktir",            cond: s => s.cash >= 1e9 },
  { id: "cash_1t",     icon: "💠", name: "Trilyoner",            desc: "₺1 Trilyon biriktir",           cond: s => s.cash >= 1e12 },
  { id: "cash_1qa",    icon: "🌟", name: "Efsanevi Zenginlik",   desc: "₺1 Katrilyon biriktir",         cond: s => s.cash >= 1e15 },
  { id: "first_biz",   icon: "🏗️", name: "Girişimci",           desc: "İlk işletmeni satın al",        cond: s => Object.values(s.businesses).some(b => b.owned > 0) },
  { id: "own_simit_25",icon: "🥨", name: "Simitçi Kralı",       desc: "25 Simit Arabası'na sahip ol",  cond: s => s.businesses.simit.owned >= 25 },
  { id: "own_all_1",   icon: "🏙️", name: "İmparatorluk Kuruldu", desc: "Her işletmeden en az 1 tane al", cond: s => BUSINESSES.every(b => s.businesses[b.id].owned > 0) },
  { id: "first_manager", icon: "🤖", name: "İlk Yönetici",       desc: "İlk yöneticini işe al",          cond: s => Object.values(s.businesses).some(b => b.managers) },
  { id: "all_managers", icon: "⚙️", name: "Tam Otomasyon",       desc: "Her işletmeye yönetici ata",     cond: s => BUSINESSES.every(b => s.businesses[b.id].managers) },
  { id: "first_milestone", icon: "⭐", name: "İlk Yükseltme",     desc: "İlk x2 yükseltmeni satın al",   cond: s => Object.values(s.businesses).some(b => b.milestones > 0) },
  { id: "first_prestige", icon: "👑", name: "Yeniden Doğuş",     desc: "İlk kez yeniden yapılan",        cond: s => s.totalPrestiges >= 1 },
  { id: "prestige_10",  icon: "💎", name: "İmparator",            desc: "10 İmparatorluk Puanı'na ulaş", cond: s => s.prestigeEarnedTotal >= 10 },
  { id: "prestige_50",  icon: "🏵️", name: "Efsane Patron",       desc: "50 İmparatorluk Puanı'na ulaş", cond: s => s.prestigeEarnedTotal >= 50 },
  { id: "perk_bought",  icon: "🛠️", name: "Kalıcı Yatırımcı",    desc: "Bir kalıcı yatırım satın al",   cond: s => Object.values(s.perks).some(l => l > 0) },
  { id: "all_perks_maxed", icon: "🏆", name: "Stratejist",        desc: "Tüm kalıcı yatırımları maksimuma çıkar", cond: s => PERKS.every(p => (s.perks[p.id] || 0) >= p.maxLevel) },
  { id: "taps_100",    icon: "👆", name: "Çalışkan Patron",      desc: "100 kez elle tahsilat yap",     cond: s => s.totalTaps >= 100 },
  { id: "taps_1000",   icon: "✋", name: "Yorulmak Bilmeyen",    desc: "1.000 kez elle tahsilat yap",   cond: s => s.totalTaps >= 1000 },
  { id: "orbs_10",     icon: "🍀", name: "Şanslı Patron",        desc: "10 bonus ödülü topla",          cond: s => s.orbsClaimed >= 10 },
  { id: "offline_claim", icon: "🌙", name: "Uyurken Kazan",       desc: "Offline kazancını tahsil et",  cond: s => s.offlineClaims >= 1 },
];

/* ==========================================================================
   2) DURUM (STATE) YÖNETİMİ
   ========================================================================== */

function freshBusinessesState() {
  const out = {};
  BUSINESSES.forEach(b => {
    out[b.id] = { owned: 0, managers: false, milestones: 0, progress: 0, ready: false };
  });
  return out;
}

function freshState() {
  return {
    cash: 25,
    lifetimeEarnings: 0,
    prestigePoints: 0,          // harcanabilir / çarpan tabanı olan mevcut bakiye
    prestigeEarnedTotal: 0,     // hiç azalmayan, sadece prestij ile artan toplam
    totalPrestiges: 0,
    perks: {},
    businesses: freshBusinessesState(),
    achievementsUnlocked: [],
    totalTaps: 0,
    orbsClaimed: 0,
    offlineClaims: 0,
    tempBoostUntil: 0,
    buyMult: 10,
    settings: { sound: true, fx: true },
    lastSeen: Date.now(),
  };
}

let state = freshState();

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const loaded = JSON.parse(raw);
    const fresh = freshState();
    // sığ birleştirme + eksik alanlar için varsayılanları koru (ileride yeni alan eklenirse kırılmasın)
    state = Object.assign(fresh, loaded);
    state.settings = Object.assign(fresh.settings, loaded.settings || {});
    state.perks = Object.assign({}, loaded.perks || {});
    const mergedBiz = freshBusinessesState();
    Object.keys(mergedBiz).forEach(id => {
      if (loaded.businesses && loaded.businesses[id]) {
        Object.assign(mergedBiz[id], loaded.businesses[id]);
      }
    });
    state.businesses = mergedBiz;
    state.achievementsUnlocked = loaded.achievementsUnlocked || [];
  } catch (e) {
    console.warn("Kayıt okunamadı, yeni oyun başlatılıyor.", e);
  }
}

function saveState() {
  state.lastSeen = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Kayıt yazılamadı", e);
  }
}

/* ==========================================================================
   3) SAYI BİÇİMLENDİRME
   ========================================================================== */

const MONEY_UNITS = ["", "K", "M", "B", "T", "Ka", "Kn", "Sx", "Sp", "Oc", "No", "Dc"];

function fmt(n) {
  if (!isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  n = Math.abs(n);
  if (n < 1000) return sign + "₺" + Math.floor(n).toLocaleString("tr-TR");
  let idx = 0;
  while (n >= 1000 && idx < MONEY_UNITS.length - 1) {
    n /= 1000;
    idx++;
  }
  const decimals = n < 10 ? 2 : n < 100 ? 1 : 0;
  return sign + "₺" + n.toFixed(decimals) + MONEY_UNITS[idx];
}

function fmtPlain(n) {
  return Math.floor(n).toLocaleString("tr-TR");
}

/* ==========================================================================
   4) TÜREV HESAPLAMALAR (çarpanlar, maliyetler, gelirler)
   ========================================================================== */

function perkLevel(id) {
  return state.perks[id] || 0;
}

function prestigeMultiplier() {
  return 1 + state.prestigePoints * 0.02;
}
function achievementMultiplier() {
  return 1 + state.achievementsUnlocked.length * 0.01;
}
function perkIncomeMultiplier() {
  return 1 + perkLevel("income") * PERKS.find(p => p.id === "income").per;
}
function perkCostMultiplier() {
  return Math.max(0.8, 1 - perkLevel("discount") * PERKS.find(p => p.id === "discount").per);
}
function perkSpeedMultiplier() {
  return Math.max(0.7, 1 - perkLevel("speed") * PERKS.find(p => p.id === "speed").per);
}
function perkManagerCostMultiplier() {
  return Math.max(0.4, 1 - perkLevel("managerDiscount") * PERKS.find(p => p.id === "managerDiscount").per);
}
function perkOrbMultiplier() {
  return 1 + perkLevel("orbLuck") * PERKS.find(p => p.id === "orbLuck").per;
}
function offlineCapHours() {
  return 2 + perkLevel("offline") * 2;
}
function offlineEfficiency() {
  return Math.min(1, 0.5 + perkLevel("offline") * 0.10);
}
function tempBoostMultiplier() {
  return state.tempBoostUntil && state.tempBoostUntil > Date.now() ? 2 : 1;
}
function globalIncomeMultiplier() {
  return prestigeMultiplier() * achievementMultiplier() * perkIncomeMultiplier() * tempBoostMultiplier();
}

function isUnlocked(bizIndex) {
  if (bizIndex === 0) return true;
  const prev = BUSINESSES[bizIndex - 1];
  return state.businesses[prev.id].owned > 0;
}

function unitCost(bizDef, owned) {
  return bizDef.baseCost * Math.pow(GROWTH, owned) * perkCostMultiplier();
}

function costForQty(bizDef, owned, qty) {
  const a = bizDef.baseCost * perkCostMultiplier() * Math.pow(GROWTH, owned);
  if (qty <= 0) return 0;
  return a * (Math.pow(GROWTH, qty) - 1) / (GROWTH - 1);
}

function maxAffordableQty(bizDef, owned, budget) {
  const a = bizDef.baseCost * perkCostMultiplier() * Math.pow(GROWTH, owned);
  if (budget < a) return 0;
  const n = Math.log((budget * (GROWTH - 1)) / a + 1) / Math.log(GROWTH);
  return Math.max(0, Math.floor(n + 1e-9));
}

function businessCycleTime(bizDef) {
  return Math.max(0.2, bizDef.baseCycle * perkSpeedMultiplier());
}

function businessIncomePerCycle(bizDef, bs) {
  const milestoneMult = Math.pow(2, bs.milestones);
  return bizDef.baseRevenue * bs.owned * milestoneMult * globalIncomeMultiplier();
}

function managerCost(bizDef) {
  return bizDef.managerCost * perkManagerCostMultiplier();
}

function costForMilestone(bizDef, threshold) {
  return unitCost(bizDef, threshold) * 15;
}

function perkCost(perk, level) {
  return Math.ceil(perk.baseCost * Math.pow(2.2, level));
}

function totalPrestigePointsFormula() {
  return Math.floor(Math.sqrt(Math.max(0, state.lifetimeEarnings) / PRESTIGE_DIVISOR));
}

function addCash(amount) {
  state.cash += amount;
  state.lifetimeEarnings += amount;
}

/* ==========================================================================
   5) OYUN İŞLEMLERİ (satın alma, tahsilat, prestij)
   ========================================================================== */

function buyBusiness(id) {
  const idx = BUSINESSES.findIndex(b => b.id === id);
  if (idx === -1 || !isUnlocked(idx)) return;
  const bizDef = BUSINESSES[idx];
  const bs = state.businesses[id];
  const mult = state.buyMult;
  const qty = mult === "max" ? maxAffordableQty(bizDef, bs.owned, state.cash) : mult;
  const cost = costForQty(bizDef, bs.owned, qty);
  if (qty <= 0 || cost > state.cash) {
    toast("Yetersiz bakiye 💸");
    return;
  }
  state.cash -= cost;
  bs.owned += qty;
  playSound("buy");
  checkAchievements();
  renderBusinessList();
  updateHeader();
}

function buyManager(id) {
  const bizDef = BUSINESSES.find(b => b.id === id);
  const bs = state.businesses[id];
  if (bs.managers) return;
  if (bs.owned <= 0) {
    toast("Önce en az 1 tane satın almalısın");
    return;
  }
  const cost = managerCost(bizDef);
  if (state.cash < cost) {
    toast("Yetersiz bakiye 💸");
    return;
  }
  state.cash -= cost;
  bs.managers = true;
  bs.ready = false;
  playSound("manager");
  checkAchievements();
  renderBusinessList();
  updateHeader();
}

function buyMilestone(id) {
  const bizDef = BUSINESSES.find(b => b.id === id);
  const bs = state.businesses[id];
  if (bs.milestones >= MILESTONE_THRESHOLDS.length) return;
  const threshold = MILESTONE_THRESHOLDS[bs.milestones];
  if (bs.owned < threshold) return;
  const cost = costForMilestone(bizDef, threshold);
  if (state.cash < cost) {
    toast("Yetersiz bakiye 💸");
    return;
  }
  state.cash -= cost;
  bs.milestones++;
  playSound("milestone");
  checkAchievements();
  renderBusinessList();
  updateHeader();
}

function collectBusiness(id) {
  const bizDef = BUSINESSES.find(b => b.id === id);
  const bs = state.businesses[id];
  if (!bs.ready) return 0;
  const income = businessIncomePerCycle(bizDef, bs);
  addCash(income);
  bs.progress = 0;
  bs.ready = false;
  state.totalTaps++;
  playSound("collect");
  checkAchievements();
  return income;
}

function prestigeGainPreview() {
  return Math.max(0, totalPrestigePointsFormula() - state.prestigeEarnedTotal);
}

function doPrestige() {
  const gain = prestigeGainPreview();
  if (gain <= 0) {
    toast("Daha fazla puan kazanmak için önce biraz daha büyümelisin 📈");
    return;
  }
  state.prestigeEarnedTotal += gain;
  state.prestigePoints += gain;
  state.totalPrestiges++;
  state.cash = 25;
  state.businesses = freshBusinessesState();
  state.tempBoostUntil = 0;
  saveState();
  closeModal();
  checkAchievements();
  renderAll();
  toast(`🎉 Yeniden yapılanma tamam! +${fmtPlain(gain)} İmparatorluk Puanı`);
}

function buyPerk(id) {
  const perk = PERKS.find(p => p.id === id);
  const lvl = perkLevel(id);
  if (lvl >= perk.maxLevel) return;
  const cost = perkCost(perk, lvl);
  if (state.prestigePoints < cost) {
    toast("Yetersiz İmparatorluk Puanı 💎");
    return;
  }
  state.prestigePoints -= cost;
  state.perks[id] = lvl + 1;
  playSound("perk");
  checkAchievements();
  renderPrestigeTab();
  renderPerks();
  updateHeader();
}

/* ==========================================================================
   6) BAŞARIMLAR
   ========================================================================== */

function checkAchievements() {
  let changed = false;
  ACHIEVEMENTS.forEach(a => {
    if (state.achievementsUnlocked.includes(a.id)) return;
    if (a.cond(state)) {
      state.achievementsUnlocked.push(a.id);
      changed = true;
      toast(`🏆 Başarım: ${a.name}`);
      playSound("achievement");
    }
  });
  if (changed) {
    document.getElementById("achDot").classList.remove("hidden");
    renderAchievements();
  }
}

/* ==========================================================================
   7) BONUS ORB (rastgele ödül)
   ========================================================================== */

let nextOrbAt = Date.now() + randRange(30, 70) * 1000;

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function maybeSpawnBonusOrb() {
  const orb = document.getElementById("bonusOrb");
  if (!orb.classList.contains("hidden")) return;
  if (Date.now() < nextOrbAt) return;
  const content = document.getElementById("content");
  const maxX = window.innerWidth - 70;
  const maxY = content.clientHeight - 70;
  orb.style.left = Math.max(10, Math.random() * maxX) + "px";
  orb.style.top = (Math.max(10, Math.random() * maxY) + 90) + "px";
  orb.classList.remove("hidden");
}

function claimBonusOrb(e) {
  const orb = document.getElementById("bonusOrb");
  orb.classList.add("hidden");
  nextOrbAt = Date.now() + randRange(45, 90) * 1000;
  state.orbsClaimed++;
  playSound("orb");
  const roll = Math.random();
  if (roll < 0.5) {
    const perSec = currentAutoIncomePerSec();
    const gain = Math.max(500, perSec * randRange(30, 90)) * perkOrbMultiplier();
    addCash(gain);
    toast(`🎁 Bonus nakit: ${fmt(gain)}`);
    floatGain(e.clientX, e.clientY, "+" + fmt(gain), "var(--green)");
  } else {
    state.tempBoostUntil = Date.now() + 60000;
    toast("⚡ 60 saniye boyunca 2x gelir!");
    floatGain(e.clientX, e.clientY, "x2 GELİR!", "var(--accent)");
  }
  checkAchievements();
  updateHeader();
}

/* ==========================================================================
   8) OFFLINE KAZANÇ
   ========================================================================== */

function grantOfflineEarnings() {
  const elapsedMs = Date.now() - (state.lastSeen || Date.now());
  const elapsedSec = elapsedMs / 1000;
  if (elapsedSec < 60) return;
  const capSec = offlineCapHours() * 3600;
  const effectiveSec = Math.min(elapsedSec, capSec);
  const efficiency = offlineEfficiency();

  let total = 0;
  BUSINESSES.forEach(bizDef => {
    const bs = state.businesses[bizDef.id];
    if (bs.owned <= 0 || !bs.managers) return;
    const cycleTime = businessCycleTime(bizDef);
    const perSec = businessIncomePerCycle(bizDef, bs) / cycleTime;
    total += perSec * effectiveSec * efficiency;
  });

  if (total <= 0) return;
  addCash(total);
  state.offlineClaims++;
  checkAchievements();

  const hours = Math.floor(elapsedSec / 3600);
  const mins = Math.floor((elapsedSec % 3600) / 60);
  const timeStr = hours > 0 ? `${hours} saat ${mins} dk` : `${mins} dk`;
  showModal(`
    <div style="font-size:40px;">🌙</div>
    <h2>Hoş geldin, patron!</h2>
    <p>${timeStr} uzaktaydın. Otomatik işletmelerin senin için çalışmaya devam etti.</p>
    <div class="modal-big-num">+${fmt(total)}</div>
    <button class="btn btn-primary" onclick="closeModal()">Harika!</button>
  `);
}

function currentAutoIncomePerSec() {
  let total = 0;
  BUSINESSES.forEach(bizDef => {
    const bs = state.businesses[bizDef.id];
    if (bs.owned <= 0 || !bs.managers) return;
    total += businessIncomePerCycle(bizDef, bs) / businessCycleTime(bizDef);
  });
  return total;
}

/* ==========================================================================
   9) OYUN DÖNGÜSÜ
   ========================================================================== */

let tickCounter = 0;

function tick() {
  const dt = 0.1;
  let readyChanged = false;
  BUSINESSES.forEach(bizDef => {
    const bs = state.businesses[bizDef.id];
    if (bs.owned <= 0) return;
    const cycleTime = businessCycleTime(bizDef);
    if (bs.managers) {
      bs.progress += dt;
      let guard = 0;
      while (bs.progress >= cycleTime && guard < 1000) {
        addCash(businessIncomePerCycle(bizDef, bs));
        bs.progress -= cycleTime;
        guard++;
      }
    } else if (!bs.ready) {
      bs.progress += dt;
      if (bs.progress >= cycleTime) {
        bs.progress = cycleTime;
        bs.ready = true;
        readyChanged = true; // "Satın Al" butonunun "Topla" butonuna dönüşmesi gerekiyor
      }
    }
  });

  tickCounter++;
  updateHeader();
  if (readyChanged) renderBusinessList();
  tickUpdateBusinessUI();

  if (tickCounter % ACHIEVEMENT_CHECK_EVERY_TICKS === 0) {
    checkAchievements();
    maybeSpawnBonusOrb();
  }
  if (tickCounter % AUTOSAVE_EVERY_TICKS === 0) {
    saveState();
  }
}

/* ==========================================================================
   10) ARAYÜZ – ÜST BİLGİ ÇUBUĞU
   ========================================================================== */

function updateHeader() {
  document.getElementById("cashValue").textContent = fmt(state.cash);
  document.getElementById("incomeValue").textContent = fmt(currentAutoIncomePerSec()) + "/sn";
  const bonusPct = Math.round((prestigeMultiplier() - 1) * 100);
  document.getElementById("prestigeMultLabel").textContent = `+${bonusPct}%`;
  document.getElementById("prestigePointsLabel").textContent = fmtPlain(state.prestigePoints);
}

/* ==========================================================================
   11) ARAYÜZ – İŞLETME LİSTESİ
   ========================================================================== */

const bizRefs = {};

function renderBusinessList() {
  const container = document.getElementById("businessList");
  container.innerHTML = "";
  for (let i = 0; i < BUSINESSES.length; i++) {
    const bizDef = BUSINESSES[i];
    const bs = state.businesses[bizDef.id];
    const unlocked = isUnlocked(i);

    const card = document.createElement("div");
    card.className = "biz-card" + (unlocked ? "" : " locked");
    card.dataset.id = bizDef.id;

    if (!unlocked) {
      const prevName = BUSINESSES[i - 1].name;
      card.innerHTML = `
        <div class="biz-icon">🔒</div>
        <div class="biz-locked-text">Kilidi açmak için <b>${prevName}</b> satın al</div>
      `;
      container.appendChild(card);
      continue;
    }

    const cycleTime = businessCycleTime(bizDef);
    const income = businessIncomePerCycle(bizDef, bs);
    const nextMilestoneIdx = bs.milestones;
    const hasMoreMilestones = nextMilestoneIdx < MILESTONE_THRESHOLDS.length;
    const nextThreshold = hasMoreMilestones ? MILESTONE_THRESHOLDS[nextMilestoneIdx] : null;
    const milestoneReached = hasMoreMilestones && bs.owned >= nextThreshold;

    card.innerHTML = `
      <div class="biz-progress-fill" data-ref="fill"></div>
      <div class="biz-icon">${bizDef.icon}</div>
      <div class="biz-main">
        <div class="biz-name-row">
          <span class="biz-name">${bizDef.name}</span>
          <span class="biz-owned" data-ref="owned">${bs.owned} adet</span>
          ${bs.managers ? '<span class="biz-manager-tag">🤖 Otomatik</span>' : ""}
        </div>
        <div class="biz-sub" data-ref="sub">${fmt(income)} / ${cycleTime.toFixed(1)}sn${bs.milestones > 0 ? ` · x${Math.pow(2, bs.milestones)}` : ""}</div>
        ${!milestoneReached && hasMoreMilestones ? `<div class="biz-next-hint">sonraki yükseltme: ${nextThreshold} adet</div>` : ""}
      </div>
      <div class="biz-actions">
        ${bs.ready && !bs.managers
          ? `<button class="biz-collect-btn" data-action="collect" data-id="${bizDef.id}">Topla ${fmt(income)}</button>`
          : `<button class="biz-buy-btn" data-action="buy" data-id="${bizDef.id}" data-ref="buyBtn"></button>`
        }
        ${!bs.managers ? `<button class="biz-manager-btn" data-action="manager" data-id="${bizDef.id}" data-ref="managerBtn"></button>` : ""}
        ${milestoneReached ? `<button class="biz-milestone-btn" data-action="milestone" data-id="${bizDef.id}" data-ref="milestoneBtn"></button>` : ""}
      </div>
    `;
    container.appendChild(card);

    bizRefs[bizDef.id] = {
      card,
      fill: card.querySelector('[data-ref="fill"]'),
      owned: card.querySelector('[data-ref="owned"]'),
      sub: card.querySelector('[data-ref="sub"]'),
      buyBtn: card.querySelector('[data-ref="buyBtn"]'),
      managerBtn: card.querySelector('[data-ref="managerBtn"]'),
      milestoneBtn: card.querySelector('[data-ref="milestoneBtn"]'),
    };
  }
  refreshBuyButtonsText();
}

function refreshBuyButtonsText() {
  BUSINESSES.forEach((bizDef, i) => {
    const refs = bizRefs[bizDef.id];
    if (!refs) return;
    const bs = state.businesses[bizDef.id];

    if (refs.buyBtn) {
      const mult = state.buyMult;
      const qty = mult === "max" ? maxAffordableQty(bizDef, bs.owned, state.cash) : mult;
      const cost = costForQty(bizDef, bs.owned, qty);
      const label = mult === "max" ? (qty > 0 ? `${qty}x Al` : "Yetersiz") : `${mult}x Al`;
      refs.buyBtn.innerHTML = `${label}<small>${qty > 0 ? fmt(cost) : ""}</small>`;
      refs.buyBtn.disabled = qty <= 0 || cost > state.cash;
    }
    if (refs.managerBtn) {
      const cost = managerCost(bizDef);
      refs.managerBtn.textContent = `🤖 Yönetici ${fmt(cost)}`;
      refs.managerBtn.disabled = bs.owned <= 0 || state.cash < cost;
    }
    if (refs.milestoneBtn) {
      const threshold = MILESTONE_THRESHOLDS[bs.milestones];
      const cost = costForMilestone(bizDef, threshold);
      refs.milestoneBtn.textContent = `⭐ x${Math.pow(2, bs.milestones + 1)} Yükselt ${fmt(cost)}`;
      refs.milestoneBtn.disabled = state.cash < cost;
    }
  });
}

let uiRefreshCounter = 0;

function tickUpdateBusinessUI() {
  BUSINESSES.forEach(bizDef => {
    const refs = bizRefs[bizDef.id];
    if (!refs) return;
    const bs = state.businesses[bizDef.id];
    const cycleTime = businessCycleTime(bizDef);
    const pct = Math.min(100, (bs.progress / cycleTime) * 100);
    refs.fill.style.width = pct + "%";
    refs.card.classList.toggle("ready", !!bs.ready);
  });
  // Buton metinlerini (fiyat/affordability) saniyede birkaç kez tazele — her tick'te değil (performans).
  uiRefreshCounter++;
  if (uiRefreshCounter % 3 === 0) refreshBuyButtonsText();
}

/* ==========================================================================
   12) ARAYÜZ – PRESTİJ & KALICI YATIRIMLAR
   ========================================================================== */

function renderPrestigeTab() {
  document.getElementById("prestigeGainPreview").textContent = "+" + fmtPlain(prestigeGainPreview());
  document.getElementById("prestigeCurrentBonus").textContent = `+${Math.round((prestigeMultiplier() - 1) * 100)}%`;
  const previewMult = 1 + (state.prestigePoints + prestigeGainPreview()) * 0.02;
  document.getElementById("prestigeNewBonus").textContent = `+${Math.round((previewMult - 1) * 100)}%`;
}

function renderPerks() {
  const list = document.getElementById("perkList");
  list.innerHTML = "";
  PERKS.forEach(perk => {
    const lvl = perkLevel(perk.id);
    const maxed = lvl >= perk.maxLevel;
    const cost = maxed ? 0 : perkCost(perk, lvl);
    const row = document.createElement("div");
    row.className = "perk-card";
    row.innerHTML = `
      <div class="perk-icon">${perk.icon}</div>
      <div class="perk-main">
        <div class="perk-name">${perk.name} <span style="color:var(--text-faint); font-weight:600;">Lv.${lvl}/${perk.maxLevel}</span></div>
        <div class="perk-desc">${perk.desc(lvl)}</div>
      </div>
      <button class="perk-buy ${maxed ? "maxed" : ""}" data-action="perk" data-id="${perk.id}" ${maxed || state.prestigePoints < cost ? "disabled" : ""}>
        ${maxed ? "MAKS ✓" : `💎 ${cost}`}
      </button>
    `;
    list.appendChild(row);
  });
}

/* ==========================================================================
   13) ARAYÜZ – BAŞARIMLAR
   ========================================================================== */

function renderAchievements() {
  const list = document.getElementById("achievementList");
  list.innerHTML = "";
  let unlockedCount = 0;
  ACHIEVEMENTS.forEach(a => {
    const unlocked = state.achievementsUnlocked.includes(a.id);
    if (unlocked) unlockedCount++;
    const row = document.createElement("div");
    row.className = "ach-card" + (unlocked ? " unlocked" : "");
    row.innerHTML = `
      <div class="ach-icon">${unlocked ? a.icon : "❔"}</div>
      <div class="ach-main">
        <div class="ach-name">${a.name}</div>
        <div class="ach-desc">${a.desc}</div>
      </div>
      ${unlocked ? '<div class="ach-check">✔️</div>' : ""}
    `;
    list.appendChild(row);
  });
  document.getElementById("achProgress").textContent = `${unlockedCount} / ${ACHIEVEMENTS.length} tamamlandı`;
}

/* ==========================================================================
   14) SEKME GEÇİŞİ
   ========================================================================== */

function switchTab(tabName) {
  document.querySelectorAll(".tab-panel").forEach(p => {
    p.hidden = p.dataset.tab !== tabName;
  });
  document.querySelectorAll(".tab-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tabName);
  });
  if (tabName === "achievements") {
    document.getElementById("achDot").classList.add("hidden");
  }
  document.getElementById("content").scrollTop = 0;
}

/* ==========================================================================
   15) TOAST / FLOAT / MODAL YARDIMCILARI
   ========================================================================== */

function toast(msg) {
  const area = document.getElementById("toastArea");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  area.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function floatGain(x, y, text, color) {
  if (!state.settings.fx) return;
  const el = document.createElement("div");
  el.className = "float-gain";
  el.textContent = text;
  el.style.left = x + "px";
  el.style.top = y + "px";
  if (color) el.style.color = color;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

function showModal(html) {
  document.getElementById("modalBox").innerHTML = html;
  document.getElementById("modalOverlay").classList.remove("hidden");
}
function closeModal() {
  document.getElementById("modalOverlay").classList.add("hidden");
}

/* ==========================================================================
   16) SES (WebAudio ile basit efektler, harici dosya gerekmez)
   ========================================================================== */

let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}

const SOUND_FREQS = {
  buy: 420, manager: 520, milestone: 700, collect: 600,
  achievement: 880, perk: 760, orb: 980,
};

function playSound(kind) {
  if (!state.settings.sound) return;
  if (!audioCtx) return;
  const freq = SOUND_FREQS[kind] || 500;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.25);
}

/* ==========================================================================
   17) TAM ARAYÜZ YENİLEME + BAŞLATMA
   ========================================================================== */

function renderAll() {
  updateHeader();
  renderBusinessList();
  renderPrestigeTab();
  renderPerks();
  renderAchievements();
}

function wireEvents() {
  document.getElementById("tabbar").addEventListener("click", e => {
    const btn = e.target.closest(".tab-btn");
    if (btn) switchTab(btn.dataset.tab);
  });

  document.getElementById("buyMultRow").addEventListener("click", e => {
    const btn = e.target.closest(".buy-mult-btn");
    if (!btn) return;
    document.querySelectorAll(".buy-mult-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const val = btn.dataset.mult;
    state.buyMult = val === "max" ? "max" : parseInt(val, 10);
    refreshBuyButtonsText();
  });

  document.getElementById("businessList").addEventListener("click", e => {
    ensureAudio();
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    const rect = btn.getBoundingClientRect();
    if (action === "buy") buyBusiness(id);
    else if (action === "manager") buyManager(id);
    else if (action === "milestone") buyMilestone(id);
    else if (action === "collect") {
      const gained = collectBusiness(id);
      if (gained > 0) floatGain(rect.left + rect.width / 2, rect.top, "+" + fmt(gained), "var(--green)");
      renderBusinessList();
      updateHeader();
    }
  });

  document.getElementById("perkList").addEventListener("click", e => {
    ensureAudio();
    const btn = e.target.closest("button[data-action='perk']");
    if (btn) buyPerk(btn.dataset.id);
  });

  document.getElementById("prestigeBtn").addEventListener("click", () => {
    ensureAudio();
    const gain = prestigeGainPreview();
    if (gain <= 0) {
      toast("Daha fazla puan kazanmak için önce biraz daha büyümelisin 📈");
      return;
    }
    showModal(`
      <div style="font-size:40px;">👑</div>
      <h2>Yeniden Yapılanma</h2>
      <p>Tüm işletmelerin ve kasandaki nakit sıfırlanacak. Karşılığında kalıcı olarak</p>
      <div class="modal-big-num">+${fmtPlain(gain)} 💎</div>
      <p>İmparatorluk Puanı kazanacaksın. Başarımların ve kalıcı yatırımların korunur.</p>
      <button class="btn btn-primary" onclick="doPrestige()">Onayla ve Yeniden Yapılan</button>
      <button class="btn btn-secondary" onclick="closeModal()">Vazgeç</button>
    `);
  });

  document.getElementById("bonusOrb").addEventListener("click", e => {
    ensureAudio();
    claimBonusOrb(e);
  });

  document.getElementById("soundToggle").addEventListener("change", e => {
    state.settings.sound = e.target.checked;
    if (e.target.checked) ensureAudio();
    saveState();
  });
  document.getElementById("fxToggle").addEventListener("change", e => {
    state.settings.fx = e.target.checked;
    saveState();
  });

  document.getElementById("exportBtn").addEventListener("click", () => {
    const data = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
    showModal(`
      <h2>💾 Kayıt Dışa Aktarımı</h2>
      <p>Aşağıdaki metni kopyalayıp güvenli bir yerde sakla:</p>
      <textarea readonly onclick="this.select()">${data}</textarea>
      <button class="btn btn-primary" onclick="closeModal()">Tamam</button>
    `);
  });

  document.getElementById("importBtn").addEventListener("click", () => {
    showModal(`
      <h2>📥 Kayıt İçe Aktarımı</h2>
      <p>Daha önce dışa aktardığın kod metnini buraya yapıştır:</p>
      <textarea id="importArea" placeholder="Kod metnini buraya yapıştır..."></textarea>
      <button class="btn btn-primary" id="importConfirmBtn">İçe Aktar</button>
      <button class="btn btn-secondary" onclick="closeModal()">Vazgeç</button>
    `);
    document.getElementById("importConfirmBtn").addEventListener("click", () => {
      const raw = document.getElementById("importArea").value.trim();
      try {
        const parsed = JSON.parse(decodeURIComponent(escape(atob(raw))));
        state = Object.assign(freshState(), parsed);
        saveState();
        closeModal();
        renderAll();
        toast("✅ Kayıt başarıyla içe aktarıldı");
      } catch (err) {
        toast("❌ Geçersiz kayıt kodu");
      }
    });
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    showModal(`
      <div style="font-size:40px;">⚠️</div>
      <h2>Oyunu Sıfırla</h2>
      <p>Tüm ilerlemen (nakit, işletmeler, prestij, başarımlar) kalıcı olarak silinecek. Bu işlem geri alınamaz!</p>
      <button class="btn btn-danger" id="confirmResetBtn">Evet, Her Şeyi Sil</button>
      <button class="btn btn-secondary" onclick="closeModal()">Vazgeç</button>
    `);
    document.getElementById("confirmResetBtn").addEventListener("click", () => {
      localStorage.removeItem(SAVE_KEY);
      state = freshState();
      closeModal();
      renderAll();
      toast("🔄 Oyun sıfırlandı");
    });
  });

  document.getElementById("modalOverlay").addEventListener("click", e => {
    if (e.target.id === "modalOverlay") closeModal();
  });

  document.getElementById("installHintClose").addEventListener("click", () => {
    document.getElementById("installHint").classList.add("hidden");
    try { localStorage.setItem("patronOlInstallHintDismissed", "1"); } catch (e) {}
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveState();
  });
  window.addEventListener("pagehide", saveState);
  window.addEventListener("beforeunload", saveState);
}

function maybeShowInstallHint() {
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (isStandalone) return;
  let dismissed = false;
  try { dismissed = localStorage.getItem("patronOlInstallHintDismissed") === "1"; } catch (e) {}
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  if (!dismissed && isIOS) {
    document.getElementById("installHint").classList.remove("hidden");
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
}

function init() {
  loadState();
  grantOfflineEarnings();
  wireEvents();
  renderAll();
  maybeShowInstallHint();
  registerServiceWorker();
  setInterval(tick, 100);

  const splashFill = document.getElementById("splashBarFill");
  requestAnimationFrame(() => { splashFill.style.width = "100%"; });
  setTimeout(() => {
    document.getElementById("splash").style.display = "none";
    document.getElementById("app").classList.remove("hidden");
  }, 1500);
}

document.addEventListener("DOMContentLoaded", init);
