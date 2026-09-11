/* ==========================================================================
   Oto-Tıklayıcı — Fiziksel Otomatik Dokunma Cihazı
   ESP32 + servo motor ile telefon ekranına gerçekten dokunan, Wi-Fi
   üzerinden telefonundan (Safari'den) kontrol edilen bir oto-tıklayıcı.

   iOS bir uygulamanın başka bir uygulamaya dokunuş göndermesine izin
   vermediği için (jailbreak olmadan) bu iş yazılımla değil, fiziksel
   bir dokunuşla çözülüyor: servo kolun ucundaki iletken uç ekrana
   gerçekten "parmak gibi" dokunuyor. Bu sayede açık olan HANGİ uygulama
   olursa olsun (oyun dahil) çalışır — çünkü telefon açısından gerçek bir
   dokunuştan farksızdır.

   Kurulum ve montaj talimatları: ../../README.md
   ========================================================================== */

#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>
#include <esp_system.h>  // esp_random() için

/* ==========================================================================
   1) AYARLAR — kendi kurulumuna göre değiştirebileceğin sabitler
   ========================================================================== */

// Telefonundan bağlanacağın Wi-Fi ağının adı/şifresi (şifre en az 8 karakter olmalı).
const char *AP_SSID     = "OtoTiklayici";
const char *AP_PASSWORD = "tiklatiklat";

// Servo sinyal kablosunun bağlı olduğu GPIO. 0, 2, 12, 15 gibi "strapping"
// pinlerini KULLANMA (ESP32'nin açılışını etkileyebilirler) — 13 çoğu
// geliştirme kartında güvenlidir.
const int SERVO_PIN = 13;

// Servonun iki ucu: "dinlenme" (ekrana değmediği) ve "dokunma" (ekrana
// değdiği) açıları. Kendi montajına göre bu iki değeri elle bulup
// ayarlaman gerekecek (bkz. README → Kalibrasyon).
const int REST_ANGLE = 90;
const int TAP_ANGLE  = 60;

// Varsayılan zamanlama — bunların hepsi web kontrol panelinden de
// çalışırken değiştirilebilir, burası sadece açılış değerleri.
unsigned long intervalMs  = 800;  // iki dokunuş arası süre
unsigned long pressMs     = 90;   // dokunuşun ekranda kalma süresi
int jitterPercent         = 15;   // aralığa eklenen rastgele sapma (%) — sabit
                                   // milisaniyede basmak yerine biraz doğal
                                   // sapma, dokunmanın ekran tarafından daha
                                   // güvenilir algılanmasına yardımcı olur
unsigned long autoStopMin = 30;   // dakika cinsinden oto-kapanma (0 = kapalı) —
                                   // unutup uzun süre açık bırakmana karşı

/* ==========================================================================
   2) DURUM
   ========================================================================== */

Servo tapServo;
WebServer server(80);

bool running = false;

enum TapPhase { PHASE_IDLE, PHASE_PRESSING };
TapPhase phase = PHASE_IDLE;

unsigned long phaseUntil = 0;   // PHASE_PRESSING ne zaman bitecek
unsigned long nextTapAt  = 0;   // sıradaki dokunuş ne zaman başlayacak
unsigned long startedAt  = 0;   // Başlat'a en son ne zaman basıldı
unsigned long totalTaps  = 0;   // bu çalıştırmada yapılan toplam dokunuş

/* ==========================================================================
   3) KONTROL PANELİ (telefonda Safari'de açılan tek sayfalık arayüz)
   ========================================================================== */

