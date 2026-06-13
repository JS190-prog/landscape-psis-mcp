import {
  categoryCompatible,
  containsAny,
  DEFAULT_REQUIRED_INFO,
  expectedCategory,
  getUseCategory,
  normalizeComparable,
  recordKey
} from "./common.js";
import { analyzeUseMonth, compareApplicationMethod, compareDilution } from "./conditionChecks.js";
import { normalizeLandscapeTerms } from "./normalize.js";
import { flattenPsisRecords, summarizeCandidateRecord } from "./records.js";

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

export function analyzeRecord(item, input = {}) {
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

export function addRanks(records) {
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
