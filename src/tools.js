import { searchPesticides, getPesticideDetail, searchCancelledPesticides, rawPsisRequest, testConnection, debugPsisConnection } from "./psisClient.js";
import { normalizeLandscapeTerms, evaluateFit } from "./landscape.js";
import { config } from "./config.js";

const inputString = { type: "string" };
const psisApiUrlProperty = {
  ...inputString,
  description: "선택. 농약안전정보시스템 전체 호출 URL. 예: http://psis.rda.go.kr/openApi/service.do?apiKey=발급키&serviceCode=SVC01&serviceType=AA001"
};
const psisApiKeyProperty = {
  ...inputString,
  description: "선택. URL query 방식이 아닌 도구 인자로 직접 전달하는 PSIS API 키. 운영용은 /mcp?psisApiKey=발급키 방식을 권장합니다."
};

const readOnlyAnnotations = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
});

function withReadOnlyHints(tool, meta = {}) {
  return {
    ...tool,
    annotations: {
      ...readOnlyAnnotations,
      ...(tool.annotations || {})
    },
    _meta: {
      "openai/toolInvocation/invoking": meta.invoking || "농약등록정보를 조회하고 있습니다.",
      "openai/toolInvocation/invoked": meta.invoked || "농약등록정보 조회가 완료되었습니다.",
      ...(tool._meta || {}),
      ...(meta.extraMeta || {})
    }
  };
}

