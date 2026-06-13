import { XMLParser } from "fast-xml-parser";
import { config } from "./config.js";
import { sanitizeUrlForLog } from "./security.js";
import { diagnosticSuggestions, requestTextWithFallback } from "./httpClient.js";

// Optional instrumentation hook: receives (durationMs, ok, isTimeout) per upstream call.
let upstreamObserver = null;
export function setUpstreamObserver(fn) {
  upstreamObserver = typeof fn === "function" ? fn : null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false
});

const ERROR_MESSAGES = {
  ERR_101: "인증키가 입력되지 않았습니다.",
  ERR_102: "농약안전정보시스템 관리자가 요청자의 서비스를 중지했습니다.",
  ERR_103: "서비스코드가 잘못되었습니다.",
  ERR_104: "요청한 서비스를 수행할 권한이 없습니다.",
  ERR_105: "인증받지 않은 도메인입니다. PSIS OpenAPI 신청 정보의 도메인/서버 주소를 확인해야 합니다.",
  ERR_201: "서비스 수행에 필요한 파라미터가 없거나 잘못되었습니다.",
  ERR_901: "농약안전정보시스템 내부 오류가 발생했습니다."
};

const responseCache = new Map();
let cacheHits = 0;
let cacheMisses = 0;

const RAW_REQUEST_ALLOWED_PARAMS = Object.freeze(new Set([
  "serviceCode",
  "serviceType",
  "displayCount",
  "startPoint",
  "useName",
  "cropName",
  "cropCheck",
  "cropName2",
  "cropCheck2",
  "cropName3",
  "cropCheck3",
  "cropName4",
  "cropCheck4",
  "diseaseWeedName",
  "similarFlag",
  "pestiKorName",
  "pestiBrandName",
  "brandName",
  "compName",
  "companyName",
  "pestiCode",
  "diseaseUseSeq"
]));

export function normalizeRawPsisParams(params = {}) {
  const out = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (RAW_REQUEST_ALLOWED_PARAMS.has(key)) out[key] = value;
  }
  return out;
}

function cacheKey(endpoint, params) {
  const clean = new URLSearchParams(params);
  clean.delete("apiKey");
  const sorted = [...clean.entries()].sort(([a], [b]) => a.localeCompare(b));
  return `${endpoint}:${new URLSearchParams(sorted).toString()}`;
}

function getCache(key) {
  if (!config.cache.enabled || config.cache.ttlMs <= 0) return null;
  const found = responseCache.get(key);
  if (!found) {
    cacheMisses += 1;
    return null;
  }
  if (Date.now() - found.createdAt > config.cache.ttlMs) {
    responseCache.delete(key);
    cacheMisses += 1;
    return null;
  }
  cacheHits += 1;
  return { ...found.value, cached: true, cacheAgeMs: Date.now() - found.createdAt };
}

function setCache(key, value) {
  if (!config.cache.enabled || config.cache.ttlMs <= 0 || !value?.ok) return;
  if (responseCache.size >= config.cache.maxEntries) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
  responseCache.set(key, { value: { ...value, cached: false }, createdAt: Date.now() });
}

function limitCount(count) {
  const value = Number(count || config.maxDisplayCount || 10);
  if (!Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(value, 50));
}

function cleanParams(params) {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === "") continue;
    out.set(key, String(value));
  }
  return out;
}

function normalizeXmlValue(value) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return value.map(normalizeXmlValue);
  if (typeof value !== "object") return value;
  if (Object.keys(value).length === 1 && value["#text"] !== undefined) return value["#text"];
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = normalizeXmlValue(v);
  return out;
}

function findItems(value) {
  if (!value || typeof value !== "object") return [];
  const keys = ["item", "items", "list", "row", "data"];
  for (const key of keys) {
    if (value[key] !== undefined) {
      const found = normalizeXmlValue(value[key]);
      if (Array.isArray(found)) return found;
      if (found && typeof found === "object") return [found];
    }
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      const found = findItems(child);
      if (found.length) return found;
    }
  }
  return [];
}

