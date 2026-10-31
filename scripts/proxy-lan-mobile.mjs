#!/usr/bin/env node
/**
 * Ponte LAN para o celular. O launcher só escuta 127.0.0.1:7777.
 * Este processo publica 0.0.0.0:7781 → 127.0.0.1:7777.
 * Uso: node scripts/proxy-lan-mobile.mjs
 */
import http from "node:http";

const TARGET_HOST = "127.0.0.1";
const TARGET_PORT = Number(process.env.MPC_PORT || "7777");
const LISTEN_HOST = process.env.MOBILE_PROXY_HOST || "0.0.0.0";
const LISTEN_PORT = Number(process.env.MOBILE_PROXY_PORT || "7781");

function hopByHop() {
  return new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);
}

const server = http.createServer((req, res) => {
  const headers = { ...req.headers, host: `${TARGET_HOST}:${TARGET_PORT}` };
  for (const name of hopByHop()) delete headers[name];
  const opts = {
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers,
  };
  const upstream = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  upstream.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end(`proxy: ${err.message}`);
  });
  req.pipe(upstream);
});

server.on("error", (err) => {
  console.error(err.message);
  process.exit(1);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`MOBILE_PROXY http://${LISTEN_HOST}:${LISTEN_PORT} -> http://${TARGET_HOST}:${TARGET_PORT}`);
});