const char INDEX_HTML[] PROGMEM = R"HTMLPAGE(
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Oto-Tıklayıcı</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0; padding: 24px 20px 40px;
    background: linear-gradient(160deg,#1a1030,#0c0818 60%);
    color: #f3f0ff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    min-height: 100vh;
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #b6adcf; font-size: 13px; margin-bottom: 20px; }
  .status-pill {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 14px; border-radius: 999px; font-weight: 600; font-size: 14px;
    background: #3a3350; margin-bottom: 20px;
  }
  .status-pill.on { background: #1f5c3a; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #ff5566; }
  .status-pill.on .dot { background: #4ee08a; box-shadow: 0 0 8px #4ee08a; }
  .stats { display: flex; gap: 12px; margin-bottom: 16px; }
  .stat { flex: 1; text-align: center; background: #221a3a; border-radius: 14px; padding: 14px 8px; border: 1px solid #372c57; }
  .stat b { display: block; font-size: 22px; }
  .stat span { font-size: 12px; color: #b6adcf; }
  button.big {
    width: 100%; padding: 18px; border: none; border-radius: 16px;
    font-size: 18px; font-weight: 700; color: #fff; background: #6d28d9;
  }
  button.big.stop { background: #b91c1c; }
  button.big:active { transform: scale(0.98); }
  .card {
    background: #221a3a; border-radius: 18px; padding: 18px;
    margin-top: 18px; border: 1px solid #372c57;
  }
  .row { display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
  .row b { color: #fff; }
  input[type=range] { width: 100%; accent-color: #8b5cf6; margin: 6px 0 14px; }
  .warn { font-size: 12px; color: #8a7fae; line-height: 1.5; margin-top: 16px; }
</style>
</head>
<body>
  <h1>🤖 Oto-Tıklayıcı</h1>
  <div class="sub">ESP32 servo kontrol paneli</div>

  <div class="status-pill" id="pill"><span class="dot"></span><span id="pillText">Durduruldu</span></div>

  <div class="stats">
    <div class="stat"><b id="statTaps">0</b><span>dokunuş</span></div>
    <div class="stat"><b id="statTime">0:00</b><span>geçen süre</span></div>
  </div>

  <button class="big" id="toggleBtn" onclick="toggle()">Başlat</button>

  <div class="card">
    <div class="row"><span>Dokunuşlar arası süre</span><b id="lblInterval">800 ms</b></div>
    <input type="range" id="interval" min="150" max="5000" step="50" value="800"
           oninput="lblInterval.textContent=this.value+' ms'" onchange="sendConfig()">

    <div class="row"><span>Basma süresi</span><b id="lblPress">90 ms</b></div>
    <input type="range" id="press" min="40" max="400" step="10" value="90"
           oninput="lblPress.textContent=this.value+' ms'" onchange="sendConfig()">

    <div class="row"><span>Rastgelelik</span><b id="lblJitter">%15</b></div>
    <input type="range" id="jitter" min="0" max="50" step="5" value="15"
           oninput="lblJitter.textContent='%'+this.value" onchange="sendConfig()">

    <div class="row"><span>Oto-kapanma</span><b id="lblAuto">30 dk</b></div>
    <input type="range" id="autostop" min="0" max="120" step="5" value="30"
           oninput="lblAuto.textContent=(this.value=='0'?'kapalı':this.value+' dk')" onchange="sendConfig()">
  </div>

  <p class="warn">
    ⚠️ Başlatmadan önce telefonunun <b>Otomatik Kilit</b>'ini "Hiçbir Zaman" yap
    (Ayarlar → Ekran ve Parlaklık), yoksa ekran kararınca dokunuşlar boşa gider.
    Uzun süre çalıştıracaksan telefonu şarja tak.
  </p>

<script>
let running = false;

async function refresh() {
  try {
    const r = await fetch('/api/status');
    const s = await r.json();
    running = s.running;
    document.getElementById('pill').className = 'status-pill' + (running ? ' on' : '');
    document.getElementById('pillText').textContent = running ? 'Çalışıyor' : 'Durduruldu';
    const btn = document.getElementById('toggleBtn');
    btn.textContent = running ? 'Durdur' : 'Başlat';
    btn.className = 'big' + (running ? ' stop' : '');
    document.getElementById('statTaps').textContent = s.totalTaps;
    const sec = Math.floor(s.elapsedMs / 1000);
    document.getElementById('statTime').textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  } catch (e) { /* geçici ağ hatalarını sessizce yut */ }
}

async function toggle() {
  await fetch(running ? '/api/stop' : '/api/start');
  refresh();
}

async function sendConfig() {
  const i = document.getElementById('interval').value;
  const p = document.getElementById('press').value;
  const j = document.getElementById('jitter').value;
  const a = document.getElementById('autostop').value;
  await fetch(`/api/config?interval=${i}&press=${p}&jitter=${j}&autostop=${a}`);
}

setInterval(refresh, 1000);
refresh();
</script>
</body>
</html>
)HTMLPAGE";

/* ==========================================================================
   4) HTTP UÇ NOKTALARI
   ========================================================================== */

void handleRoot() {
  server.send_P(200, "text/html; charset=utf-8", INDEX_HTML);
}

void handleStatus() {
  unsigned long elapsed = running ? (millis() - startedAt) : 0;
  String json = "{";
  json += "\"running\":";    json += running ? "true" : "false";
  json += ",\"intervalMs\":"; json += intervalMs;
  json += ",\"pressMs\":";    json += pressMs;
  json += ",\"jitterPercent\":"; json += jitterPercent;
  json += ",\"autoStopMin\":"; json += autoStopMin;
  json += ",\"totalTaps\":";  json += totalTaps;
  json += ",\"elapsedMs\":";  json += elapsed;
  json += "}";
  server.send(200, "application/json", json);
}

void handleStart() {
  running = true;
  startedAt = millis();
  totalTaps = 0;
  phase = PHASE_IDLE;
  nextTapAt = millis() + 500;  // ilk dokunuştan önce küçük bir hazırlık payı
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleStop() {
  running = false;
  phase = PHASE_IDLE;
  tapServo.write(REST_ANGLE);
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleConfig() {
  if (server.hasArg("interval")) intervalMs  = constrain(server.arg("interval").toInt(), 150, 10000);
  if (server.hasArg("press"))    pressMs     = constrain(server.arg("press").toInt(), 40, 500);
  if (server.hasArg("jitter"))   jitterPercent = constrain(server.arg("jitter").toInt(), 0, 50);
  if (server.hasArg("autostop")) autoStopMin = constrain(server.arg("autostop").toInt(), 0, 240);
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleNotFound() {
  server.send(404, "text/plain", "Bulunamadi");
}

/* ==========================================================================
   5) DOKUNMA DÖNGÜSÜ (non-blocking — millis() tabanlı, web sunucusunu
      bloklamaz)
   ========================================================================== */

long randomJitter() {
  if (jitterPercent <= 0) return 0;
  long span = (long)intervalMs * jitterPercent / 100;
  if (span <= 0) return 0;
  return random(-span, span + 1);
}

void startTapIfDue() {
  if (!running || phase != PHASE_IDLE) return;
  // (long) farkı millis() taşmasında (~49,7 günde bir) bile doğru çalışır
  if ((long)(millis() - nextTapAt) < 0) return;
  tapServo.write(TAP_ANGLE);
  phase = PHASE_PRESSING;
  phaseUntil = millis() + pressMs;
}

void updateTapPhase() {
  if (phase != PHASE_PRESSING) return;
  if ((long)(millis() - phaseUntil) < 0) return;
  tapServo.write(REST_ANGLE);
  phase = PHASE_IDLE;
  totalTaps++;
  nextTapAt = millis() + intervalMs + randomJitter();

  if (autoStopMin > 0 && (millis() - startedAt) >= autoStopMin * 60000UL) {
    running = false;
  }
}

/* ==========================================================================
   6) KURULUM & ANA DÖNGÜ
   ========================================================================== */

void setup() {
  Serial.begin(115200);

  tapServo.setPeriodHertz(50);
  tapServo.attach(SERVO_PIN, 500, 2400);
  tapServo.write(REST_ANGLE);

  WiFi.softAP(AP_SSID, AP_PASSWORD);
  Serial.println();
  Serial.print("Wi-Fi agi yayinda: ");
  Serial.println(AP_SSID);
  Serial.print("Kontrol paneli: http://");
  Serial.println(WiFi.softAPIP());

  server.on("/", handleRoot);
  server.on("/api/status", handleStatus);
  server.on("/api/start", handleStart);
  server.on("/api/stop", handleStop);
  server.on("/api/config", handleConfig);
  server.onNotFound(handleNotFound);
  server.begin();

  randomSeed(esp_random());
}

void loop() {
  server.handleClient();
  startTapIfDue();
  updateTapPhase();
}
