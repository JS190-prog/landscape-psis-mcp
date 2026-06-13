import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { requestTextWithFallback } from "../src/httpClient.js";

test("requestTextWithFallback supports the node-http transport", async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("local-http-ok");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const httpResult = await requestTextWithFallback(new URL(`http://127.0.0.1:${port}/test`), {
      mode: "node",
      timeoutMs: 3000
    });
    assert.equal(httpResult.transport, "node-http");
    assert.equal(httpResult.rawText, "local-http-ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
