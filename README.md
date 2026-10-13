# Deriv Signal Analyzer

Mobile-first Deriv market analyzer. The app uses public Deriv market data and produces a signal for the selected market and contract type. It does not currently place trades or connect to a personal account.

## Open the app

Published URL: https://dean-felix.github.io/deriv-signal-analyzer/

On Android, open the URL in Chrome. If Chrome offers **Install app** or **Add to Home screen**, use that to add an app icon.

## Current capabilities

- Public Deriv market connection and market selector.
- Recent tick history and manual analysis.
- Tappable contract-type cards.
- User-selected target digit for Matches and Differs.
- User-selected barrier digit for Over/Under.
- Installable app manifest, icon, and service-worker app shell.
- GitHub Actions validation before publishing: JavaScript syntax, manifest JSON, required analysis functions, service-worker handlers, and duplicate HTML IDs.

## Not yet implemented

- Authenticated Demo/Live account sessions and balances.
- Actual contract proposals, purchase, settlement tracking, or automatic trading.
- A verified live-browser test of the WebSocket feed on the deployed domain.

## Deriv account integration prerequisite

The public market-data WebSocket is read-only. Account balances and trading require an authenticated Deriv session. The current OAuth 2.0 flow requires a registered Deriv OAuth application with a client ID and a redirect URI matching the deployed URL exactly:

`https://dean-felix.github.io/deriv-signal-analyzer/`

Deriv's current OAuth 2.0 guidance requires authorization-code exchange through a backend. Do not paste passwords, API tokens, or access tokens into this repository or into chat. A secure backend and registered client configuration must be in place before account login or trade execution can be enabled.

## Deployment and validation

GitHub Actions publishes the site from `main`. The workflow validates the app files and JavaScript syntax before uploading the site.

Workflow history: https://github.com/dean-felix/deriv-signal-analyzer/actions
