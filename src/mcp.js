import { tools, callTool } from "./tools.js";
import { config } from "./config.js";

export const SERVER_INFO = {
  name: "landscape-psis-mcp",
  title: "조경수 농약 적합성 판단",
  version: "1.6.0"
};

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message, data) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

function asTextContent(value) {
  return [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }];
}

export async function handleJsonRpc(message, context = {}) {
  if (Array.isArray(message)) {
    return Promise.all(message.map((item) => handleJsonRpc(item, context)));
  }
  const { id, method, params } = message || {};

  if (!method) return jsonRpcError(id, -32600, "Invalid JSON-RPC request: method is required");

  try {
    switch (method) {
      case "initialize":
        return jsonRpcResult(id, {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
          instructions: "농약안전정보시스템 OpenAPI를 조회하여 조경수 농약 등록 적합성을 확인합니다. 서버 URL에 ?psisApiKey=발급키 또는 ?apiKey=발급키를 붙이면 해당 키로 농약안전정보시스템 OpenAPI를 호출합니다. 서버 환경변수 PSIS_API_BASE_URL/PSIS_API_KEY도 보조 지원합니다. 공용 서버 운영을 위해 rate limit, 캐시, timeout, API 키 마스킹, PSIS HTTP fallback을 포함합니다. ChatGPT에는 기본적으로 읽기 전용 단일 판정 도구만 노출하여 도구 승인 질문을 줄입니다."
        });
      case "notifications/initialized":
        return null;
      case "ping":
        return jsonRpcResult(id, {});
      case "tools/list":
        return jsonRpcResult(id, { tools });
      case "tools/call": {
        const toolName = params?.name;
        const args = { ...(context.toolDefaults || {}), ...(params?.arguments || {}) };
        const result = await callTool(toolName, args);
        return jsonRpcResult(id, { content: asTextContent(result), isError: false });
      }
      default:
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    return jsonRpcResult(id, {
      content: asTextContent({
        error: true,
        code: error.code || "TOOL_ERROR",
        message: error.message,
        details: error.details,
        hint: error.code === "NO_API_KEY" ? "ChatGPT 새 앱 서버 URL에 https://배포주소/mcp?psisApiKey=발급키 형태로 입력하거나 PSIS_API_BASE_URL/PSIS_API_KEY 환경변수를 설정하세요." : undefined
      }),
      isError: true
    });
  }
}

export function metadata(req) {
  const origin = config.publicBaseUrl || `${req.protocol}://${req.get("host")}`;
  return {
    name: SERVER_INFO.name,
    title: SERVER_INFO.title,
    version: SERVER_INFO.version,
    description: "농약안전정보시스템 OpenAPI로 제품명·작물명·병해충명 기준 등록 적합성을 확인하는 MCP 서버입니다.",
    endpoints: {
      streamableHttp: `${origin}/mcp`,
      legacySse: `${origin}/sse`,
      health: `${origin}/health`
    },
    authentication: "none for ChatGPT connector; add ?psisApiKey=YOUR_KEY or ?apiKey=YOUR_KEY to the /mcp URL. Environment variables are optional fallback.",
    publicToolMode: config.mcpPublicTools,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      annotations: t.annotations
    }))
  };
}
