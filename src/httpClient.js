import http from "node:http";
import https from "node:https";

function safeError(error) {
  if (!error) return null;
  return {
    name: error.name || "Error",
    code: error.code || error.cause?.code || undefined,
    errno: error.errno || error.cause?.errno || undefined,
    syscall: error.syscall || error.cause?.syscall || undefined,
    message: error.message || String(error)
  };
}

function targetInfo(inputUrl) {
  const url = new URL(inputUrl.toString());
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (url.protocol === "https:" ? "443" : "80"),
    pathname: url.pathname
  };
}

export function diagnosticSuggestions(inputUrl) {
  const info = targetInfo(inputUrl);
  return [
    `VPS에서 curl -v -A "Mozilla/5.0" "${info.protocol}//${info.hostname}${info.pathname}?apiKey=REDACTED&serviceCode=SVC01&serviceType=AA001" 로 원본 PSIS 응답을 확인하세요.`,
    "Node.js에서 http outbound 요청이 허용되는지 방화벽, 보안그룹, 호스팅 정책을 확인하세요.",
    "브라우저에서는 되지만 Node에서 실패하면 User-Agent 차단 또는 fetch 구현 이슈일 수 있으므로 PSIS_HTTP_CLIENT=node 로 강제 실행해 보세요.",
    "Nginx 앞단을 쓰는 경우 access log에 query string이 남지 않도록 설정하세요."
  ];
}

function defaultHeaders(headers = {}) {
  return {
    "Accept": "application/xml,text/xml,application/json,*/*",
    // PSIS WAF resets connections from bot-style User-Agents (curl, compatible;...).
    // A full browser UA is required for reliable responses.
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    ...headers
  };
}

async function requestWithFetch(inputUrl, { timeoutMs, headers } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(inputUrl.toString(), {
      method: "GET",
      headers: defaultHeaders(headers),
      signal: controller.signal
    });
    const rawText = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      rawText,
      transport: "fetch",
      diagnostics: null
    };
  } finally {
    clearTimeout(timeout);
  }
}

function requestWithNodeHttp(inputUrl, { timeoutMs, headers, fetchFailure } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(inputUrl.toString());
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(url, {
      method: "GET",
      headers: defaultHeaders(headers),
      timeout: timeoutMs
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        const rawText = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage || "",
          headers: res.headers,
          rawText,
          transport: fetchFailure ? "node-http-fallback" : "node-http",
          diagnostics: fetchFailure ? { fetchFailure } : null
        });
      });
    });

    req.on("timeout", () => {
      req.destroy(Object.assign(new Error(`PSIS API request timed out after ${timeoutMs} ms.`), { code: "PSIS_TIMEOUT" }));
    });
    req.on("error", reject);
    req.end();
  });
}

// PSIS WAF intermittently resets connections from non-KR IPs; one short retry usually succeeds.
const TRANSIENT_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "EPIPE", "UND_ERR_SOCKET"]);

async function nodeHttpWithRetry(inputUrl, opts) {
  try {
    return await requestWithNodeHttp(inputUrl, opts);
  } catch (error) {
    const code = error?.code || error?.cause?.code;
    if (!TRANSIENT_CODES.has(code)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 700));
    return requestWithNodeHttp(inputUrl, opts);
  }
}

export async function requestTextWithFallback(inputUrl, { timeoutMs = 15000, headers = {}, mode = "fetch-first" } = {}) {
  const normalizedMode = ["fetch-first", "node", "node-first"].includes(mode) ? mode : "fetch-first";
  const info = targetInfo(inputUrl);
  let fetchFailure = null;

  if (normalizedMode === "node" || normalizedMode === "node-first") {
    try {
      return await nodeHttpWithRetry(inputUrl, { timeoutMs, headers });
    } catch (nodeError) {
      const err = new Error("PSIS HTTP request failed using node http client.");
      err.code = nodeError?.code === "PSIS_TIMEOUT" ? "PSIS_TIMEOUT" : "PSIS_FETCH_FAILED";
      err.details = {
        target: info,
        mode: normalizedMode,
        nodeHttpFailure: safeError(nodeError),
        suggestions: diagnosticSuggestions(inputUrl)
      };
      throw err;
    }
  }

  try {
    return await requestWithFetch(inputUrl, { timeoutMs, headers });
  } catch (error) {
    fetchFailure = safeError(error);
  }

  try {
    return await nodeHttpWithRetry(inputUrl, { timeoutMs, headers, fetchFailure });
  } catch (nodeError) {
    const err = new Error("PSIS HTTP request failed. Browser access may still work, but this server could not reach the PSIS API over outbound HTTP.");
    err.code = nodeError?.code === "PSIS_TIMEOUT" ? "PSIS_TIMEOUT" : "PSIS_FETCH_FAILED";
    err.details = {
      target: info,
      mode: normalizedMode,
      fetchFailure,
      nodeHttpFailure: safeError(nodeError),
      suggestions: diagnosticSuggestions(inputUrl)
    };
    throw err;
  }
}
