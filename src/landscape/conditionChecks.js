import { normalizeComparable } from "./common.js";
import { METHOD_KEYWORDS } from "./synonyms.js";

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