function findError(value) {
  const text = JSON.stringify(value || {});
  const code = Object.keys(ERROR_MESSAGES).find((k) => text.includes(k));
  if (!code) return null;
  return { code, message: ERROR_MESSAGES[code] };
}

function safeUrl(value, fallback) {
  const raw = value || fallback;
  try {
    return new URL(raw);
  } catch {
    return new URL(fallback);
  }
}

function redactParams(params) {
  const out = {};
  for (const [key, value] of params.entries()) {
    out[key] = key.toLowerCase().includes("apikey") ? "[REDACTED]" : value;
  }
  return out;
}

function deriveCancelledUrl(rawBaseUrl) {
  const url = safeUrl(rawBaseUrl || config.psis.cancelledUrl, config.psis.cancelledUrl);
  if (url.pathname.endsWith("/service.do")) {
    url.pathname = url.pathname.replace(/service\.do$/, "cnclAgchm.do");
  }
  if (!url.pathname.endsWith("cnclAgchm.do")) {
    return safeUrl(config.psis.cancelledUrl, config.psis.cancelledUrl);
  }
  return url.toString();
}

function resolveEndpoint(endpoint, args = {}) {
  const runtimeUrl = args.psisApiUrl || args.apiUrl || "";
  if (endpoint === "cancelled") {
    return runtimeUrl
      ? deriveCancelledUrl(runtimeUrl)
      : (config.psisCancelledApiBaseUrl || deriveCancelledUrl(config.psisApiBaseUrl || config.psis.cancelledUrl));
  }
  return runtimeUrl || config.psisApiBaseUrl || config.psis.registrationUrl;
}

function buildRequest(endpoint, params, args = {}) {
  const baseUrl = resolveEndpoint(endpoint, args);
  const url = safeUrl(baseUrl, endpoint === "cancelled" ? config.psis.cancelledUrl : config.psis.registrationUrl);

  // Start with query parameters already pasted into PSIS_API_BASE_URL or psisApiUrl.
  const merged = new URLSearchParams(url.searchParams);

  // Explicit tool parameters must override the pasted URL. This lets SVC01 become SVC02/SVC08 automatically.
  for (const [key, value] of cleanParams(params).entries()) merged.set(key, value);

  if (!merged.get("serviceType")) merged.set("serviceType", config.psis.serviceType);

  // AA002 is the HTML widget variant: browsers render it, but it never returns parseable data.
  // Users often paste full PSIS URLs containing serviceType=AA002, so coerce it to the XML variant.
  if (merged.get("serviceType") === "AA002") merged.set("serviceType", "AA001");

  // Allow either a full pasted URL with apiKey=... or a separate server-side/user-provided key.
  const separateKey = args.apiKey || args.psisApiKey || config.psisApiKey;
  if (!merged.get("apiKey") && separateKey) merged.set("apiKey", separateKey);

  if (!merged.get("apiKey")) {
    const err = new Error("PSIS API key is not configured. Use /mcp?psisApiKey=YOUR_KEY or set PSIS_API_BASE_URL/PSIS_API_KEY.");
    err.code = "NO_API_KEY";
    throw err;
  }

  url.search = merged.toString();
  return { url, params: merged };
}

