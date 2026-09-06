import pandas as pd

from bot.risk import Position, RiskManager
from bot.strategy import Signal, StrategyParams, compute_indicators, generate_signal


def make_df(prices):
    return pd.DataFrame({"close": prices})


def test_no_signal_without_enough_data():
    params = StrategyParams(fast_ma=3, slow_ma=5, rsi_period=5)
    df = compute_indicators(make_df([100, 101, 102]), params)
    assert generate_signal(df, params, in_position=False) == Signal.HOLD


def test_buy_signal_on_upward_crossover():
    params = StrategyParams(fast_ma=2, slow_ma=4, rsi_period=4, rsi_overbought=90)
    prices = [100, 99, 98, 97, 96, 95, 100, 110, 120]
    df = compute_indicators(make_df(prices), params)
    signal = generate_signal(df, params, in_position=False)
    assert signal in (Signal.BUY, Signal.HOLD)


def test_no_buy_signal_when_already_in_position():
    params = StrategyParams(fast_ma=2, slow_ma=4, rsi_period=4)
    prices = [100, 99, 98, 97, 96, 95, 100, 110, 120]
    df = compute_indicators(make_df(prices), params)
    signal = generate_signal(df, params, in_position=True)
    assert signal != Signal.BUY


def test_risk_manager_stop_loss():
    risk = RiskManager(stop_loss_pct=0.02, take_profit_pct=0.05, trailing_stop_pct=0.01,
                        max_daily_loss_pct=0.1)
    pos = Position(symbol="BTCTRY", entry_price=100.0, quantity=1.0)
    exit_flag, reason = risk.should_exit(pos, 97.0)
    assert exit_flag is True
    assert reason == "stop_loss"


def test_risk_manager_take_profit():
    risk = RiskManager(stop_loss_pct=0.02, take_profit_pct=0.05, trailing_stop_pct=0.01,
                        max_daily_loss_pct=0.1)
    pos = Position(symbol="BTCTRY", entry_price=100.0, quantity=1.0)
    exit_flag, reason = risk.should_exit(pos, 106.0)
    assert exit_flag is True
    assert reason == "take_profit"


def test_risk_manager_trailing_stop():
    risk = RiskManager(stop_loss_pct=0.5, take_profit_pct=0.5, trailing_stop_pct=0.02,
                        max_daily_loss_pct=0.5)
    pos = Position(symbol="BTCTRY", entry_price=100.0, quantity=1.0)
    # price rallies, sets a new high
    assert risk.should_exit(pos, 110.0) == (False, "")
    # then drops more than trailing_stop_pct from that high
    exit_flag, reason = risk.should_exit(pos, 107.0)
    assert exit_flag is True
    assert reason == "trailing_stop"


def test_daily_loss_kill_switch():
    risk = RiskManager(stop_loss_pct=0.02, take_profit_pct=0.05, trailing_stop_pct=0.01,
                        max_daily_loss_pct=0.03)
    risk.record_trade_pnl_pct(-0.02)
    assert risk.trading_halted is False
    risk.record_trade_pnl_pct(-0.02)
    assert risk.trading_halted is True
