import { config } from "../config.js";
import { buildCandidateResult, evaluateFit, normalizeLandscapeTerms } from "../landscape.js";
import {
  debugPsisConnection,
  getPesticideDetail,
  rawPsisRequest,
  searchCancelledPesticides,
  searchPesticides,
  testConnection
} from "../psisClient.js";

async function checkLandscapePesticideFit(args) {
  const normalized = normalizeLandscapeTerms({ cropName: args.cropName, targetPestOrDisease: args.targetPestOrDisease });
  const cropCandidates = normalized.cropCandidates.slice(0, 4);
  const pestCandidates = normalized.pestOrDiseaseCandidates.slice(0, 3);
  const productName = String(args.productName || "").trim();
  // An explicitly supplied product must never be silently ignored, so purpose wording
  // only triggers candidate mode when no product is given.
  const candidateMode = !productName;
  const searchInputs = [];

  for (const crop of cropCandidates) {
    for (const pest of pestCandidates) {
      searchInputs.push({ crop, pest });
    }
  }

  const limitedSearchInputs = searchInputs.slice(0, config.fit.maxCandidateSearches);
  const searches = limitedSearchInputs.map(({ crop, pest }) => searchPesticides({
    psisApiUrl: args.psisApiUrl,
    psisApiKey: args.psisApiKey,
    apiKey: args.apiKey,
    serviceType: args.serviceType,
    pestiBrandName: candidateMode ? undefined : productName,
    cropName: crop,
    diseaseWeedName: pest,
    similarFlag: "Y",
    displayCount: config.fit.searchDisplayCount
  }).catch((error) => ({ ok: false, error: { code: error.code || "SEARCH_ERROR", message: error.message }, items: [] })));
  const results = await Promise.all(searches);
  const registrationItems = results.flatMap((r) => r.items || []).slice(0, config.fit.maxReturnedItems);

  const cancelled = candidateMode
    ? { ok: true, skipped: true, reason: "제품명이 없는 등록 약제 후보 검색에서는 등록취소 전체 목록을 조회하지 않습니다.", items: [] }
    : await searchCancelledPesticides({
        psisApiUrl: args.psisApiUrl,
        psisApiKey: args.psisApiKey,
        apiKey: args.apiKey,
        serviceType: args.serviceType,
        pestiBrandName: productName,
        displayCount: config.fit.searchDisplayCount
      }).catch((error) => ({ ok: false, error: { code: error.code || "CANCELLED_SEARCH_ERROR", message: error.message }, items: [] }));

  const fit = candidateMode
    ? buildCandidateResult({
        cropName: args.cropName,
        targetPestOrDisease: args.targetPestOrDisease,
        registrationItems,
        cancelledItems: cancelled.items || [],
        maxCandidates: config.fit.maxReturnedItems,
        useMonth: args.useMonth,
        dilution: args.dilution,
        applicationMethod: args.applicationMethod
      })
    : evaluateFit({ ...args, productName, registrationItems, cancelledItems: cancelled.items || [] });

  return {
    mode: candidateMode ? "candidate_search" : "product_fit_check",
    normalized,
    limits: {
      candidateSearchesPlanned: searchInputs.length,
      candidateSearchesExecuted: limitedSearchInputs.length,
      fitSearchDisplayCount: config.fit.searchDisplayCount,
      maxReturnedItems: config.fit.maxReturnedItems
    },
    searchResults: results.map((r) => ({ ok: r.ok, cached: r.cached, error: r.error, request: r.request, count: (r.items || []).length })),
    cancelledSearch: { ok: cancelled.ok, skipped: cancelled.skipped || false, reason: cancelled.reason, error: cancelled.error, request: cancelled.request, count: (cancelled.items || []).length },
    fit
  };
}

export async function callTool(name, args = {}) {
  switch (name) {
    case "psis_test_connection":
      return testConnection(args);
    case "psis_search_pesticides":
      return searchPesticides(args);
    case "psis_debug_connection":
      return debugPsisConnection(args);
    case "psis_get_pesticide_detail":
      return getPesticideDetail(args);
    case "psis_search_cancelled_pesticides":
      return searchCancelledPesticides(args);
    case "normalize_landscape_terms":
      return normalizeLandscapeTerms(args);
    case "check_landscape_pesticide_fit":
      return checkLandscapePesticideFit(args);
    case "psis_raw_request":
      return rawPsisRequest(args);
    default: {
      const error = new Error(`Unknown tool: ${name}`);
      error.code = "UNKNOWN_TOOL";
      throw error;
    }
  }
}
