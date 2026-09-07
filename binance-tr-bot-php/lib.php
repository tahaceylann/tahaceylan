<?php
/**
 * Binance TR Trading Bot - PHP surumu
 * Tum yardimci fonksiyon/siniflar burada. run.php (cron) ve index.php
 * (web paneli) bu dosyayi include eder.
 */

define('DATA_DIR', __DIR__ . '/data');
define('CONFIG_FILE', DATA_DIR . '/config.json');
define('STATE_FILE', DATA_DIR . '/state.json');
define('LOG_FILE', DATA_DIR . '/log.txt');

function ensure_data_dir(): void {
    if (!is_dir(DATA_DIR)) {
        mkdir(DATA_DIR, 0755, true);
    }
}

function default_config(): array {
    return [
        'setup_done' => false,
        'panel_password_hash' => '',
        'enabled' => false,      // cron her calistiginda buna bakar
        'dry_run' => true,
        'symbol' => 'BTC_TRY',
        'interval' => '15m',
        'trade_base_url' => 'https://www.binance.tr',
        'market_base_url' => 'https://api.binance.me',
        'api_key' => '',
        'api_secret' => '',
        'fast_ma' => 9,
        'slow_ma' => 21,
        'rsi_period' => 14,
        'rsi_overbought' => 70,
        'rsi_oversold' => 30,
        'quote_order_size' => 100,
        'stop_loss_pct' => 0.02,
        'take_profit_pct' => 0.04,
        'trailing_stop_pct' => 0.015,
        'max_daily_loss_pct' => 0.05,
        'telegram_bot_token' => '',
        'telegram_chat_id' => '',
    ];
}

function load_config(): array {
    ensure_data_dir();
    if (!file_exists(CONFIG_FILE)) {
        return default_config();
    }
    $data = json_decode(file_get_contents(CONFIG_FILE), true);
    if (!is_array($data)) {
        return default_config();
    }
    return array_merge(default_config(), $data);
}

function save_config(array $config): void {
    ensure_data_dir();
    $tmp = CONFIG_FILE . '.tmp';
    file_put_contents($tmp, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    rename($tmp, CONFIG_FILE);
}

function load_state(): array {
    ensure_data_dir();
    if (!file_exists(STATE_FILE)) {
        return ['position' => null, 'risk' => [], 'day' => date('Y-m-d')];
    }
    $data = json_decode(file_get_contents(STATE_FILE), true);
    return is_array($data) ? $data : ['position' => null, 'risk' => [], 'day' => date('Y-m-d')];
}

function save_state(array $state): void {
    ensure_data_dir();
    $tmp = STATE_FILE . '.tmp';
    file_put_contents($tmp, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    rename($tmp, STATE_FILE);
}

function bot_log(string $line): void {
    ensure_data_dir();
    $ts = date('Y-m-d H:i:s');
    file_put_contents(LOG_FILE, "[$ts] $line\n", FILE_APPEND | LOCK_EX);
    // dosya cok buyumesin diye son ~1000 satiri tut
    $lines = @file(LOG_FILE);
    if ($lines && count($lines) > 1200) {
        file_put_contents(LOG_FILE, implode('', array_slice($lines, -1000)));
    }
}

function tail_log(int $n = 200): array {
    if (!file_exists(LOG_FILE)) return [];
    $lines = file(LOG_FILE);
    return array_slice($lines, -$n);
}

function telegram_notify(array $config, string $message): void {
    if (empty($config['telegram_bot_token']) || empty($config['telegram_chat_id'])) {
        return;
    }
    $url = "https://api.telegram.org/bot{$config['telegram_bot_token']}/sendMessage";
    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => http_build_query([
                'chat_id' => $config['telegram_chat_id'],
                'text' => $message,
            ]),
            'timeout' => 10,
        ],
    ]);
    @file_get_contents($url, false, $ctx);
}

// ---------------------------------------------------------------------
// Binance TR API istemcisi (bkz. https://www.binance.tr/apidocs)
// ---------------------------------------------------------------------

