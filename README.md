# Deriv Signal Analyzer

Mobile-first Deriv market analyzer and trading desk. Public market data is sourced from Deriv; account actions require an authenticated Deriv session through the configured backend.

## Open the app

Published URL: https://dean-felix.github.io/deriv-signal-analyzer/

On Android, open the URL in Chrome. If Chrome offers Install app or Add to Home screen, use that to add an app icon.

## Market separation

- **Charts / Chart Bot:** Market choices are populated from Deriv's active-symbols response, excluding Volatility indices. The chart market selector is separate from the fixed Volatility market lists used by Manual Trader and Premium Bot.
- **Manual Trader:** Retains the supported Volatility indices and its own stake and contract controls.
- **Premium Bot:** Retains its Volatility-only market list and its independent Premium Bot Stake input.
- **Matches Pro:** Continues to scan its ten configured Volatility indices only.

## Chart analysis

Chart data requests cover 1-minute, 2-minute, 5-minute, 15-minute, 30-minute, 1-hour, 4-hour and 1-day candles. The Chart Bot evaluates a lower/selected entry timeframe against available higher timeframes and uses a weighted technical confluence model that includes:

- EMA 20/50 trend
- RSI momentum
- MACD momentum
- 20-candle support/resistance breakout
- Bollinger-band expansion
- Engulfing candles and pin-bar rejection
- Support/resistance retests
- Recent market structure (higher highs/lows or lower highs/lows)

The displayed model score is a technical confluence score, not a statistically verified win probability. The entry/stop-loss/take-profit box is a visual ATR-based risk/reward planning tool; its lines are draggable. These visual levels are not transmitted as stop-loss or take-profit instructions to Deriv Options.

**Execution distinction:** The current Chart Bot execution route buys Deriv Rise/Fall options contracts through the authenticated Deriv Options flow. It is not an MT5 CFD position, does not hold an open Forex position for a chosen multi-hour/day period, and does not attach MT5 stop-loss/take-profit orders. Conventional MT5-style position execution requires a separate supported MT5 integration.

## Premium Bot and Matches Pro

- Premium Bot uses its own botStake input; Manual Trader continues to use stake.
- Premium Bot analysis requires 200 usable real ticks for the selected Volatility market.
- Matches Pro locks a qualified market/barrier candidate, observes it for 150 seconds while revalidating the same candidate, and only then proceeds to its quote/payout checks.
- Reset clears the app's locally stored trade-result history immediately. It does not cancel or remove transactions held in Deriv.

## Safety and verification

- Live automatic trading requires an explicit confirmation before Chart Bot or Matches Pro starts.
- Demo and live account display are kept separate.
- Never put Deriv passwords, API tokens, or access tokens in this repository or in chat.
- JavaScript syntax, manifest validity, service-worker handlers and duplicate HTML IDs are checked by the GitHub Pages deployment workflow.
- A successful GitHub Pages workflow does not prove phone-level behaviour, live Deriv data availability, or successful trade execution. Those require separate live checks.

## Deployment

GitHub Actions publishes the site from main. Workflow history:
https://github.com/dean-felix/deriv-signal-analyzer/actions