const internalTools = [
  {
    name: "psis_test_connection",
    description: "농약안전정보시스템 API 키 또는 전체 PSIS URL이 정상 작동하는지 테스트합니다.",
    inputSchema: {
      type: "object",
      properties: {
        psisApiUrl: psisApiUrlProperty,
        psisApiKey: psisApiKeyProperty,
        apiKey: psisApiKeyProperty,
        pestiBrandName: { ...inputString, description: "선택. 테스트용 상표명" }
      },
      additionalProperties: false
    }
  },

  {
    name: "psis_debug_connection",
    description: "PSIS 원본 API 연결을 fetch 및 Node http fallback 관점에서 진단합니다. 브라우저에서는 되는데 MCP 서버에서 fetch failed가 날 때 사용합니다.",
    inputSchema: {
      type: "object",
      properties: {
        psisApiUrl: psisApiUrlProperty,
        psisApiKey: psisApiKeyProperty,
        apiKey: psisApiKeyProperty,
        pestiBrandName: { ...inputString, description: "선택. 테스트용 상표명. 예: 살비왕" },
        serviceType: { ...inputString, description: "선택. 기본 AA001." },
        displayCount: { type: "integer", minimum: 1, maximum: 50 }
      },
      additionalProperties: false
    }
  },
  {
    name: "psis_search_pesticides",
    description: "농약등록정보 목록(SVC01)을 상표명, 품목명, 작물명, 적용병해충명 등으로 검색합니다. psisApiUrl을 넣으면 그 URL의 apiKey/serviceType을 그대로 사용합니다.",
    inputSchema: {
      type: "object",
      properties: {
        psisApiUrl: psisApiUrlProperty,
        psisApiKey: psisApiKeyProperty,
        apiKey: psisApiKeyProperty,
        pestiBrandName: { ...inputString, description: "상표명 검색어. 예: 살비왕, 오티바" },
        pestiKorName: { ...inputString, description: "품목명 검색어. 예: 펜피록시메이트 액상수화제" },
        cropName: { ...inputString, description: "작물명 검색어. 예: 소나무, 조경수" },
        cropCheck: { ...inputString, enum: ["Y", "N"], description: "Y이면 작물명 정확 일치" },
        diseaseWeedName: { ...inputString, description: "적용병해충 검색어. 예: 응애류" },
        similarFlag: { ...inputString, enum: ["Y", "N"], description: "Y이면 적용병해충 유사도 검색" },
        useName: { ...inputString, description: "용도 검색어. 예: 살균제, 살충제" },
        compName: { ...inputString, description: "회사명 검색어" },
        serviceType: { ...inputString, description: "선택. 기본 AA001. PSIS 서버 파싱용 XML 응답입니다." },
        displayCount: { type: "integer", minimum: 1, maximum: 50 }
      },
      additionalProperties: false
    }
  },
  {
    name: "psis_get_pesticide_detail",
    description: "농약등록정보 상세(SVC02)를 pestiCode와 diseaseUseSeq로 조회합니다. psisApiUrl에 SVC01이 들어 있어도 자동으로 SVC02로 바꿔 호출합니다.",
    inputSchema: {
      type: "object",
      properties: {
        psisApiUrl: psisApiUrlProperty,
        psisApiKey: psisApiKeyProperty,
        apiKey: psisApiKeyProperty,
        pestiCode: { ...inputString, description: "농약품목코드 상세정보 조회키" },
        diseaseUseSeq: { ...inputString, description: "병해충사용방법 상세정보 조회키" },
        serviceType: { ...inputString, description: "선택. 기본 AA001." }
      },
      required: ["pestiCode", "diseaseUseSeq"],
      additionalProperties: false
    }
  },
  {
    name: "psis_search_cancelled_pesticides",
    description: "등록취소 농약정보(SVC08)를 상표명, 품목명, 회사명으로 검색합니다. service.do URL을 넣으면 cnclAgchm.do로 자동 변환합니다.",
    inputSchema: {
      type: "object",
      properties: {
        psisApiUrl: psisApiUrlProperty,
        psisApiKey: psisApiKeyProperty,
        apiKey: psisApiKeyProperty,
        pestiBrandName: { ...inputString, description: "상표명 검색어" },
        pestiKorName: { ...inputString, description: "품목명 검색어" },
        compName: { ...inputString, description: "회사명 검색어" },
        serviceType: { ...inputString, description: "선택. 기본 AA001." },
        displayCount: { type: "integer", minimum: 1, maximum: 50 }
      },
      additionalProperties: false
    }
  },
  {
    name: "normalize_landscape_terms",
    description: "조경 현장 표현을 농약등록정보 검색 후보어로 정규화합니다. 예: 소나무 → 소나무, 조경수, 수목류, 산림수목.",
    inputSchema: {
      type: "object",
      properties: {
        rawCropName: { ...inputString, description: "원래 수종/작물명" },
        rawPestOrDiseaseName: { ...inputString, description: "원래 병해충/증상명" }
      },
      additionalProperties: false
    }
  },
  {
    name: "check_landscape_pesticide_fit",
    description: "제품명, 수종, 병해충을 기준으로 PSIS 등록정보와 등록취소 정보를 조회해 조경 약품 적합성을 판정합니다. psisApiUrl을 넣으면 그 URL의 apiKey를 사용합니다.",
    inputSchema: {
      type: "object",
      properties: {
        psisApiUrl: psisApiUrlProperty,
        psisApiKey: psisApiKeyProperty,
        apiKey: psisApiKeyProperty,
        productName: { ...inputString, description: "제품명/상표명. 예: 살비왕, 오티바" },
        cropName: { ...inputString, description: "수종/작물명. 예: 소나무" },
        targetPestOrDisease: { ...inputString, description: "대상 병해충. 예: 응애류, 잎마름병" },
        purpose: { ...inputString, description: "방제 목적 설명" },
        useMonth: { type: "integer", minimum: 1, maximum: 12, description: "사용 월. 예: 6" },
        dilution: { ...inputString, description: "실제 희석배수. 선택" },
        applicationMethod: { ...inputString, description: "살포방법. 선택" },
        serviceType: { ...inputString, description: "선택. 기본 AA001." }
      },
      required: ["productName", "cropName", "targetPestOrDisease"],
      additionalProperties: false
    }
  },
  {
    name: "psis_raw_request",
    description: "고급 사용자용. PSIS API에 임의 파라미터를 전달해 원시 조회를 수행합니다. endpoint는 registration 또는 cancelled입니다.",
    inputSchema: {
      type: "object",
      properties: {
        psisApiUrl: psisApiUrlProperty,
        psisApiKey: psisApiKeyProperty,
        apiKey: psisApiKeyProperty,
        endpoint: { ...inputString, enum: ["registration", "cancelled"] },
        params: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } }
      },
      required: ["endpoint", "params"],
      additionalProperties: false
    }
  }
];