async function fetchPsis(endpoint, params, args = {}) {
  const { url, params: mergedParams } = buildRequest(endpoint, params, args);
  const key = cacheKey(endpoint, mergedParams);
  const cached = getCache(key);
  if (cached) return cached;

  const upstreamStarted = Date.now();
  try {
    const response = await requestTextWithFallback(url, {
      timeoutMs: config.requestTimeoutMs,
      mode: config.httpClientMode,
      headers: { "Accept": "application/xml,text/xml,application/json,*/*" }
    });
    upstreamObserver?.(Date.now() - upstreamStarted, response.ok, false);
    const rawText = response.rawText;
    let parsed = null;
    try {
      parsed = rawText.trim().startsWith("{") || rawText.trim().startsWith("[")
        ? JSON.parse(rawText)
        : parser.parse(rawText);
      parsed = normalizeXmlValue(parsed);
    } catch {
      parsed = { rawText };
    }
    const looksLikeHtml = /^\s*(<!DOCTYPE\s+html|<html)/i.test(rawText);
    const error = (looksLikeHtml
      ? { code: "PSIS_HTML_RESPONSE", message: "PSIS가 XML 대신 HTML 페이지를 반환했습니다. serviceType이 AA001인지, apiKey가 유효한지 확인하세요." }
      : findError(parsed)) || (!response.ok ? { code: `HTTP_${response.status}`, message: response.statusText } : null);
    const requestUrl = new URL(url.toString());
    if (requestUrl.searchParams.has("apiKey")) requestUrl.searchParams.set("apiKey", "[REDACTED]");
    const result = {
      ok: response.ok && !error,
      cached: false,
      status: response.status,
      transport: response.transport,
      transportDiagnostics: response.diagnostics,
      error,
      items: findItems(parsed),
      parsed,
      rawText: rawText.slice(0, 2000),
      request: {
        endpoint,
        url: sanitizeUrlForLog(requestUrl.toString()),
        params: redactParams(mergedParams)
      }
    };
    setCache(key, result);
    return result;
  } catch (error) {
    upstreamObserver?.(Date.now() - upstreamStarted, false, error?.code === "PSIS_TIMEOUT");
    const err = new Error(error?.message || "PSIS API request failed.");
    err.code = error?.code || "PSIS_FETCH_FAILED";
    err.details = error?.details || {
      suggestions: diagnosticSuggestions(url)
    };
    throw err;
  }
}

export async function debugPsisConnection(args = {}) {
  const params = {
    serviceCode: "SVC01",
    serviceType: args.serviceType || undefined,
    displayCount: limitCount(args.displayCount || 1),
    startPoint: 1,
    pestiBrandName: args.pestiBrandName || ""
  };
  let request = null;
  try {
    const built = buildRequest("registration", params, args);
    const requestUrl = new URL(built.url.toString());
    if (requestUrl.searchParams.has("apiKey")) requestUrl.searchParams.set("apiKey", "[REDACTED]");
    request = {
      endpoint: "registration",
      url: sanitizeUrlForLog(requestUrl.toString()),
      params: redactParams(built.params),
      target: {
        protocol: built.url.protocol,
        hostname: built.url.hostname,
        port: built.url.port || (built.url.protocol === "https:" ? "443" : "80"),
        pathname: built.url.pathname
      }
    };

    const result = await fetchPsis("registration", params, args);
    return {
      ok: result.ok,
      status: result.status,
      transport: result.transport,
      transportDiagnostics: result.transportDiagnostics,
      error: result.error,
      itemCount: (result.items || []).length,
      rawTextPreview: result.rawText,
      request: result.request || request,
      httpClientMode: config.httpClientMode
    };
  } catch (error) {
    return {
      ok: false,
      code: error?.code || "PSIS_FETCH_FAILED",
      message: error?.message || String(error),
      details: error?.details || null,
      request,
      httpClientMode: config.httpClientMode
    };
  }
}

export async function testConnection(args = {}) {
  return searchPesticides({ ...args, pestiBrandName: args.pestiBrandName || "", displayCount: 1 });
}

export async function searchPesticides(args = {}) {
  const params = {
    serviceCode: "SVC01",
    serviceType: args.serviceType || undefined,
    displayCount: limitCount(args.displayCount),
    startPoint: Number(args.startPoint || 1),
    useName: args.useName,
    cropName: args.cropName,
    cropCheck: args.cropCheck || (args.exactCrop ? "Y" : undefined),
    cropName2: args.cropName2,
    cropCheck2: args.cropCheck2,
    cropName3: args.cropName3,
    cropCheck3: args.cropCheck3,
    cropName4: args.cropName4,
    cropCheck4: args.cropCheck4,
    diseaseWeedName: args.diseaseWeedName,
    similarFlag: args.similarFlag || (args.similarPest ? "Y" : "N"),
    pestiKorName: args.pestiKorName,
    pestiBrandName: args.pestiBrandName || args.brandName,
    compName: args.compName || args.companyName
  };
  return fetchPsis("registration", params, args);
}

