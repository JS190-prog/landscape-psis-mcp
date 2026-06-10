import assert from "node:assert/strict";
import http from "node:http";
import { handleJsonRpc } from "./mcp.js";
import { normalizeLandscapeTerms, evaluateFit } from "./landscape.js";
import { requestTextWithFallback } from "./httpClient.js";

const init = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
assert.equal(init.result.serverInfo.name, "landscape-psis-mcp");

const list = await handleJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
assert.ok(list.result.tools.length >= 6);

const norm = normalizeLandscapeTerms({ cropName: "소나무", targetPestOrDisease: "응애" });
assert.ok(norm.cropCandidates.includes("조경수"));
assert.ok(norm.pestOrDiseaseCandidates.includes("응애류"));

const fit = evaluateFit({
  productName: "살비왕",
  cropName: "소나무",
  targetPestOrDisease: "응애",
  registrationItems: [{ pestiBrandName: "살비왕", cropName: "소나무", diseaseWeedName: "응애류", useName: "살비제", pestiUse: "경엽처리", dilutUnit: "2000배" }],
  cancelledItems: []
});
assert.equal(fit.status, "적합 가능");

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
