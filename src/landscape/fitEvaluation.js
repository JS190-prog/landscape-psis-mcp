import {
  categoryCompatible,
  containsAny,
  DEFAULT_REQUIRED_INFO,
  expectedCategory,
  getUseCategory,
  recordKey,
  uniq
} from "./common.js";
import { analyzeRecord, addRanks } from "./candidates.js";
import { analyzeUseMonth, compareApplicationMethod, compareDilution } from "./conditionChecks.js";
import { normalizeLandscapeTerms } from "./normalize.js";
import { flattenPsisRecords, summarizeCandidateRecord } from "./records.js";

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
