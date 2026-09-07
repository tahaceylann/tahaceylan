<?php
session_start();
require __DIR__ . '/lib.php';

$config = load_config();

// ---- Ilk kurulum sihirbazi -------------------------------------------
if (empty($config['setup_done'])) {
    $error = null;
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'setup') {
        $pass = $_POST['panel_password'] ?? '';
        if (strlen($pass) < 4) {
            $error = 'Şifre en az 4 karakter olmalı.';
        } else {
            $config['panel_password_hash'] = password_hash($pass, PASSWORD_DEFAULT);
            $config['setup_done'] = true;
            save_config($config);
            $_SESSION['authed'] = true;
            header('Location: index.php');
            exit;
        }
    }
    ?>
    <!doctype html><html><head><meta charset="utf-8">
    <title>Kurulum - Binance TR Trading Bot</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style><?php include __DIR__ . '/style.css'; ?></style>
    </head><body>
    <div class="login-wrap">
      <form method="post" class="login-box">
        <h2>🤖 İlk Kurulum</h2>
        <p class="muted">Web paneline giriş için bir şifre belirleyin.</p>
        <?php if ($error): ?><p class="error"><?= htmlspecialchars($error) ?></p><?php endif; ?>
        <input type="hidden" name="action" value="setup">
        <label>Panel Şifresi</label>
        <input type="password" name="panel_password" autofocus required>
        <button type="submit">Kurulumu Tamamla</button>
      </form>
    </div>
    </body></html>
    <?php
    exit;
}

// ---- Giris ekrani ------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'login') {
    if (password_verify($_POST['password'] ?? '', $config['panel_password_hash'])) {
        $_SESSION['authed'] = true;
        header('Location: index.php');
        exit;
    }
    $loginError = 'Yanlış şifre';
}

if (($_GET['logout'] ?? '') === '1') {
    session_destroy();
    header('Location: index.php');
    exit;
}

if (empty($_SESSION['authed'])) {
    ?>
    <!doctype html><html><head><meta charset="utf-8">
    <title>Giriş - Binance TR Trading Bot</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style><?php include __DIR__ . '/style.css'; ?></style>
    </head><body>
    <div class="login-wrap">
      <form method="post" class="login-box">
        <h2>🤖 Binance TR Trading Bot</h2>
        <?php if (!empty($loginError)): ?><p class="error"><?= htmlspecialchars($loginError) ?></p><?php endif; ?>
        <input type="hidden" name="action" value="login">
        <label>Panel Şifresi</label>
        <input type="password" name="password" autofocus required>
        <button type="submit">Giriş</button>
      </form>
    </div>
    </body></html>
    <?php
    exit;
}

// ---- Ayarlari kaydet -----------------------------------------------------
$saved = false;
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_settings') {
    $fields = [
        'symbol', 'interval', 'quote_order_size', 'stop_loss_pct', 'take_profit_pct',
        'max_daily_loss_pct', 'api_key', 'api_secret', 'telegram_bot_token', 'telegram_chat_id',
    ];
    foreach ($fields as $f) {
        if (isset($_POST[$f])) $config[$f] = $_POST[$f];
    }
    $config['dry_run'] = isset($_POST['dry_run']);
    save_config($config);
    $saved = true;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'toggle') {
    $config['enabled'] = ($_POST['enabled'] ?? '0') === '1';
    save_config($config);
    header('Location: index.php');
    exit;
}

$state = load_state();
$cronUrl = (isset($_SERVER['HTTPS']) ? 'https://' : 'http://') . $_SERVER['HTTP_HOST'] .
    dirname($_SERVER['SCRIPT_NAME']) . '/run.php?secret=' . urlencode($config['cron_secret']);
?>
<!doctype html><html><head><meta charset="utf-8">
<title>Binance TR Trading Bot</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style><?php include __DIR__ . '/style.css'; ?></style>
</head><body>
<header>
  <h1>🤖 Binance TR Trading Bot</h1>
  <div>
    <span class="dot <?= !empty($config['enabled']) ? 'on' : 'off' ?>"></span>
    <span><?= !empty($config['enabled']) ? ('Aktif (' . (!empty($config['dry_run']) ? 'DRY-RUN' : 'CANLI') . ')') : 'Durduruldu' ?></span>
    <a href="?logout=1" class="logout">Çıkış</a>
  </div>
