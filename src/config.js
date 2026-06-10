function numberEnv(name, fallback, { min, max } = {}) {
  const raw = process.env[name];
  const value = Number(raw ?? fallback);
  const safe = Number.isFinite(value) ? value : fallback;
  return Math.max(min ?? safe, Math.min(max ?? safe, safe));
}

function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

export const config = {
  port: Number(process.env.PORT || 3000),
  // Option A: put only the issued API key here. Public shared operation should prefer URL query keys per user.
  psisApiKey: process.env.PSIS_API_KEY || "",
  // Option B: paste the full PSIS API URL here, including apiKey/serviceCode/serviceType.
  // Example: http://psis.rda.go.kr/openApi/service.do?apiKey=ISSUED_KEY&serviceCode=SVC01&serviceType=AA002
  psisApiBaseUrl: process.env.PSIS_API_BASE_URL || "",
  // Optional full cancelled API URL. If omitted, the server derives cnclAgchm.do from the registration URL.
  psisCancelledApiBaseUrl: process.env.PSIS_CANCELLED_API_BASE_URL || "",
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "",
  maxDisplayCount: numberEnv("MAX_DISPLAY_COUNT", 50, { min: 1, max: 50 }),
  requestTimeoutMs: numberEnv("REQUEST_TIMEOUT_MS", 15000, { min: 1000, max: 60000 }),
  httpClientMode: process.env.PSIS_HTTP_CLIENT || "fetch-first",
  cache: {
    enabled: boolEnv("CACHE_ENABLED", true),
    ttlMs: numberEnv("CACHE_TTL_MS", 21600000, { min: 0, max: 86400000 }),
    maxEntries: numberEnv("CACHE_MAX_ENTRIES", 1000, { min: 50, max: 10000 })
  },
  rateLimit: {
    enabled: boolEnv("RATE_LIMIT_ENABLED", true),
    windowMs: numberEnv("RATE_LIMIT_WINDOW_MS", 60000, { min: 1000, max: 3600000 }),
    maxPerIp: numberEnv("RATE_LIMIT_MAX_PER_IP", 60, { min: 1, max: 10000 }),
    maxPerKey: numberEnv("RATE_LIMIT_MAX_PER_KEY", 60, { min: 1, max: 10000 })
  },
  fit: {
    maxCandidateSearches: numberEnv("FIT_MAX_CANDIDATE_SEARCHES", 10, { min: 1, max: 20 }),
    searchDisplayCount: numberEnv("FIT_SEARCH_DISPLAY_COUNT", 10, { min: 1, max: 50 }),
    maxReturnedItems: numberEnv("FIT_MAX_RETURNED_ITEMS", 100, { min: 10, max: 500 }),
    maxDetailLookups: numberEnv("MAX_DETAIL_LOOKUPS", 5, { min: 0, max: 10 })
  },
  logs: {
    safeAccessLog: boolEnv("SAFE_ACCESS_LOG", true)
  },
  psis: {
    registrationUrl: "http://psis.rda.go.kr/openApi/service.do",
    cancelledUrl: "http://psis.rda.go.kr/openApi/cnclAgchm.do",
    // AA001 returns machine-readable XML. AA002 returns an HTML search widget that browsers can
    // render but this server cannot parse, so AA001 must be the default for API calls.
    serviceType: process.env.PSIS_SERVICE_TYPE || "AA001"
  }
};
