const CROP_SYNONYMS = {
  "소나무": ["소나무", "조경수", "수목류", "산림수목", "침엽수", "Pinus", "pine"],
  "곰솔": ["곰솔", "해송", "소나무", "조경수", "수목류", "산림수목", "침엽수"],
  "반송": ["반송", "소나무", "조경수", "수목류", "산림수목", "침엽수"],
  "잣나무": ["잣나무", "소나무", "조경수", "수목류", "산림수목", "침엽수"],
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

function uniq(values) {
  return [...new Set(values.filter(Boolean).map((v) => String(v).trim()).filter(Boolean))];
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

function containsAny(haystack, needles) {
  const text = String(haystack || "").toLowerCase();
  return needles.some((n) => text.includes(String(n || "").toLowerCase()));
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

export function evaluateFit({ productName, cropName, targetPestOrDisease, purpose, useMonth, dilution, applicationMethod, registrationItems = [], cancelledItems = [] }) {
  const normalized = normalizeLandscapeTerms({ cropName, targetPestOrDisease });
  const cropCandidates = normalized.cropCandidates;
  const pestCandidates = normalized.pestOrDiseaseCandidates;
  const product = String(productName || "").trim();
  const target = String(targetPestOrDisease || purpose || "").trim();

  const cancelledMatches = cancelledItems.filter((it) => containsAny(it.pestiBrandName || it.brandName || "", [product]) || containsAny(product, [it.pestiBrandName || it.brandName]));
  if (cancelledMatches.length) {
    return {
      status: "부적합",
      confidence: "높음",
      reasons: ["등록취소 농약정보에서 동일 또는 유사 상표명이 확인되었습니다."],
      matchedRecords: [],
      cancelledRecords: cancelledMatches,
      requiredAdditionalInfo: []
    };
  }

  const productMatches = registrationItems.filter((it) => {
    const brand = it.pestiBrandName || it.brandName || "";
    return !product || containsAny(brand, [product]) || containsAny(product, [brand]);
  });

  const cropMatches = productMatches.filter((it) => containsAny(it.cropName, cropCandidates) || containsAny(it.cropLrclNm, cropCandidates));
  const pestMatches = cropMatches.filter((it) => containsAny(it.diseaseWeedName, pestCandidates));
  const expected = expectedCategory(target);
  const useMatches = pestMatches.filter((it) => expected === "미상" || getUseCategory(it.useName) === expected || containsAny(it.useName, [expected]));

  const reasons = [];
  const warnings = [];
  const requiredAdditionalInfo = [];

  if (!product) requiredAdditionalInfo.push("제품명 또는 상표명이 필요합니다.");
  if (!cropName) requiredAdditionalInfo.push("작물명/수종명이 필요합니다.");
  if (!target) requiredAdditionalInfo.push("방제 대상 병해충명이 필요합니다.");

  if (!registrationItems.length) {
    return {
      status: "근거 부족",
      confidence: "낮음",
      reasons: ["농약등록정보 검색 결과가 없습니다. API 키, 제품명, 작물명, 병해충명 또는 PSIS 도메인 인증을 확인해야 합니다."],
      warnings,
      requiredAdditionalInfo,
      matchedRecords: [],
      cancelledRecords: cancelledMatches
    };
  }

  if (!productMatches.length) {
    return { status: "근거 부족", confidence: "낮음", reasons: ["검색 결과 중 입력 제품명과 일치하는 상표명이 없습니다."], warnings, requiredAdditionalInfo, matchedRecords: [], cancelledRecords: cancelledMatches };
  }
  if (!cropMatches.length) {
    return { status: "부적합 가능성 높음", confidence: "중간", reasons: ["제품은 검색되었지만 입력 작물명/수종명과 일치하는 등록 작물이 확인되지 않았습니다."], warnings, requiredAdditionalInfo, matchedRecords: productMatches.slice(0, 10), cancelledRecords: cancelledMatches };
  }
  if (!pestMatches.length) {
    return { status: "부적합 가능성 높음", confidence: "중간", reasons: ["제품과 작물은 일부 일치하지만 입력 병해충명과 일치하는 적용병해충이 확인되지 않았습니다."], warnings, requiredAdditionalInfo, matchedRecords: cropMatches.slice(0, 10), cancelledRecords: cancelledMatches };
  }
  if (!useMatches.length) {
    return { status: "조건부 적합", confidence: "중간", reasons: ["제품·작물·병해충은 일치하지만 용도 분류가 방제 목적과 완전히 일치하는지 추가 확인이 필요합니다."], warnings, requiredAdditionalInfo, matchedRecords: pestMatches.slice(0, 10), cancelledRecords: cancelledMatches };
  }

  if (dilution) warnings.push("실제 희석배수는 반환된 등록 희석배수와 수동 대조해야 합니다.");
  if (applicationMethod) warnings.push("실제 살포방법은 반환된 사용방법과 수동 대조해야 합니다.");
  if (useMonth) warnings.push("월별 사용 가능성은 병해충 발생시기와 현장 상태까지 함께 확인해야 합니다.");

  return {
    status: "적합 가능",
    confidence: "중간~높음",
    reasons: ["제품명, 작물명/상위분류, 적용 병해충이 농약등록정보에서 일치하는 항목이 확인되었습니다."],
    warnings,
    requiredAdditionalInfo,
    matchedRecords: useMatches.slice(0, 10),
    cancelledRecords: cancelledMatches
  };
}
