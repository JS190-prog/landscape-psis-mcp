import express from "express";
import crypto from "crypto";
import { config } from "./config.js";
import { rateLimitMiddleware } from "./rateLimit.js";
import { maskSecret, sanitizeUrlForLog, stripQuery } from "./security.js";
import { handleJsonRpc, metadata } from "./mcp.js";
import { callTool } from "./tools.js";
import { describePsisConfig } from "./psisClient.js";

const app = express();
const sseSessions = new Map();


function requestToolDefaults(req) {
  const psisApiKey = req.query.psisApiKey || req.query.apiKey || req.query.key || "";
  const psisApiUrl = req.query.psisApiUrl || req.query.apiUrl || "";
  const serviceType = req.query.serviceType || "";
  const out = {};
  if (psisApiKey) out.psisApiKey = String(psisApiKey);
  if (psisApiUrl) out.psisApiUrl = String(psisApiUrl);
  if (serviceType) out.serviceType = String(serviceType);
  return out;
}

function requestDebugDefaults(req) {
  const d = requestToolDefaults(req);
  return {
    hasQueryApiKey: Boolean(d.psisApiKey),
    queryApiKeyPreview: d.psisApiKey ? maskSecret(d.psisApiKey) : undefined,
    hasQueryPsisApiUrl: Boolean(d.psisApiUrl),
    serviceType: d.serviceType || undefined
  };
}

app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  if (config.logs.safeAccessLog) {
    const started = Date.now();
    res.on("finish", () => {
      const path = stripQuery(req.originalUrl || req.url);
      console.log(`${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms`);
    });
  }
  next();
});

app.use(rateLimitMiddleware);

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.get("/", (req, res) => {
  res.type("text/plain").send(`조경수 농약 적합성 판단 MCP 서버

ChatGPT 새 앱 입력값:
- 연결: 서버 URL
- 인증: 인증 없음
- 서버 URL: ${(config.publicBaseUrl || `${req.protocol}://${req.get("host")}`)}/mcp?psisApiKey=YOUR_PSIS_KEY

SSE 화면이면: ${(config.publicBaseUrl || `${req.protocol}://${req.get("host")}`)}/sse?psisApiKey=YOUR_PSIS_KEY

health: /health
metadata: /.well-known/mcp-server.json
PSIS debug: /debug/psis?psisApiKey=YOUR_PSIS_KEY&pestiBrandName=살비왕

사용 방식:
- korean-law-mcp 스타일: /mcp?psisApiKey=발급키 또는 /mcp?apiKey=발급키
- 보조 옵션: PSIS_API_BASE_URL 또는 PSIS_API_KEY 환경변수
- 공용 서버 보호: rate limit, PSIS 응답 캐시, timeout, API 키 로그 마스킹 포함
`);
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "landscape-psis-mcp",
    version: "1.8.0",
    psis: describePsisConfig(),
    endpoints: metadata(req).endpoints,
    queryKeyMode: requestDebugDefaults(req)
  });
});

app.get("/.well-known/mcp-server.json", (req, res) => {
  res.json(metadata(req));
});

// Streamable HTTP MCP endpoint. Recommended for current ChatGPT connectors.
app.post("/mcp", async (req, res) => {
  const result = await handleJsonRpc(req.body, { toolDefaults: requestToolDefaults(req) });
  if (result === null || result === undefined) return res.status(204).end();
  res.json(result);
});

// Some UIs still show an /sse placeholder. This alias accepts POST JSON-RPC too.
app.post("/sse", async (req, res) => {
  const result = await handleJsonRpc(req.body, { toolDefaults: requestToolDefaults(req) });
  if (result === null || result === undefined) return res.status(204).end();
  res.json(result);
});

// Legacy MCP SSE endpoint.
app.get("/sse", (req, res) => {
  const sessionId = crypto.randomUUID();
  const baseUrl = config.publicBaseUrl || `${req.protocol}://${req.get("host")}`;
  const messageUrl = `${baseUrl}/messages?sessionId=${encodeURIComponent(sessionId)}`;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write(`event: endpoint\ndata: ${messageUrl}\n\n`);
  res.write(`event: ready\ndata: ${JSON.stringify({ sessionId })}\n\n`);

  const heartbeat = setInterval(() => {
    try { res.write(`: heartbeat ${Date.now()}\n\n`); } catch {}
  }, 25000);

  sseSessions.set(sessionId, { res, heartbeat, createdAt: Date.now(), toolDefaults: requestToolDefaults(req) });

  req.on("close", () => {
    clearInterval(heartbeat);
    sseSessions.delete(sessionId);
  });
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const session = sseSessions.get(sessionId);
  if (!session) return res.status(404).json({ error: "SSE session not found" });

  const result = await handleJsonRpc(req.body, { toolDefaults: session.toolDefaults || {} });
  if (result !== null && result !== undefined) {
    session.res.write(`event: message\ndata: ${JSON.stringify(result)}\n\n`);
  }
  res.status(202).json({ accepted: true });
});

// Human-friendly REST helpers for deployment checks.
app.get("/debug/psis", async (req, res) => {
  res.json(await callTool("psis_debug_connection", { ...requestToolDefaults(req), ...req.query }));
});

app.post("/api/search", async (req, res) => {
  res.json(await callTool("psis_search_pesticides", { ...requestToolDefaults(req), ...req.body }));
});

app.post("/api/fit", async (req, res) => {
  res.json(await callTool("check_landscape_pesticide_fit", { ...requestToolDefaults(req), ...req.body }));
});

app.post("/api/cancelled", async (req, res) => {
  res.json(await callTool("psis_search_cancelled_pesticides", { ...requestToolDefaults(req), ...req.body }));
});

// GET helpers let you test with a browser URL, including psisApiUrl if needed.
app.get("/api/search", async (req, res) => {
  res.json(await callTool("psis_search_pesticides", { ...requestToolDefaults(req), ...req.query }));
});

app.get("/api/fit", async (req, res) => {
  res.json(await callTool("check_landscape_pesticide_fit", { ...requestToolDefaults(req), ...req.query }));
});

app.get("/api/cancelled", async (req, res) => {
  res.json(await callTool("psis_search_cancelled_pesticides", { ...requestToolDefaults(req), ...req.query }));
});

app.use((err, req, res, next) => {
  console.error({ code: err.code || "INTERNAL_ERROR", message: err.message, path: sanitizeUrlForLog(req.originalUrl || req.url), details: err.details });
  res.status(500).json({ error: true, message: err.message, code: err.code || "INTERNAL_ERROR", details: err.details });
});

app.listen(config.port, () => {
  console.log(`landscape-psis-mcp listening on port ${config.port}`);
  console.log(`PSIS config: ${JSON.stringify(describePsisConfig())}`);
});