function to_trade_symbol(string $symbol): string {
    if (strpos($symbol, '_') !== false) return strtoupper($symbol);
    foreach (['USDT', 'TRY', 'BUSD', 'BTC', 'ETH', 'BNB'] as $quote) {
        if (str_ends_with(strtoupper($symbol), $quote) && strlen($symbol) > strlen($quote)) {
            $base = substr($symbol, 0, -strlen($quote));
            return strtoupper($base) . '_' . $quote;
        }
    }
    return strtoupper($symbol);
}

function to_market_symbol(string $symbol): string {
    return strtoupper(str_replace('_', '', $symbol));
}

class ExchangeError extends Exception {}

class BinanceClient {
    private string $apiKey;
    private string $apiSecret;
    private string $tradeBaseUrl;
    private string $marketBaseUrl;

    public function __construct(string $apiKey, string $apiSecret, string $tradeBaseUrl, string $marketBaseUrl) {
        $this->apiKey = $apiKey;
        $this->apiSecret = $apiSecret;
        $this->tradeBaseUrl = rtrim($tradeBaseUrl, '/');
        $this->marketBaseUrl = rtrim($marketBaseUrl, '/');
    }

    private function request(string $method, string $baseUrl, string $path, array $params = [], bool $signed = false) {
        if ($signed) {
            $params['timestamp'] = (int) round(microtime(true) * 1000);
            $query = http_build_query($params);
            $params['signature'] = hash_hmac('sha256', $query, $this->apiSecret);
        }
        $query = http_build_query($params);
        $url = $baseUrl . $path . ($query ? "?$query" : '');

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => $this->apiKey ? ["X-MBX-APIKEY: {$this->apiKey}"] : [],
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($body === false) {
            throw new ExchangeError("Ag hatasi ($path): $err");
        }
        if ($status >= 400) {
            throw new ExchangeError("$status $path: " . substr($body, 0, 300));
        }
        $payload = json_decode($body, true);
        if ($payload === null && $body !== 'null') {
            throw new ExchangeError("$path JSON dondurmedi (yanlis base URL olabilir): " . substr($body, 0, 300));
        }
        if (is_array($payload) && array_key_exists('code', $payload)) {
            if ($payload['code'] !== 0 && $payload['code'] !== null) {
                throw new ExchangeError("$path hata dondurdu: " . ($payload['msg'] ?? 'bilinmiyor'));
            }
            return $payload['data'] ?? null;
        }
        return $payload;
    }

    public function getKlines(string $symbol, string $interval, int $limit = 200): array {
        $data = $this->request('GET', $this->marketBaseUrl, '/api/v1/klines', [
            'symbol' => to_market_symbol($symbol),
            'interval' => $interval,
            'limit' => $limit,
        ]);
        return $data ?? [];
    }

    public function getExchangeSymbols(): array {
        $data = $this->request('GET', $this->tradeBaseUrl, '/open/v1/common/symbols', [], false);
        return $data['list'] ?? [];
    }

    public function createMarketOrder(string $symbol, string $side, ?float $quoteOrderQty = null, ?float $quantity = null): array {
        $params = [
            'symbol' => to_trade_symbol($symbol),
            'side' => strtoupper($side) === 'BUY' ? 0 : 1,
            'type' => 2, // MARKET
        ];
        if ($quoteOrderQty !== null) $params['quoteOrderQty'] = $quoteOrderQty;
        if ($quantity !== null) $params['quantity'] = $quantity;
        return $this->request('POST', $this->tradeBaseUrl, '/open/v1/orders', $params, true) ?? [];
    }

    public function getOrder(string $symbol, $orderId): array {
        return $this->request('GET', $this->tradeBaseUrl, '/open/v1/orders/detail', ['orderId' => $orderId], true) ?? [];
    }
}

// ---------------------------------------------------------------------
// Gostergeler (EMA / RSI)
// ---------------------------------------------------------------------

