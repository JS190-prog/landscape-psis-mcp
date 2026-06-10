const CROP_SYNONYMS = {
  "소나무": ["소나무", "소나무류", "조경수", "수목류", "산림수목", "침엽수", "Pinus", "pine"],
  "곰솔": ["곰솔", "해송", "소나무", "소나무류", "조경수", "수목류", "산림수목", "침엽수"],
  "반송": ["반송", "소나무", "소나무류", "조경수", "수목류", "산림수목", "침엽수"],
  "잣나무": ["잣나무", "소나무", "소나무류", "조경수", "수목류", "산림수목", "침엽수"],
  "향나무": ["향나무", "조경수", "수목류", "침엽수"],
  "주목": ["주목", "조경수", "수목류", "침엽수"],
  "철쭉": ["철쭉", "산철쭉", "조경수", "관상수", "화목류"],
  "회양목": ["회양목", "조경수", "관상수", "수목류"],
  "사철나무": ["사철나무", "조경수", "관상수", "수목류"],
  "느티나무": ["느티나무", "조경수", "가로수", "수목류"],
  "배롱나무": ["배롱나무", "조경수", "화목류", "수목류"],
  "조경수": ["조경수", "수목류", "관상수", "가로수", "산림수목"]
};

const PEST_SYNONYMS = {
  "응애": ["응애", "응애류", "점박이응애", "차응애"],
  "깍지벌레": ["깍지벌레", "깍지벌레류", "가루깍지벌레", "솜깍지벌레"],
  "진딧물": ["진딧물", "진딧물류"],
  "솔잎혹파리": ["솔잎혹파리"],
  "솔수염하늘소": ["솔수염하늘소", "북방수염하늘소", "하늘소"],
  "재선충": ["소나무재선충", "재선충", "소나무재선충병"],
  "잎마름병": ["잎마름병", "엽고병", "갈색무늬병", "반점병"],
  "가지마름병": ["가지마름병", "줄기마름병", "마름병"],
  "병해": ["병해", "잎마름병", "가지마름병", "반점병", "곰팡이병"],
  "해충": ["해충", "응애류", "깍지벌레류", "진딧물류", "하늘소", "혹파리"]
};

const DEFAULT_REQUIRED_INFO = Object.freeze(["제품 라벨", "SDS/MSDS", "현장 병해충 진단", "약해·비산·민원 위험 확인"]);
const METHOD_KEYWORDS = Object.freeze([
  "경엽처리",
  "나무주사",
  "수간주사",
  "관주처리",
  "토양처리",
  "분무처리",
  "살포"
]);

function uniq(values) {
  return [...new Set(values.filter(Boolean).map((v) => String(v).trim()).filter(Boolean))];
}

function normalizeComparable(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()\[\]{}·ㆍ,._-]/g, "")
    .trim();
}

export function normalizeLandscapeTerms(args = {}) {
  const rawCropName = args.rawCropName || args.cropName || "";
  const rawPestOrDiseaseName = args.rawPestOrDiseaseName || args.diseaseWeedName || args.targetPestOrDisease || "";
  const cropCandidates = [];
  const pestCandidates = [];

  for (const [key, values] of Object.entries(CROP_SYNONYMS)) {
    if (rawCropName.includes(key) || values.some((v) => rawCropName.toLowerCase().includes(String(v).toLowerCase()))) {
      cropCandidates.push(...values);
    }
  }
  if (rawCropName) cropCandidates.unshift(rawCropName);

  for (const [key, values] of Object.entries(PEST_SYNONYMS)) {
    if (rawPestOrDiseaseName.includes(key) || values.some((v) => rawPestOrDiseaseName.toLowerCase().includes(String(v).toLowerCase()))) {
      pestCandidates.push(...values);
    }
  }
  if (rawPestOrDiseaseName) pestCandidates.unshift(rawPestOrDiseaseName);

  return {
    rawCropName,
    rawPestOrDiseaseName,
    cropCandidates: uniq(cropCandidates.length ? cropCandidates : [rawCropName]),
    pestOrDiseaseCandidates: uniq(pestCandidates.length ? pestCandidates : [rawPestOrDiseaseName]),
    notes: [
      "작물명은 정확 일치를 우선하고, 실패 시 조경수/수목류/산림수목 같은 상위어로 재검색하세요.",
      "병해충명이 증상 표현뿐이면 API 등록명과 직접 일치하지 않을 수 있으므로 현장 진단 자료가 필요합니다."
    ]
  };
}