const publicFitTool = withReadOnlyHints({
  name: "check_landscape_pesticide_fit",
  description: "읽기 전용 단일 조회 도구입니다. 제품명, 수종/작물명, 병해충명을 한 번에 받아 PSIS 등록정보와 등록취소 정보를 내부적으로 조회하고 조경 약품 사용 적합성을 판정합니다. 서버 URL의 ?psisApiKey= 또는 ?apiKey= 값을 자동 사용합니다.",
  inputSchema: {
    type: "object",
    properties: {
      productName: { ...inputString, description: "제품명/상표명. 예: 살비왕, 오티바" },
      cropName: { ...inputString, description: "수종/작물명. 예: 소나무, 조경수, 장미" },
      targetPestOrDisease: { ...inputString, description: "대상 병해충. 예: 응애류, 점박이응애, 잎마름병" },
      purpose: { ...inputString, description: "방제 목적 설명. 선택" },
      useMonth: { type: "integer", minimum: 1, maximum: 12, description: "사용 월. 예: 6" },
      dilution: { ...inputString, description: "실제 희석배수. 선택" },
      applicationMethod: { ...inputString, description: "살포방법. 선택" }
    },
    required: ["productName", "cropName", "targetPestOrDisease"],
    additionalProperties: false
  }
}, {
  invoking: "농약안전정보시스템에서 등록 여부를 조회하고 있습니다.",
  invoked: "농약 등록 적합성 판정이 완료되었습니다."
});

export const allTools = internalTools.map((tool) => withReadOnlyHints(tool));
export const tools = config.mcpPublicTools === "all" ? allTools : [publicFitTool];

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
    case "check_landscape_pesticide_fit": {
      const normalized = normalizeLandscapeTerms({ cropName: args.cropName, targetPestOrDisease: args.targetPestOrDisease });
      const cropCandidates = normalized.cropCandidates.slice(0, 4);
      const pestCandidates = normalized.pestOrDiseaseCandidates.slice(0, 3);
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
        pestiBrandName: args.productName,
        cropName: crop,
        diseaseWeedName: pest,
        similarFlag: "Y",
        displayCount: config.fit.searchDisplayCount
      }).catch((error) => ({ ok: false, error: { code: error.code || "SEARCH_ERROR", message: error.message }, items: [] })));
      const results = await Promise.all(searches);
      const registrationItems = results.flatMap((r) => r.items || []).slice(0, config.fit.maxReturnedItems);
      const cancelled = await searchCancelledPesticides({
        psisApiUrl: args.psisApiUrl,
        psisApiKey: args.psisApiKey,
        apiKey: args.apiKey,
        serviceType: args.serviceType,
        pestiBrandName: args.productName,
        displayCount: config.fit.searchDisplayCount
      }).catch((error) => ({ ok: false, error: { code: error.code || "CANCELLED_SEARCH_ERROR", message: error.message }, items: [] }));
      return {
        normalized,
        limits: {
          candidateSearchesPlanned: searchInputs.length,
          candidateSearchesExecuted: limitedSearchInputs.length,
          fitSearchDisplayCount: config.fit.searchDisplayCount,
          maxReturnedItems: config.fit.maxReturnedItems
        },
        searchResults: results.map((r) => ({ ok: r.ok, cached: r.cached, error: r.error, request: r.request, count: (r.items || []).length })),
        cancelledSearch: { ok: cancelled.ok, error: cancelled.error, request: cancelled.request, count: (cancelled.items || []).length },
        fit: evaluateFit({ ...args, registrationItems, cancelledItems: cancelled.items || [] })
      };
    }
    case "psis_raw_request":
      return rawPsisRequest(args);
    default: {
      const error = new Error(`Unknown tool: ${name}`);
      error.code = "UNKNOWN_TOOL";
      throw error;
    }
  }
}