</header>
<main>
  <div class="panel">
    <h3>Ayarlar</h3>
    <form method="post">
      <input type="hidden" name="action" value="save_settings">
      <label>İşlem çifti (örn. BTC_TRY)</label>
      <input type="text" name="symbol" value="<?= htmlspecialchars($config['symbol']) ?>">
      <label>Mum periyodu</label>
      <input type="text" name="interval" value="<?= htmlspecialchars($config['interval']) ?>">
      <label>Emir başı miktar</label>
      <input type="text" name="quote_order_size" value="<?= htmlspecialchars($config['quote_order_size']) ?>">
      <label>Stop-loss</label>
      <input type="text" name="stop_loss_pct" value="<?= htmlspecialchars($config['stop_loss_pct']) ?>">
      <label>Take-profit</label>
      <input type="text" name="take_profit_pct" value="<?= htmlspecialchars($config['take_profit_pct']) ?>">
      <label>Günlük zarar limiti</label>
      <input type="text" name="max_daily_loss_pct" value="<?= htmlspecialchars($config['max_daily_loss_pct']) ?>">
      <label>API Key</label>
      <input type="password" name="api_key" value="<?= htmlspecialchars($config['api_key']) ?>">
      <label>API Secret</label>
      <input type="password" name="api_secret" value="<?= htmlspecialchars($config['api_secret']) ?>">
      <label>Telegram Bot Token</label>
      <input type="password" name="telegram_bot_token" value="<?= htmlspecialchars($config['telegram_bot_token']) ?>">
      <label>Telegram Chat ID</label>
      <input type="text" name="telegram_chat_id" value="<?= htmlspecialchars($config['telegram_chat_id']) ?>">
      <div class="checkbox-row">
        <input type="checkbox" name="dry_run" id="dry_run" <?= !empty($config['dry_run']) ? 'checked' : '' ?>>
        <label for="dry_run" style="margin:0;">Dry-Run (gerçek emir yok)</label>
      </div>
      <button type="submit" class="btn-save">Ayarları Kaydet</button>
    </form>

    <form method="post" style="margin-top:8px;"
          onsubmit="return <?= empty($config['dry_run']) && empty($config['enabled']) ? 'confirm(\'DRY-RUN kapalı! Bot GERÇEK PARA ile işlem yapacak. Devam edilsin mi?\')' : 'true' ?>;">
      <input type="hidden" name="action" value="toggle">
      <input type="hidden" name="enabled" value="<?= !empty($config['enabled']) ? '0' : '1' ?>">
      <button type="submit" class="<?= !empty($config['enabled']) ? 'btn-stop' : 'btn-start' ?>">
        <?= !empty($config['enabled']) ? '■ DURDUR' : '▶ BAŞLAT' ?>
      </button>
    </form>
  </div>

  <div>
    <div class="cards">
      <div class="card"><div class="label">Pozisyon</div>
        <div class="value"><?= $state['position'] ? sprintf('%.6f @ %.2f', $state['position']['quantity'], $state['position']['entry_price']) : 'Yok' ?></div></div>
      <div class="card"><div class="label">Son Fiyat</div>
        <div class="value"><?= isset($state['last_price']) ? htmlspecialchars((string)$state['last_price']) : '-' ?></div></div>
      <div class="card"><div class="label">Günlük PnL</div>
        <div class="value">%<?= number_format(($state['daily_pnl_pct'] ?? 0) * 100, 2) ?></div></div>
    </div>

    <div class="panel">
      <h3>Cron Job Kurulumu</h3>
      <p class="muted">Hostinger hPanel → Gelişmiş → Cron Jobs bölümünden aşağıdaki komutu
        <b>her dakika</b> (veya izin verilen en kısa aralıkta) çalışacak şekilde ekleyin:</p>
      <code class="cronbox">php <?= htmlspecialchars(__DIR__) ?>/run.php</code>
      <p class="muted">Cron Jobs ekranında sadece URL tetikleme varsa (bazı paylaşımlı planlarda) bunun yerine:</p>
      <code class="cronbox"><?= htmlspecialchars($cronUrl) ?></code>
    </div>

    <div class="panel">
      <h3>Canlı Loglar <small class="muted">(son çalışma: <?= htmlspecialchars($state['last_check'] ?? '-') ?>)</small></h3>
      <div id="logs"><?php foreach (array_reverse(tail_log(150)) as $line) echo htmlspecialchars($line); ?></div>
    </div>
  </div>
</main>
<script>
setInterval(() => location.reload(), 30000); // 30 saniyede bir sayfa yenilenir
</script>
</body></html>