function cleanNeedles(needles = []) {
  return needles.map((n) => String(n ?? "").trim()).filter(Boolean);
}

function containsAny(haystack, needles) {
  const text = String(haystack || "").toLowerCase();
  const validNeedles = cleanNeedles(needles);
  if (!text || !validNeedles.length) return false;
  return validNeedles.some((n) => text.includes(n.toLowerCase()));
}

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return [
    "pestiBrandName",
    "brandName",
    "pestiKorName",
    "cropName",
    "diseaseWeedName",
    "pestiCode",
    "diseaseUseSeq",
    "prdlstRegistNo"
  ].some((key) => value[key] !== undefined);
}

export function flattenPsisRecords(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenPsisRecords(item));
  if (typeof value !== "object") return [];
  if (isRecord(value)) return [value];
  return Object.values(value).flatMap((child) => flattenPsisRecords(child));
}

function getUseCategory(useName) {
  const u = String(useName || "");
  if (u.includes("살균")) return "살균제";
  if (u.includes("살비")) return "살비제";
  if (u.includes("살충")) return "살충제";
  if (u.includes("제초")) return "제초제";
  return u || "미상";
}

function expectedCategory(target) {
  const t = String(target || "");
  if (containsAny(t, ["응애"])) return "살비제";
  if (containsAny(t, ["병", "마름", "반점", "곰팡이"])) return "살균제";
  if (containsAny(t, ["벌레", "진딧물", "깍지", "하늘소", "혹파리", "해충"])) return "살충제";
  return "미상";
}

function categoryCompatible(actual, expected) {
  if (expected === "미상") return true;
  if (actual === expected) return true;
  // PSIS often classifies acaricide registrations under the broader 살충 useName.
  if (expected === "살비제" && actual === "살충제") return true;
  return false;
}

function recordKey(item) {
  const keyParts = [item.pestiCode, item.diseaseUseSeq].map((v) => String(v || "").trim());
  if (keyParts.every(Boolean)) return `detail:${keyParts.join(":")}`;
  return [
    item.pestiBrandName || item.brandName || "",
    item.pestiKorName || "",
    item.compName || "",
    item.cropName || "",
    item.diseaseWeedName || "",
    item.pestiUse || "",
    item.dilutUnit || ""
  ].join("|");
}