function ema_series(array $closes, int $period): array {
    $result = array_fill(0, count($closes), null);
    if (count($closes) < $period) return $result;
    $k = 2 / ($period + 1);
    $sum = array_sum(array_slice($closes, 0, $period));
    $prevEma = $sum / $period;
    $result[$period - 1] = $prevEma;
    for ($i = $period; $i < count($closes); $i++) {
        $prevEma = $closes[$i] * $k + $prevEma * (1 - $k);
        $result[$i] = $prevEma;
    }
    return $result;
}

function rsi_series(array $closes, int $period): array {
    $n = count($closes);
    $result = array_fill(0, $n, 50.0);
    if ($n <= $period) return $result;

    $gains = [];
    $losses = [];
    for ($i = 1; $i < $n; $i++) {
        $delta = $closes[$i] - $closes[$i - 1];
        $gains[$i] = max($delta, 0);
        $losses[$i] = max(-$delta, 0);
    }
    $avgGain = array_sum(array_slice($gains, 1, $period)) / $period;
    $avgLoss = array_sum(array_slice($losses, 1, $period)) / $period;
    $alpha = 1 / $period;
    for ($i = $period + 1; $i < $n; $i++) {
        $avgGain = $gains[$i] * $alpha + $avgGain * (1 - $alpha);
        $avgLoss = $losses[$i] * $alpha + $avgLoss * (1 - $alpha);
        $rs = $avgLoss > 0 ? $avgGain / $avgLoss : ($avgGain > 0 ? INF : 0);
        $result[$i] = $avgLoss > 0 ? 100 - (100 / (1 + $rs)) : ($avgGain > 0 ? 100.0 : 50.0);
    }
    return $result;
}

// ---------------------------------------------------------------------
// Strateji: EMA kesisimi + RSI filtresi (bkz. bot/strategy.py ile ayni mantik)
// ---------------------------------------------------------------------

function generate_signal(array $closes, array $config, bool $inPosition): string {
    $fastMa = (int) $config['fast_ma'];
    $slowMa = (int) $config['slow_ma'];
    $rsiPeriod = (int) $config['rsi_period'];
    $required = max($slowMa, $rsiPeriod) + 2;
    $n = count($closes);
    if ($n < $required) return 'HOLD';

    $emaFast = ema_series($closes, $fastMa);
    $emaSlow = ema_series($closes, $slowMa);
    $rsi = rsi_series($closes, $rsiPeriod);

    $last = $n - 1;
    $prev = $n - 2;
    if ($emaFast[$prev] === null || $emaSlow[$prev] === null || $emaFast[$last] === null || $emaSlow[$last] === null) {
        return 'HOLD';
    }

    $crossedUp = $emaFast[$prev] <= $emaSlow[$prev] && $emaFast[$last] > $emaSlow[$last];
    $crossedDown = $emaFast[$prev] >= $emaSlow[$prev] && $emaFast[$last] < $emaSlow[$last];

    if (!$inPosition && $crossedUp && $rsi[$last] < (float) $config['rsi_overbought']) {
        return 'BUY';
    }
    if ($inPosition && ($crossedDown || $rsi[$last] >= (float) $config['rsi_overbought'])) {
        return 'SELL';
    }
    return 'HOLD';
}

// ---------------------------------------------------------------------
// Risk yonetimi
// ---------------------------------------------------------------------

function risk_should_exit(array &$position, float $price, array $config): array {
    if ($price > $position['highest_price']) {
        $position['highest_price'] = $price;
    }
    $change = ($price - $position['entry_price']) / $position['entry_price'];

    if ($change <= -abs((float) $config['stop_loss_pct'])) {
        return [true, 'stop_loss'];
    }
    if ($change >= (float) $config['take_profit_pct']) {
        return [true, 'take_profit'];
    }
    $drawdown = ($price - $position['highest_price']) / $position['highest_price'];
    if ($change > 0 && $drawdown <= -abs((float) $config['trailing_stop_pct'])) {
        return [true, 'trailing_stop'];
    }
    return [false, ''];
}
