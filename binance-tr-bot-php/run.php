<?php
/**
 * Cron giris noktasi - Hostinger hPanel > Cron Jobs'tan periyodik olarak
 * (1-5 dakikada bir) bu dosyayi calistirin:
 *
 *   php /home/KULLANICI/public_html/bot/run.php
 *
 * Web'den de tetiklenebilir (harici bir cron servisiyle) ama bu durumda
 * URL'yi tahmin edilemez yapmak icin CRON_SECRET kontrolu eklenmistir -
 * asagiya bakin.
 */
require __DIR__ . '/lib.php';

// Web uzerinden tetiklemeye izin ver (opsiyonel) - sadece dogru
// ?secret=... parametresi ile. CLI'dan (gercek cron) her zaman calisir.
if (php_sapi_name() !== 'cli') {
    $config = load_config();
    $secret = $config['cron_secret'] ?? '';
    if (empty($secret) || ($_GET['secret'] ?? '') !== $secret) {
        http_response_code(403);
        die('Forbidden');
    }
}

$config = load_config();

if (empty($config['setup_done'])) {
    bot_log('Kurulum tamamlanmadi, cron atlaniyor.');
    exit;
}
if (empty($config['enabled'])) {
    exit; // bot durdurulmus, sessizce cik
}

$state = load_state();
$today = date('Y-m-d');
if (($state['day'] ?? '') !== $today) {
    $state['day'] = $today;
    $state['daily_pnl_pct'] = 0.0;
    $state['trading_halted'] = false;
}
if (!empty($state['trading_halted'])) {
    bot_log('Gunluk zarar limiti asildi, islem yapilmiyor.');
    save_state($state);
    exit;
}

$client = new BinanceClient(
    $config['api_key'], $config['api_secret'],
    $config['trade_base_url'], $config['market_base_url']
);

try {
    $klines = $client->getKlines($config['symbol'], $config['interval'], 200);
} catch (ExchangeError $e) {
    bot_log('HATA: Piyasa verisi alinamadi: ' . $e->getMessage());
    exit;
}

if (empty($klines)) {
    bot_log('HATA: Bos mum verisi dondu.');
    exit;
}

$closes = array_map(fn($k) => (float) $k[4], $klines);
$price = end($closes);
$position = $state['position'] ?? null;

function log_trade(array $config, string $side, float $price, float $qty, string $reason): void {
    $line = sprintf('TRADE %s %s @ %.8g miktar=%.8g (%s)%s',
        $side, $config['symbol'], $price, $qty, $reason, $config['dry_run'] ? ' [DRY-RUN]' : '');
    bot_log($line);
    telegram_notify($config, ($config['dry_run'] ? '[DRY] ' : '') . $line);
}

if ($position) {
    [$exitFlag, $reason] = risk_should_exit($position, $price, $config);
    if (!$exitFlag) {
        $signal = generate_signal($closes, $config, true);
        if ($signal === 'SELL') { $exitFlag = true; $reason = 'signal'; }
    }
    $state['position'] = $position; // highest_price guncellemesi icin

    if ($exitFlag) {
        if (empty($config['dry_run'])) {
            try {
                $client->createMarketOrder($config['symbol'], 'SELL', null, $position['quantity']);
            } catch (ExchangeError $e) {
                bot_log('HATA: Satis emri basarisiz: ' . $e->getMessage());
                save_state($state);
                exit;
            }
        }
        $pnlPct = ($price - $position['entry_price']) / $position['entry_price'];
        $state['daily_pnl_pct'] = ($state['daily_pnl_pct'] ?? 0) + $pnlPct;
        if ($state['daily_pnl_pct'] <= -abs((float) $config['max_daily_loss_pct'])) {
            $state['trading_halted'] = true;
        }
        log_trade($config, 'SELL', $price, $position['quantity'], sprintf('%s pnl=%+.2f%%', $reason, $pnlPct * 100));
        $state['position'] = null;
    } else {
        bot_log(sprintf('%s | fiyat=%.8g | pozisyon=%.8g@%.8g | sinyal=HOLD',
            $config['symbol'], $price, $position['quantity'], $position['entry_price']));
    }
} else {
    $signal = generate_signal($closes, $config, false);
    bot_log(sprintf('%s | fiyat=%.8g | pozisyon=yok | sinyal=%s', $config['symbol'], $price, $signal));

    if ($signal === 'BUY') {
        $quoteSize = (float) $config['quote_order_size'];
        $qty = $quoteSize / $price;
        $fillPrice = $price;
        $fillQty = $qty;

        if (empty($config['dry_run'])) {
            try {
                $order = $client->createMarketOrder($config['symbol'], 'BUY', $quoteSize, null);
                // Binance TR emir yanitinda dolum bilgisi vermiyor, sorgulayalim
                if (!empty($order['orderId'])) {
                    sleep(2);
                    try {
                        $detail = $client->getOrder($config['symbol'], $order['orderId']);
                        if (!empty($detail['executedQty']) && !empty($detail['executedPrice'])) {
                            $fillQty = (float) $detail['executedQty'];
                            $fillPrice = (float) $detail['executedPrice'];
                        }
                    } catch (ExchangeError $e) {
                        bot_log('UYARI: Emir detayi sorgulanamadi: ' . $e->getMessage());
                    }
                }
            } catch (ExchangeError $e) {
                bot_log('HATA: Alis emri basarisiz: ' . $e->getMessage());
                save_state($state);
                exit;
            }
        }

        $state['position'] = [
            'symbol' => $config['symbol'],
            'entry_price' => $fillPrice,
            'quantity' => $fillQty,
            'highest_price' => $fillPrice,
        ];
        log_trade($config, 'BUY', $fillPrice, $fillQty, 'signal');
    }
}

$state['last_price'] = $price;
$state['last_check'] = date('Y-m-d H:i:s');
save_state($state);