function extractNumber(value) {
  const compact = String(value || "").replace(/,/g, "");
  const match = compact.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function compareDilution(inputDilution, registeredDilution) {
  if (!inputDilution) return { status: "미입력", input: "", registered: registeredDilution || "", message: "희석배수 입력값이 없어 자동 비교하지 않았습니다." };
  if (!registeredDilution) return { status: "확인필요", input: String(inputDilution), registered: "", message: "등록 희석배수 값이 비어 있어 제품 라벨 확인이 필요합니다." };

  const inputNumber = extractNumber(inputDilution);
  const registeredNumber = extractNumber(registeredDilution);
  if (inputNumber !== null && registeredNumber !== null) {
    if (inputNumber === registeredNumber) {
      return { status: "일치", input: String(inputDilution), registered: String(registeredDilution), message: "입력 희석배수가 등록 희석배수와 일치합니다." };
    }
    return { status: "불일치", input: String(inputDilution), registered: String(registeredDilution), message: "입력 희석배수가 등록 희석배수와 다릅니다. 등록 라벨 기준을 다시 확인해야 합니다." };
  }

  const inputNorm = normalizeComparable(inputDilution);
  const registeredNorm = normalizeComparable(registeredDilution);
  if (inputNorm && registeredNorm && registeredNorm.includes(inputNorm)) {
    return { status: "일치", input: String(inputDilution), registered: String(registeredDilution), message: "입력 희석배수 문구가 등록 희석배수에 포함됩니다." };
  }
  return { status: "확인필요", input: String(inputDilution), registered: String(registeredDilution), message: "희석배수 형식을 자동 비교하기 어려워 제품 라벨과 수동 대조가 필요합니다." };
}

function normalizeMethod(value) {
  const text = String(value || "");
  const found = METHOD_KEYWORDS.find((keyword) => text.includes(keyword));
  if (found === "수간주사") return "나무주사";
  if (found === "분무처리" || found === "살포") return found;
  return found || normalizeComparable(text);
}

export function compareApplicationMethod(inputMethod, registeredUseText) {
  if (!inputMethod) return { status: "미입력", input: "", registered: registeredUseText || "", message: "살포방법 입력값이 없어 자동 비교하지 않았습니다." };
  if (!registeredUseText) return { status: "확인필요", input: String(inputMethod), registered: "", message: "등록 사용방법 값이 비어 있어 제품 라벨 확인이 필요합니다." };

  const inputNorm = normalizeMethod(inputMethod);
  const registeredNorm = normalizeMethod(registeredUseText);
  const registeredRaw = normalizeComparable(registeredUseText);
  const inputRaw = normalizeComparable(inputMethod);

  if (inputNorm && registeredNorm && (registeredNorm === inputNorm || registeredRaw.includes(inputRaw))) {
    return { status: "일치", input: String(inputMethod), registered: String(registeredUseText), message: "입력 살포방법이 등록 사용방법과 일치합니다." };
  }
  return { status: "불일치", input: String(inputMethod), registered: String(registeredUseText), message: "입력 살포방법이 등록 사용방법과 다릅니다. 등록 라벨 기준 사용방법을 확인해야 합니다." };
}

function extractMonths(text) {
  const months = new Set();
  for (const match of String(text || "").matchAll(/(1[0-2]|[1-9])\s*월/g)) {
    months.add(Number(match[1]));
  }
  return [...months].sort((a, b) => a - b);
}

export function analyzeUseMonth(useMonth, pestiUse = "", useSuittime = "") {
  const month = Number(useMonth);
  const registeredText = [pestiUse, useSuittime].filter(Boolean).join(" / ");
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { status: "미입력", inputMonth: null, registeredTiming: registeredText, registeredMonths: [], message: "사용월 입력값이 없어 자동 비교하지 않았습니다." };
  }

  const registeredMonths = extractMonths(registeredText);
  if (registeredMonths.length) {
    if (registeredMonths.includes(month)) {
      return { status: "일치", inputMonth: month, registeredTiming: registeredText, registeredMonths, message: `입력 사용월 ${month}월이 등록 사용시기 문구의 월 정보와 일치합니다.` };
    }
    return { status: "불일치", inputMonth: month, registeredTiming: registeredText, registeredMonths, message: `등록 사용시기에는 ${registeredMonths.join("월, ")}월이 명시되어 있으며, 입력 사용월 ${month}월과 일치하지 않습니다.` };
  }

  if (/발생\s*초|발생초|초기|발생기|부화기/.test(registeredText)) {
    return { status: "현장확인", inputMonth: month, registeredTiming: registeredText, registeredMonths, message: "등록 사용시기가 월 기준이 아니라 발생초기·부화기 등 현장 발생 단계 기준입니다. 실제 발생초기 여부를 확인해야 합니다." };
  }

  return { status: "확인필요", inputMonth: month, registeredTiming: registeredText, registeredMonths, message: "등록 사용시기 문구에서 월 정보를 자동 추출하지 못했습니다. 제품 라벨을 수동 확인해야 합니다." };
}

export function summarizeCandidateRecord(item) {
  return {
    pestiCode: item.pestiCode,
    diseaseUseSeq: item.diseaseUseSeq,
    pestiBrandName: item.pestiBrandName || item.brandName || "",
    pestiKorName: item.pestiKorName || "",
    compName: item.compName || "",
    cropName: item.cropName || "",
    diseaseWeedName: item.diseaseWeedName || "",
    useName: item.useName || "",
    useCategory: getUseCategory(item.useName),
    pestiUse: item.pestiUse || "",
    dilutUnit: item.dilutUnit || "",
    useSuittime: item.useSuittime || "",
    useNum: item.useNum || "",
    applyFirstRegDate: item.applyFirstRegDate || "",
    cropLrclNm: item.cropLrclNm || ""
  };
}

function isDirectPestMatch(item, rawTarget, pestCandidates = []) {
  const disease = normalizeComparable(item.diseaseWeedName);
  const raw = normalizeComparable(rawTarget);
  if (raw && disease === raw) return true;
  return pestCandidates.slice(0, 2).some((candidate) => disease && disease === normalizeComparable(candidate));
}

