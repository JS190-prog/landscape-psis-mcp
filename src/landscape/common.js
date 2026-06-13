export const DEFAULT_REQUIRED_INFO = Object.freeze(["제품 라벨", "SDS/MSDS", "현장 병해충 진단", "약해·비산·민원 위험 확인"]);

export function uniq(values) {
  return [...new Set(values.filter(Boolean).map((v) => String(v).trim()).filter(Boolean))];
}

export function normalizeComparable(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()\[\]{}·ㆍ,._-]/g, "")
    .trim();
}

function cleanNeedles(needles = []) {
  return needles.map((n) => String(n ?? "").trim()).filter(Boolean);
}

export function containsAny(haystack, needles) {
  const text = String(haystack || "").toLowerCase();
  const validNeedles = cleanNeedles(needles);
  if (!text || !validNeedles.length) return false;
  return validNeedles.some((n) => text.includes(n.toLowerCase()));
}

export function getUseCategory(useName) {
  const u = String(useName || "");
  if (u.includes("살균")) return "살균제";
  if (u.includes("살비")) return "살비제";
  if (u.includes("살충")) return "살충제";
  if (u.includes("제초")) return "제초제";
  return u || "미상";
}

export function expectedCategory(target) {
  const t = String(target || "");
  if (containsAny(t, ["응애"])) return "살비제";
  if (containsAny(t, ["병", "마름", "반점", "곰팡이"])) return "살균제";
  if (containsAny(t, ["벌레", "진딧물", "깍지", "하늘소", "혹파리", "해충"])) return "살충제";
  return "미상";
}

export function categoryCompatible(actual, expected) {
  if (expected === "미상") return true;
  if (actual === expected) return true;
  // PSIS often classifies acaricide registrations under the broader 살충 useName.
  if (expected === "살비제" && actual === "살충제") return true;
  return false;
}

export function recordKey(item) {
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
