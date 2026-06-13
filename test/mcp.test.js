import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { handleJsonRpc } from "../src/mcp.js";

test("initialize returns server info", async () => {
  const init = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.equal(init.result.serverInfo.name, "landscape-psis-mcp");
});

test("default public profile exposes only the fit tool without API key arguments", async () => {
  const list = await handleJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.equal(list.result.tools.length, 1);
  assert.equal(list.result.tools[0].name, "check_landscape_pesticide_fit");
  assert.equal(list.result.tools[0].annotations.readOnlyHint, true);
  assert.equal(list.result.tools[0].annotations.destructiveHint, false);
  assert.equal(list.result.tools[0].inputSchema.properties.psisApiKey, undefined);
  assert.deepEqual(list.result.tools[0].inputSchema.required, ["cropName", "targetPestOrDisease"]);
});

test("all profile exposes the admin and debug tool set", () => {
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
});