function isCropMatchDirectOrSynonym(item, rawCrop, cropCandidates = []) {
  const crop = normalizeComparable(item.cropName || item.cropLrclNm);
  const raw = normalizeComparable(rawCrop);
  if (raw && crop === raw) return "direct";
  if (cropCandidates.some((candidate) => crop && crop === normalizeComparable(candidate))) return "synonym";
  return "related";
}

function classifyMatch(item, { cropName, targetPestOrDisease, cropCandidates, pestCandidates }) {
  const cropMatchLevel = isCropMatchDirectOrSynonym(item, cropName, cropCandidates);
  const directPest = isDirectPestMatch(item, targetPestOrDisease, pestCandidates);
  return directPest ? (cropMatchLevel === "direct" ? "direct" : "direct_or_synonym") : "related";
}

function analyzeRecord(item, input = {}) {
  const summary = summarizeCandidateRecord(item);
  const monthCheck = analyzeUseMonth(input.useMonth, summary.pestiUse, summary.useSuittime);
  const dilutionCheck = compareDilution(input.dilution, summary.dilutUnit);
  const applicationMethodCheck = compareApplicationMethod(input.applicationMethod, summary.pestiUse);
  const matchLevel = classifyMatch(summary, input);
  const recommendationReasons = [];
  const recordWarnings = [];
  let score = 0;

  if (matchLevel === "direct") {
    score += 60;
    recommendationReasons.push("작물명과 병해충명이 직접 일치합니다.");
  } else if (matchLevel === "direct_or_synonym") {
    score += 50;
    recommendationReasons.push("병해충명이 직접 일치하고 작물명은 동의어 또는 상위분류로 일치합니다.");
  } else {
    score += 25;
    recommendationReasons.push("입력 병해충과 관련된 세부 병해충 등록 후보입니다.");
  }

  if (categoryCompatible(summary.useCategory, expectedCategory(input.targetPestOrDisease))) {
    score += 10;
    recommendationReasons.push("용도 분류가 방제 목적과 호환됩니다.");
  }

  if (input.dilution) {
    if (dilutionCheck.status === "일치") {
      score += 10;
      recommendationReasons.push("희석배수가 입력값과 일치합니다.");
    } else if (dilutionCheck.status === "불일치") {
      score -= 20;
      recordWarnings.push(dilutionCheck.message);
    }
  }

  if (input.applicationMethod) {
    if (applicationMethodCheck.status === "일치") {
      score += 10;
      recommendationReasons.push("살포방법이 입력값과 일치합니다.");
    } else if (applicationMethodCheck.status === "불일치") {
      score -= 20;
      recordWarnings.push(applicationMethodCheck.message);
    }
  }

  if (input.useMonth) {
    if (monthCheck.status === "일치") {
      score += 10;
      recommendationReasons.push("사용월이 등록 사용시기와 일치합니다.");
    } else if (monthCheck.status === "불일치") {
      score -= 30;
      recordWarnings.push(monthCheck.message);
    } else if (monthCheck.status === "현장확인") {
      recordWarnings.push(monthCheck.message);
    }
  }

  return {
    ...summary,
    matchLevel,
    recommendationScore: score,
    recommendationReasons,
    warnings: recordWarnings,
    monthCheck,
    dilutionCheck,
    applicationMethodCheck
  };
}

function addRanks(records) {
  return records
    .slice()
    .sort((a, b) => b.recommendationScore - a.recommendationScore || String(a.pestiBrandName).localeCompare(String(b.pestiBrandName)))
    .map((item, index) => ({ ...item, recommendationRank: index + 1 }));
}

