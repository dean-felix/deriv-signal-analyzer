const PORT = Number(Bun.env.PORT || 3000);
const DERIV_URL = "wss://api.derivws.com/trading/v1/options/ws/public";
const ALLOWED_ORIGIN = "https://dean-felix.github.io";

type RelayData = {
  upstream: WebSocket | null;
  upstreamTimer: ReturnType<typeof setTimeout> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  heartbeat: ReturnType<typeof setInterval> | null;
  pending: (string | ArrayBuffer | Uint8Array)[];
  subscriptions: string[];
  reconnectAttempt: number;
  messagesIn: number;
  messagesOut: number;
};

function attachUpstream(client: import("bun").ServerWebSocket<RelayData>) {
  if (client.readyState !== WebSocket.OPEN) return;
  const upstream = new WebSocket(DERIV_URL);
  client.data.upstream = upstream;
  console.log("Deriv upstream connecting.");
  client.data.upstreamTimer = setTimeout(() => {
    if (upstream.readyState !== WebSocket.OPEN) {
      console.error("Deriv upstream handshake timed out; readyState=" + upstream.readyState);
      try { upstream.close(); } catch {}
    }
  }, 15000);

  upstream.addEventListener("open", () => {
    if (client.data.upstreamTimer) clearTimeout(client.data.upstreamTimer);
    client.data.upstreamTimer = null;
    client.data.reconnectAttempt = 0;
    console.log("Deriv upstream connected; replaying " + client.data.subscriptions.length + " requests.");
    for (const payload of client.data.subscriptions) {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(payload);
    }
    for (const payload of client.data.pending.splice(0)) {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(payload);
    }
    if (client.data.heartbeat) clearInterval(client.data.heartbeat);
    client.data.heartbeat = setInterval(() => {
      if (client.readyState !== WebSocket.OPEN) return;
      if (upstream.readyState === WebSocket.OPEN) {
        try { upstream.send(JSON.stringify({ ping: 1 })); }
        catch (error) { console.error("Deriv heartbeat send failed:", String(error)); }
      } else {
        scheduleReconnect(client);
      }
    }, 25000);
  });

  upstream.addEventListener("message", event => {
    if (client.readyState !== WebSocket.OPEN) return;
    client.data.messagesOut++;
    if (client.data.messagesOut <= 3 || client.data.messagesOut % 100 === 0) {
      console.log("Deriv data forwarded; total=" + client.data.messagesOut);
    }
    try { client.send(event.data); }
    catch (error) { console.error("Browser feed forwarding failed:", String(error)); }
  });

  upstream.addEventListener("close", event => {
    console.error("Deriv upstream closed; code=" + event.code + "; reason=" + (event.reason || "(empty)") + "; clean=" + event.wasClean);
    if (client.data.upstreamTimer) clearTimeout(client.data.upstreamTimer);
    client.data.upstreamTimer = null;
    if (client.data.heartbeat) clearInterval(client.data.heartbeat);
    client.data.heartbeat = null;
    scheduleReconnect(client);
  });

  upstream.addEventListener("error", event => {
    console.error("Deriv upstream socket error:", event);
    if (client.data.upstreamTimer) clearTimeout(client.data.upstreamTimer);
    client.data.upstreamTimer = null;
    try { upstream.close(); } catch {}
  });
}

function scheduleReconnect(client: import("bun").ServerWebSocket<RelayData>) {
  if (client.readyState !== WebSocket.OPEN || client.data.reconnectTimer) return;
  const delay = Math.min(15000, 1000 * Math.pow(2, client.data.reconnectAttempt++));
  console.log("Scheduling Deriv upstream reconnect in " + delay + "ms.");
  client.data.reconnectTimer = setTimeout(() => {
    client.data.reconnectTimer = null;
    if (client.readyState === WebSocket.OPEN) attachUpstream(client);
  }, delay);
}

Bun.serve<RelayData>({
  hostname: "0.0.0.0",
  port: PORT,
  websocket: {
    open(client) {
      client.data.upstream = null;
      client.data.upstreamTimer = null;
      client.data.reconnectTimer = null;
      client.data.heartbeat = null;
      client.data.pending = [];
      client.data.subscriptions = [];
      client.data.reconnectAttempt = 0;
      client.data.messagesIn = 0;
      client.data.messagesOut = 0;
      console.log("Browser market client connected.");
      attachUpstream(client);
    },
    message(client, message) {
      const raw = typeof message === "string" ? message : new TextDecoder().decode(message as ArrayBuffer);
      client.data.messagesIn++;
      if (client.data.messagesIn <= 8 || client.data.messagesIn % 50 === 0) {
        console.log("Browser request received; count=" + client.data.messagesIn + "; payload=" + raw.slice(0, 240));
      }
      try {
        const request = JSON.parse(raw);
        if (request && (request.subscribe === 1 || request.ticks_history || request.active_symbols)) {
          const key = request.ticks ? "ticks:" + request.ticks : request.ticks_history ? "history:" + request.ticks_history : request.active_symbols ? "active_symbols" : raw;
          client.data.subscriptions = client.data.subscriptions.filter(item => {
            try {
              const saved = JSON.parse(item);
              const savedKey = saved.ticks ? "ticks:" + saved.ticks : saved.ticks_history ? "history:" + saved.ticks_history : saved.active_symbols ? "active_symbols" : item;
              return savedKey !== key;
            } catch { return item !== raw; }
          });
          client.data.subscriptions.push(raw);
          if (client.data.subscriptions.length > 20) client.data.subscriptions.shift();
        }
      } catch {}
      const upstream = client.data.upstream;
      if (upstream?.readyState === WebSocket.OPEN) {
        try { upstream.send(message); }
        catch (error) { console.error("Deriv request forwarding failed:", String(error)); scheduleReconnect(client); }
      } else if (client.data.pending.length < 50) {
        client.data.pending.push(message as string | ArrayBuffer | Uint8Array);
        scheduleReconnect(client);
      }
    },
    close(client, code, reason) {
      console.log("Browser market client closed; code=" + code + "; reason=" + (reason || "(empty)") + "; requests=" + client.data.messagesIn + "; responses=" + client.data.messagesOut);
      if (client.data.upstreamTimer) clearTimeout(client.data.upstreamTimer);
      if (client.data.reconnectTimer) clearTimeout(client.data.reconnectTimer);
      if (client.data.heartbeat) clearInterval(client.data.heartbeat);
      const upstream = client.data.upstream;
      if (upstream && upstream.readyState < WebSocket.CLOSING) upstream.close();
      client.data.pending.length = 0;
      client.data.subscriptions.length = 0;
    }
  },
  fetch(request, server) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (origin && origin !== ALLOWED_ORIGIN) return new Response("Origin not allowed", { status: 403 });
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "deriv-market-relay", upstream: DERIV_URL, websocket: true, reconnect: true, heartbeatSeconds: 25 }, {
        headers: { "cache-control": "no-store", "access-control-allow-origin": ALLOWED_ORIGIN }
      });
    }
    if (url.pathname === "/market" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      if (server.upgrade(request, { data: { upstream: null, upstreamTimer: null, reconnectTimer: null, heartbeat: null, pending: [], subscriptions: [], reconnectAttempt: 0, messagesIn: 0, messagesOut: 0 } })) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    return new Response("Not found", { status: 404 });
  }
});

console.log("Deriv market relay listening on 0.0.0.0:" + PORT);