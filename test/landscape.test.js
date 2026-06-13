import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCandidateResult,
  evaluateFit,
  flattenPsisRecords,
  normalizeLandscapeTerms
} from "../src/landscape.js";

test("normalizes common landscape crop and pest terms", () => {
  const norm = normalizeLandscapeTerms({ cropName: "소나무", targetPestOrDisease: "응애" });
  assert.ok(norm.cropCandidates.includes("조경수"));
  assert.ok(norm.pestOrDiseaseCandidates.includes("응애류"));
});

test("flattens nested PSIS record containers", () => {
  const nestedRecords = [{ item: [{ pestiBrandName: "테스트마이트", cropName: "소나무", diseaseWeedName: "응애류" }] }];
  assert.equal(flattenPsisRecords(nestedRecords).length, 1);
});

test("evaluates a directly matching pesticide record as fit", () => {
  const fit = evaluateFit({
    productName: "살비왕",
    cropName: "소나무",
    targetPestOrDisease: "응애",
    registrationItems: [
      {
        pestiBrandName: "살비왕",
        cropName: "소나무",
        diseaseWeedName: "응애류",
        useName: "살비제",
        pestiUse: "경엽처리",
        dilutUnit: "2000배"
      }
    ],
    cancelledItems: []
  });

  assert.equal(fit.status, "적합 가능");
  assert.equal(fit.matchedRecords[0].dilutUnit, "2000배");
});

test("builds candidate results from nested registration records", () => {
  const candidate = buildCandidateResult({
    cropName: "소나무",
    targetPestOrDisease: "응애류",
    registrationItems: [
      {
        item: [
          {
            pestiBrandName: "테스트마이트",
            pestiKorName: "테스트제 액상수화제",
            compName: "테스트사",
            cropName: "소나무",
            diseaseWeedName: "응애류",
            useName: "살충",
            pestiUse: "발생 초부터 경엽처리",
            dilutUnit: "2000배 -",
            useSuittime: "발생초기",
            useNum: "-"
          }
        ]
      }
    ],
    cancelledItems: []
  });

  assert.equal(candidate.status, "등록후보 있음");
  assert.equal(candidate.candidateRecords[0].pestiBrandName, "테스트마이트");
});

test("does not mark empty product checks as cancelled-product unfit", () => {
  const noProductFit = evaluateFit({
    productName: "",
    cropName: "소나무",
    targetPestOrDisease: "응애류",
    registrationItems: [],
    cancelledItems: [{ pestiBrandName: "아무제품" }]
  });

  assert.notEqual(noProductFit.status, "부적합");
});
