import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRawPsisParams } from "../src/psisClient.js";

test("raw PSIS requests keep only known PSIS query parameters", () => {
  assert.deepEqual(
    normalizeRawPsisParams({
      serviceCode: "SVC01",
      pestiBrandName: "살비왕",
      cropName: "소나무",
      diseaseWeedName: "응애류",
      redirectUrl: "https://example.invalid",
      nested: { value: true }
    }),
    {
      serviceCode: "SVC01",
      pestiBrandName: "살비왕",
      cropName: "소나무",
      diseaseWeedName: "응애류"
    }
  );
});