function buildQualitySummary(records) {
  const warnings = [];
  const allMonthChecks = records.map((item) => item.monthCheck).filter(Boolean);
  const hasMonthMismatch = allMonthChecks.some((check) => check.status === "불일치");
  const hasMonthFieldCheck = allMonthChecks.some((check) => check.status === "현장확인" || check.status === "확인필요");
  if (hasMonthMismatch) warnings.push("일부 후보는 입력 사용월과 등록 사용시기 월 정보가 일치하지 않습니다.");
  if (hasMonthFieldCheck) warnings.push("일부 후보는 월 기준이 아니라 발생초기·부화기 등 현장 단계 기준 사용시기를 포함합니다.");
  if (records.some((item) => item.dilutionCheck?.status === "불일치")) warnings.push("일부 후보는 입력 희석배수와 등록 희석배수가 다릅니다.");
  if (records.some((item) => item.applicationMethodCheck?.status === "불일치")) warnings.push("일부 후보는 입력 살포방법과 등록 사용방법이 다릅니다.");
  return warnings;
}

export function buildCandidateResult({ cropName, targetPestOrDisease, useMonth, dilution, applicationMethod, registrationItems = [], cancelledItems = [], maxCandidates = 20 } = {}) {
  const normalized = normalizeLandscapeTerms({ cropName, targetPestOrDisease });
  const cropCandidates = normalized.cropCandidates;
  const pestCandidates = normalized.pestOrDiseaseCandidates;
  const expected = expectedCategory(targetPestOrDisease);
  const flatRegistrationItems = flattenPsisRecords(registrationItems);
  const flatCancelledItems = flattenPsisRecords(cancelledItems);

  const filtered = flatRegistrationItems.filter((it) => {
    const cropOk = containsAny(it.cropName, cropCandidates) || containsAny(it.cropLrclNm, cropCandidates);
    const pestOk = containsAny(it.diseaseWeedName, pestCandidates);
    const useOk = categoryCompatible(getUseCategory(it.useName), expected) || containsAny(it.useName, [expected]);
    return cropOk && pestOk && useOk;
  });

  const seen = new Set();
  const analyzedCandidates = [];
  for (const item of filtered) {
    const key = recordKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    analyzedCandidates.push(analyzeRecord(item, { cropName, targetPestOrDisease, cropCandidates, pestCandidates, useMonth, dilution, applicationMethod }));
    if (analyzedCandidates.length >= maxCandidates) break;
  }

  const cancelledBrandNames = new Set(
    flatCancelledItems
      .map((it) => String(it.pestiBrandName || it.brandName || "").trim())
      .filter(Boolean)
  );

  const candidatesWithWarnings = analyzedCandidates.map((item) => {
    const cancelledWarning = cancelledBrandNames.has(item.pestiBrandName) ? "동일 상표명이 등록취소 목록에 있으므로 별도 확인 필요" : "";
    return {
      ...item,
      cancelledWarning,
      recommendationScore: item.recommendationScore + (cancelledWarning ? -100 : 0),
      warnings: cancelledWarning ? [...item.warnings, cancelledWarning] : item.warnings
    };
  });
  const rankedCandidates = addRanks(candidatesWithWarnings);
  const directMatches = rankedCandidates.filter((item) => item.matchLevel === "direct" || item.matchLevel === "direct_or_synonym");
  const relatedMatches = rankedCandidates.filter((item) => item.matchLevel === "related");
  const qualityWarnings = buildQualitySummary(rankedCandidates);

  if (!cropName || !targetPestOrDisease) {
    return {
      status: "입력 부족",
      confidence: "낮음",
      reasons: ["등록 약제 후보 검색에는 작물명/수종명과 병해충명이 필요합니다."],
      candidateRecords: [],
      directMatches: [],
      relatedMatches: [],
      matchedRecords: [],
      cancelledRecords: flatCancelledItems,
      warnings: [],
      requiredAdditionalInfo: [
        !cropName ? "작물명/수종명" : null,
        !targetPestOrDisease ? "방제 대상 병해충명" : null
      ].filter(Boolean)
    };
  }

  if (!flatRegistrationItems.length) {
    return {
      status: "등록후보 없음",
      confidence: "낮음",
      reasons: ["작물명과 병해충명 기준으로 조회된 농약등록정보가 없습니다."],
      candidateRecords: [],
      directMatches: [],
      relatedMatches: [],
      matchedRecords: [],
      cancelledRecords: flatCancelledItems,
      warnings: [],
      requiredAdditionalInfo: DEFAULT_REQUIRED_INFO
    };
  }

  if (!rankedCandidates.length) {
    return {
      status: "등록후보 없음",
      confidence: "중간",
      reasons: ["조회 결과는 있으나 입력 작물명/병해충명/용도와 함께 일치하는 후보를 찾지 못했습니다."],
      candidateRecords: [],
      directMatches: [],
      relatedMatches: [],
      matchedRecords: flatRegistrationItems.slice(0, 10).map(summarizeCandidateRecord),
      cancelledRecords: flatCancelledItems,
      warnings: [],
      requiredAdditionalInfo: DEFAULT_REQUIRED_INFO
    };
  }

  return {
    status: "등록후보 있음",
    confidence: directMatches.length ? "중간~높음" : "중간",
    reasons: [
      directMatches.length
        ? "작물명/수종명과 병해충명 기준으로 직접 또는 동의어 일치 등록 약제 후보가 확인되었습니다."
        : "입력 병해충과 관련된 세부 병해충 등록 후보가 확인되었습니다. 정확한 병해충 동정 후 사용해야 합니다.",
      "실제 사용 전 제품 라벨의 희석배수, 사용방법, 사용시기, 사용횟수를 다시 대조해야 합니다."
    ],
    warnings: qualityWarnings,
    candidateRecords: rankedCandidates,
    directMatches,
    relatedMatches,
    matchedRecords: rankedCandidates,
    cancelledRecords: flatCancelledItems,
    requiredAdditionalInfo: DEFAULT_REQUIRED_INFO
  };
}