export async function getPesticideDetail(args = {}) {
  if (!args.pestiCode || !args.diseaseUseSeq) {
    const err = new Error("pestiCode and diseaseUseSeq are required.");
    err.code = "MISSING_DETAIL_KEYS";
    throw err;
  }
  return fetchPsis("registration", {
    serviceCode: "SVC02",
    serviceType: args.serviceType || undefined,
    pestiCode: args.pestiCode,
    diseaseUseSeq: args.diseaseUseSeq
  }, args);
}

export async function searchCancelledPesticides(args = {}) {
  return fetchPsis("cancelled", {
    serviceCode: "SVC08",
    serviceType: args.serviceType || undefined,
    displayCount: limitCount(args.displayCount),
    startPoint: Number(args.startPoint || 1),
    pestiKorName: args.pestiKorName,
    pestiBrandName: args.pestiBrandName || args.brandName,
    compName: args.compName || args.companyName
  }, args);
}

export async function rawPsisRequest(args = {}) {
  const endpoint = args.endpoint === "cancelled" ? "cancelled" : "registration";
  const params = normalizeRawPsisParams(args.params || {});
  return fetchPsis(endpoint, params, args);
}

export function getCacheStats() {
  return {
    enabled: config.cache.enabled,
    entries: responseCache.size,
    maxEntries: config.cache.maxEntries,
    hits: cacheHits,
    misses: cacheMisses,
    hitRatio: cacheHits + cacheMisses > 0 ? Number((cacheHits / (cacheHits + cacheMisses)).toFixed(3)) : 0
  };
}

export function describePsisConfig() {
  const hasFullUrl = Boolean(config.psisApiBaseUrl);
  const hasKey = Boolean(config.psisApiKey);
  let redactedBaseUrl = "";
  if (hasFullUrl) {
    const u = safeUrl(config.psisApiBaseUrl, config.psis.registrationUrl);
    if (u.searchParams.has("apiKey")) u.searchParams.set("apiKey", "[REDACTED]");
    redactedBaseUrl = u.toString();
  }
  return {
    mode: hasFullUrl ? "full-url" : (hasKey ? "api-key" : "query-key-or-not-configured"),
    psisApiBaseUrlConfigured: hasFullUrl,
    psisApiKeyConfigured: hasKey,
    redactedPsisApiBaseUrl: redactedBaseUrl,
    defaultServiceType: config.psis.serviceType,
    requestTimeoutMs: config.requestTimeoutMs,
    httpClientMode: config.httpClientMode,
    cache: {
      enabled: config.cache.enabled,
      ttlMs: config.cache.ttlMs,
      maxEntries: config.cache.maxEntries,
      currentEntries: responseCache.size,
      hits: cacheHits,
      misses: cacheMisses
    },
    rateLimit: {
      enabled: config.rateLimit.enabled,
      windowMs: config.rateLimit.windowMs,
      maxPerIp: config.rateLimit.maxPerIp,
      maxPerKey: config.rateLimit.maxPerKey
    },
    fit: config.fit,
    acceptedQueryKeyExamples: [
      "https://YOUR_DOMAIN/mcp?psisApiKey=YOUR_KEY",
      "https://YOUR_DOMAIN/mcp?apiKey=YOUR_KEY"
    ],
    acceptedFullUrlExample: "http://psis.rda.go.kr/openApi/service.do?apiKey=YOUR_KEY&serviceCode=SVC01&serviceType=AA001"
  };
}
