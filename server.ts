const PORT = Number(Bun.env.PORT || 3000);
const DERIV_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const ALLOWED_ORIGIN = "https://dean-felix.github.io";

type RelayData = { upstream: WebSocket | null; upstreamTimer: ReturnType<typeof setTimeout> | null };

Bun.serve<RelayData>({
  port: PORT,
  websocket: {
    open(client) {
      client.data.upstream = new WebSocket(DERIV_URL);
      client.data.upstreamTimer = setTimeout(() => {
        if (client.data.upstream?.readyState !== WebSocket.OPEN && client.readyState === WebSocket.OPEN) {
          client.close(1011, "Deriv upstream connection timed out");
        }
      }, 12000);

      const upstream = client.data.upstream;
      upstream.addEventListener("open", () => {
        if (client.data.upstreamTimer) clearTimeout(client.data.upstreamTimer);
        client.data.upstreamTimer = null;
      });
      upstream.addEventListener("message", event => {
        if (client.readyState === WebSocket.OPEN) client.send(event.data);
      });
      upstream.addEventListener("close", event => {
        if (client.data.upstreamTimer) clearTimeout(client.data.upstreamTimer);
        client.data.upstreamTimer = null;
        if (client.readyState === WebSocket.OPEN) {
          client.close(1011, "Deriv upstream closed (" + event.code + ")");
        }
      });
      upstream.addEventListener("error", () => {
        if (client.data.upstreamTimer) clearTimeout(client.data.upstreamTimer);
        client.data.upstreamTimer = null;
        if (client.readyState === WebSocket.OPEN) client.close(1011, "Deriv upstream error");
      });
    },
    message(client, message) {
      const upstream = client.data.upstream;
      if (upstream?.readyState === WebSocket.OPEN) upstream.send(message);
    },
    close(client) {
      if (client.data.upstreamTimer) clearTimeout(client.data.upstreamTimer);
      const upstream = client.data.upstream;
      if (upstream && upstream.readyState < WebSocket.CLOSING) upstream.close();
    }
  },
  fetch(request, server) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (origin && origin !== ALLOWED_ORIGIN) return new Response("Origin not allowed", { status: 403 });
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "deriv-market-relay", upstream: DERIV_URL, websocket: true }, {
        headers: { "cache-control": "no-store", "access-control-allow-origin": ALLOWED_ORIGIN }
      });
    }
    if (url.pathname === "/market" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      if (server.upgrade(request, { data: { upstream: null, upstreamTimer: null } })) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    return new Response("Not found", { status: 404 });
  }
});

console.log("Deriv market relay listening on port " + PORT);