function buildFitChecks(record, input) {
  return {
    monthCheck: analyzeUseMonth(input.useMonth, record.pestiUse, record.useSuittime),
    dilutionCheck: compareDilution(input.dilution, record.dilutUnit),
    applicationMethodCheck: compareApplicationMethod(input.applicationMethod, record.pestiUse)
  };
}

function collectWarningsFromChecks(checks = {}) {
  const warnings = [];
  if (checks.monthCheck?.status === "불일치") warnings.push(checks.monthCheck.message);
  if (checks.monthCheck?.status === "현장확인") warnings.push(checks.monthCheck.message);
  if (checks.monthCheck?.status === "확인필요") warnings.push(checks.monthCheck.message);
  if (checks.dilutionCheck?.status === "불일치") warnings.push(checks.dilutionCheck.message);
  if (checks.dilutionCheck?.status === "확인필요") warnings.push(checks.dilutionCheck.message);
  if (checks.applicationMethodCheck?.status === "불일치") warnings.push(checks.applicationMethodCheck.message);
  if (checks.applicationMethodCheck?.status === "확인필요") warnings.push(checks.applicationMethodCheck.message);
  return warnings;
}

export function evaluateFit({ productName, cropName, targetPestOrDisease, purpose, useMonth, dilution, applicationMethod, registrationItems = [], cancelledItems = [] }) {
  const normalized = normalizeLandscapeTerms({ cropName, targetPestOrDisease });
  const cropCandidates = normalized.cropCandidates;
  const pestCandidates = normalized.pestOrDiseaseCandidates;
  const product = String(productName || "").trim();
  const target = String(targetPestOrDisease || purpose || "").trim();
  const flatRegistrationItems = flattenPsisRecords(registrationItems);
  const flatCancelledItems = flattenPsisRecords(cancelledItems);

  const cancelledMatches = product
    ? flatCancelledItems.filter((it) => containsAny(it.pestiBrandName || it.brandName || "", [product]) || containsAny(product, [it.pestiBrandName || it.brandName]))
    : [];
  if (cancelledMatches.length) {
    return {
      status: "부적합",
      confidence: "높음",
      reasons: ["등록취소 농약정보에서 동일 또는 유사 상표명이 확인되었습니다."],
      warnings: ["등록취소 정보는 상표명 유사 매칭이므로 제품 라벨, 등록번호, 회사명을 함께 재확인해야 합니다."],
      matchedRecords: [],
      cancelledRecords: cancelledMatches,
      requiredAdditionalInfo: DEFAULT_REQUIRED_INFO
    };
  }

  const productMatches = flatRegistrationItems.filter((it) => {
    const brand = it.pestiBrandName || it.brandName || "";
    return !product || containsAny(brand, [product]) || containsAny(product, [brand]);
  });

  const cropMatches = productMatches.filter((it) => containsAny(it.cropName, cropCandidates) || containsAny(it.cropLrclNm, cropCandidates));
  const pestMatches = cropMatches.filter((it) => containsAny(it.diseaseWeedName, pestCandidates));
  const expected = expectedCategory(target);
  const useMatches = pestMatches.filter((it) => categoryCompatible(getUseCategory(it.useName), expected) || containsAny(it.useName, [expected]));

  const warnings = [];
  const requiredAdditionalInfo = [];
  if (!product) requiredAdditionalInfo.push("제품명 또는 상표명이 필요합니다.");
  if (!cropName) requiredAdditionalInfo.push("작물명/수종명이 필요합니다.");
  if (!target) requiredAdditionalInfo.push("방제 대상 병해충명이 필요합니다.");

  const baseAdditionalInfo = uniq([...requiredAdditionalInfo, ...DEFAULT_REQUIRED_INFO]);

  if (!flatRegistrationItems.length) {
    return {
      status: "근거 부족",
      confidence: "낮음",
      reasons: ["농약등록정보 검색 결과가 없습니다. API 키, 제품명, 작물명, 병해충명 또는 PSIS 도메인 인증을 확인해야 합니다."],
      warnings,
      requiredAdditionalInfo: baseAdditionalInfo,
      matchedRecords: [],
      cancelledRecords: cancelledMatches
    };
  }

  if (!productMatches.length) {
    return { status: "근거 부족", confidence: "낮음", reasons: ["검색 결과 중 입력 제품명과 일치하는 상표명이 없습니다."], warnings, requiredAdditionalInfo: baseAdditionalInfo, matchedRecords: [], cancelledRecords: cancelledMatches };
  }
  if (!cropMatches.length) {
    return { status: "부적합", confidence: "중간", reasons: ["제품은 검색되었지만 입력 작물명/수종명과 일치하는 등록 작물이 확인되지 않았습니다."], warnings, requiredAdditionalInfo: baseAdditionalInfo, matchedRecords: productMatches.slice(0, 10).map(summarizeCandidateRecord), cancelledRecords: cancelledMatches };
  }
  if (!pestMatches.length) {
    return { status: "부적합", confidence: "중간", reasons: ["제품과 작물은 일부 일치하지만 입력 병해충명과 일치하는 적용병해충이 확인되지 않았습니다."], warnings, requiredAdditionalInfo: baseAdditionalInfo, matchedRecords: cropMatches.slice(0, 10).map(summarizeCandidateRecord), cancelledRecords: cancelledMatches };
  }
  if (!useMatches.length) {
    return { status: "조건부 적합", confidence: "중간", reasons: ["제품·작물·병해충은 일치하지만 용도 분류가 방제 목적과 완전히 일치하는지 추가 확인이 필요합니다."], warnings, requiredAdditionalInfo: baseAdditionalInfo, matchedRecords: pestMatches.slice(0, 10).map(summarizeCandidateRecord), cancelledRecords: cancelledMatches };
  }

  const seen = new Set();
  const uniqueUseMatches = [];
  for (const item of useMatches) {
    const key = recordKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueUseMatches.push(item);
  }

  const analyzedMatches = addRanks(uniqueUseMatches.slice(0, 10).map((item) => analyzeRecord(item, {
    cropName,
    targetPestOrDisease,
    cropCandidates,
    pestCandidates,
    useMonth,
    dilution,
    applicationMethod
  })));

  const bestMatch = analyzedMatches[0] || summarizeCandidateRecord(useMatches[0]);
  const checks = buildFitChecks(bestMatch, { useMonth, dilution, applicationMethod });
  const checkWarnings = collectWarningsFromChecks(checks);
  warnings.push(...checkWarnings);

  let status = "적합 가능";
  let confidence = "중간~높음";
  if (checks.monthCheck?.status === "불일치" || checks.dilutionCheck?.status === "불일치" || checks.applicationMethodCheck?.status === "불일치") {
    status = "조건부 적합";
    confidence = "중간";
  }

  return {
    status,
    confidence,
    reasons: ["제품명, 작물명/상위분류, 적용 병해충이 농약등록정보에서 일치하는 항목이 확인되었습니다."],
    warnings: uniq(warnings),
    checks,
    requiredAdditionalInfo: baseAdditionalInfo,
    matchedRecords: analyzedMatches,
    cancelledRecords: cancelledMatches
  };
}
