"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { WebSocket, WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DERIV_WS_URL =
  process.env.DERIV_WS_URL ||
  "wss://api.derivws.com/trading/v1/options/ws/public";
const INDEX_FILE = path.join(__dirname, "index.html");
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_MESSAGES_PER_SECOND = 20;

// Intentionally limited to public market-data operations. Trade-related
// operations (authorize, proposal, buy, sell, portfolio, etc.) are rejected.
const ALLOWED_OPERATIONS = new Set([
  "active_symbols",
  "ticks_history",
  "ticks",
  "contracts_for",
  "forget_all"
]);

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    res.end(JSON.stringify({
      ok: true,
      service: "deriv-market-data-backend",
      tradingEnabled: false
    }));
    return;
  }

  if (req.method !== "GET" || (req.url !== "/" && req.url !== "/index.html")) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  fs.readFile(INDEX_FILE, (error, html) => {
    if (error) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("App file could not be loaded.");
      return;
    }

    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy":
        "default-src 'self'; connect-src 'self' ws: wss:; " +
        "style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"
    });
    res.end(html);
  });
});

const wss = new WebSocketServer({
  server,
  path: "/deriv",
  maxPayload: MAX_MESSAGE_BYTES
});

function sendError(client, request, code, message) {
  if (client.readyState !== WebSocket.OPEN) return;
  const response = {
    error: { code, message },
    ...(request && request.req_id !== undefined ? { req_id: request.req_id } : {})
  };
  client.send(JSON.stringify(response));
}

function getOperation(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) return null;
  const keys = Object.keys(request);
  const operations = keys.filter(key => ALLOWED_OPERATIONS.has(key));
  if (operations.length !== 1) return null;

  const operation = operations[0];
  const allowedFields = {
    active_symbols: new Set(["active_symbols", "req_id"]),
    ticks_history: new Set(["ticks_history", "end", "count", "style", "req_id"]),
    ticks: new Set(["ticks", "subscribe", "req_id"]),
    contracts_for: new Set(["contracts_for", "req_id"]),
    forget_all: new Set(["forget_all", "req_id"])
  }[operation];

  if (keys.some(key => !allowedFields.has(key))) return null;
  return operation;
}

wss.on("connection", (client, request) => {
  // Optional deployment restriction. Set ALLOWED_ORIGINS to comma-separated
  // exact origins when the frontend and backend use different hostnames.
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map(value => value.trim()).filter(Boolean);
  const origin = request.headers.origin;
  if (allowedOrigins.length && (!origin || !allowedOrigins.includes(origin))) {
    client.close(1008, "Origin not allowed");
    return;
  }

  let upstream;
  let upstreamReady = false;
  let closed = false;
  let activeSymbols = new Set();
  let pending = [];
  let messageWindowStarted = Date.now();
  let messageCount = 0;

  function closeBoth(code, reason) {
    if (closed) return;
    closed = true;
    if (upstream && upstream.readyState < WebSocket.CLOSING) {
      upstream.close(code || 1000, reason || "Client closed");
    }
    if (client.readyState < WebSocket.CLOSING) {
      client.close(code || 1000, reason || "Connection closed");
    }
  }

  try {
    upstream = new WebSocket(DERIV_WS_URL);
  } catch (error) {
    sendError(client, null, "BACKEND_CONNECT_FAILED", "Could not connect to Deriv.");
    client.close(1011, "Upstream connection failed");
    return;
  }

  upstream.on("open", () => {
    upstreamReady = true;
    for (const message of pending) {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(message);
    }
    pending = [];
  });

  upstream.on("message", raw => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.msg_type === "active_symbols" && Array.isArray(data.active_symbols)) {
      activeSymbols = new Set();
      for (const market of data.active_symbols) {
        if (market && typeof market === "object") {
          if (typeof market.underlying_symbol === "string") {
            activeSymbols.add(market.underlying_symbol);
          }
          if (typeof market.symbol === "string") activeSymbols.add(market.symbol);
        }
      }
    }

    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data));
  });

  upstream.on("error", () => {
    sendError(client, null, "DERIV_UPSTREAM_ERROR", "Deriv market-data connection failed.");
  });

  upstream.on("close", () => {
    if (!closed && client.readyState === WebSocket.OPEN) {
      client.close(1011, "Deriv connection closed");
    }
  });

  client.on("message", raw => {
    const now = Date.now();
    if (now - messageWindowStarted >= 1000) {
      messageWindowStarted = now;
      messageCount = 0;
    }
    messageCount += 1;
    if (messageCount > MAX_MESSAGES_PER_SECOND) {
      sendError(client, null, "RATE_LIMITED", "Too many market-data requests.");
      closeBoth(1008, "Rate limit exceeded");
      return;
    }

    let requestMessage;
    try {
      requestMessage = JSON.parse(raw.toString());
    } catch {
      sendError(client, null, "INVALID_JSON", "Request must be valid JSON.");
      return;
    }

    const operation = getOperation(requestMessage);
    if (!operation) {
      sendError(
        client,
        requestMessage,
        "OPERATION_NOT_ALLOWED",
        "Only approved public market-data requests are enabled. Trading is disabled."
      );
      return;
    }

    if (operation === "active_symbols") {
      if (!["brief", "full"].includes(requestMessage.active_symbols)) {
        sendError(client, requestMessage, "INVALID_MARKET_REQUEST", "Use active_symbols brief or full.");
        return;
      }
    } else if (operation === "forget_all") {
      if (requestMessage.forget_all !== "ticks") {
        sendError(client, requestMessage, "INVALID_SUBSCRIPTION_REQUEST", "Only tick unsubscription is allowed.");
        return;
      }
    } else {
      const symbol = requestMessage[operation];
      if (typeof symbol !== "string" || !symbol.trim()) {
        sendError(client, requestMessage, "INVALID_SYMBOL", "A market symbol is required.");
        return;
      }
      if (operation === "ticks_history") {
        const count = requestMessage.count;
        if (requestMessage.end !== "latest" ||
            requestMessage.style !== "ticks" ||
            !Number.isInteger(count) || count < 1 || count > 500) {
          sendError(client, requestMessage, "INVALID_HISTORY_REQUEST", "History must request 1–500 recent ticks.");
          return;
        }
      }
      if (operation === "ticks" && requestMessage.subscribe !== 1) {
        sendError(client, requestMessage, "INVALID_TICK_REQUEST", "Only a live tick subscription is allowed.");
        return;
      }
      if (!activeSymbols.has(symbol)) {
        sendError(
          client,
          requestMessage,
          "MARKET_NOT_VERIFIED",
          "This symbol has not been verified against Deriv's current active market list."
        );
        return;
      }
    }

    const encoded = JSON.stringify(requestMessage);
    if (upstreamReady && upstream.readyState === WebSocket.OPEN) {
      upstream.send(encoded);
    } else if (pending.length < 25) {
      pending.push(encoded);
    } else {
      sendError(client, requestMessage, "UPSTREAM_BUSY", "Deriv connection is still starting.");
    }
  });

  client.on("close", () => {
    if (upstream && upstream.readyState < WebSocket.CLOSING) upstream.close();
  });
  client.on("error", () => {
    if (upstream && upstream.readyState < WebSocket.CLOSING) upstream.close();
  });
});

server.listen(PORT, HOST, () => {
  console.log("Deriv analyzer backend listening on " + HOST + ":" + PORT);
});

process.on("SIGTERM", () => {
  wss.close();
  server.close(() => process.exit(0));
});
