import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import http from "node:http";
import { handleJsonRpc } from "./mcp.js";
import { normalizeLandscapeTerms, evaluateFit, buildCandidateResult, flattenPsisRecords } from "./landscape.js";
import { requestTextWithFallback } from "./httpClient.js";

const init = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
assert.equal(init.result.serverInfo.name, "landscape-psis-mcp");

const list = await handleJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
assert.equal(list.result.tools.length, 1);
assert.equal(list.result.tools[0].name, "check_landscape_pesticide_fit");
assert.equal(list.result.tools[0].annotations.readOnlyHint, true);
assert.equal(list.result.tools[0].annotations.destructiveHint, false);
assert.equal(list.result.tools[0].inputSchema.properties.psisApiKey, undefined);
assert.deepEqual(list.result.tools[0].inputSchema.required, ["cropName", "targetPestOrDisease"]);

const allToolsCheck = spawnSync(
  process.execPath,
  [
    "--input-type=module",
    "-e",
    "import { handleJsonRpc } from './src/mcp.js'; const r = await handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }); console.log(JSON.stringify(r.result.tools.map((t) => t.name)));"
  ],
  {
    cwd: process.cwd(),
    env: { ...process.env, MCP_PUBLIC_TOOLS: "all" },
    encoding: "utf8"
  }
);
assert.equal(allToolsCheck.status, 0, allToolsCheck.stderr);
const allToolNames = JSON.parse(allToolsCheck.stdout);
assert.deepEqual(allToolNames, [
  "psis_test_connection",
  "psis_debug_connection",
  "psis_search_pesticides",
  "psis_get_pesticide_detail",
  "psis_search_cancelled_pesticides",
  "normalize_landscape_terms",
  "check_landscape_pesticide_fit",
  "psis_raw_request"
]);

const norm = normalizeLandscapeTerms({ cropName: "소나무", targetPestOrDisease: "응애" });
assert.ok(norm.cropCandidates.includes("조경수"));
assert.ok(norm.pestOrDiseaseCandidates.includes("응애류"));

const nestedRecords = [{ item: [{ pestiBrandName: "테스트마이트", cropName: "소나무", diseaseWeedName: "응애류" }] }];
assert.equal(flattenPsisRecords(nestedRecords).length, 1);

const fit = evaluateFit({
  productName: "살비왕",
  cropName: "소나무",
  targetPestOrDisease: "응애",
  registrationItems: [{ pestiBrandName: "살비왕", cropName: "소나무", diseaseWeedName: "응애류", useName: "살비제", pestiUse: "경엽처리", dilutUnit: "2000배" }],
  cancelledItems: []
});
assert.equal(fit.status, "적합 가능");
assert.equal(fit.matchedRecords[0].dilutUnit, "2000배");

const candidate = buildCandidateResult({
  cropName: "소나무",
  targetPestOrDisease: "응애류",
  registrationItems: [{ item: [
    { pestiBrandName: "테스트마이트", pestiKorName: "테스트제 액상수화제", compName: "테스트사", cropName: "소나무", diseaseWeedName: "응애류", useName: "살충", pestiUse: "발생 초부터 경엽처리", dilutUnit: "2000배 -", useSuittime: "발생초기", useNum: "-" }
  ] }],
  cancelledItems: []
});
assert.equal(candidate.status, "등록후보 있음");
assert.equal(candidate.candidateRecords[0].pestiBrandName, "테스트마이트");

const noProductFit = evaluateFit({
  productName: "",
  cropName: "소나무",
  targetPestOrDisease: "응애류",
  registrationItems: [],
  cancelledItems: [{ pestiBrandName: "아무제품" }]
});
assert.notEqual(noProductFit.status, "부적합");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("local-http-ok");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const { port } = server.address();
  const httpResult = await requestTextWithFallback(new URL(`http://127.0.0.1:${port}/test`), { mode: "node", timeoutMs: 3000 });
  assert.equal(httpResult.transport, "node-http");
  assert.equal(httpResult.rawText, "local-http-ok");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("self-test passed");
