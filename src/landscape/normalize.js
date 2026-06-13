import { uniq } from "./common.js";
import { CROP_SYNONYMS, PEST_SYNONYMS } from "./synonyms.js";

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
