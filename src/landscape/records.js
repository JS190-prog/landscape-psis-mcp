import { getUseCategory } from "./common.js";

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
