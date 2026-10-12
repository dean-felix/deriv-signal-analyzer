# Deriv Signal Analyzer

Mobile-first Deriv market analyzer. This stage adds a backend-only Deriv market-data connection and keeps trading disabled.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Open `http://localhost:3000`. The app requests market lists, history, ticks, and contract metadata through the backend WebSocket at `/deriv`.

## Deploy

Deploy this repository as a **Node.js web service**, not as a static GitHub Pages site. Set the start command to `npm start`. The service serves `index.html` and the `/deriv` WebSocket endpoint from the same origin. Configure `ALLOWED_ORIGINS` only if the frontend is hosted on a separate origin.

## Security and current scope

- The browser connects to this app's backend, not directly to Deriv.
- The backend forwards only approved public market-data operations and verifies requested symbols against the active-symbol list returned by Deriv.
- Requests for authorization, proposals, buys, sells, and other trading operations are rejected. **Automated trading is not implemented.**
- No API token is needed for public market data. Any future trading token must be stored as a backend environment secret, never in client-side code.
- The three market categories are populated only from markets actually returned by Deriv. If a category has no matching active market, the UI shows that no verified market is available rather than fabricating a symbol or price.
- Touch / No Touch is present as a trade-type choice but intentionally returns WAIT until contract-specific barrier handling is implemented. No barrier is fabricated.
- Historical frequencies and recent movement are descriptive, not guaranteed probabilities or profitability claims.
