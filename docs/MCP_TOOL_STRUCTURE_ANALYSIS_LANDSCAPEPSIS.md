# landscapepsis 도구 구조 분석 및 개선안

작성일: 2026-06-13  
기준 문서: `C:/Users/USER/Downloads/down/MCP_TOOL_STRUCTURE_GUIDE.md`  
분석 대상: `C:/scratch/landscapepsis`  
문서 목적: `landscapepsis`의 현재 MCP 도구 구조를 기준 문서에 따라 점검하고, 도구 수·이름·모듈 구조·안전장치·테스트 구조를 개선하기 위한 실행 가능한 정리안을 제시한다.

---

## 1. 핵심 결론

`landscapepsis`는 농촌진흥청 농약안전정보시스템(PSIS) OpenAPI를 조회하여 조경수 농약 사용 적합성을 판정하는 Node.js 기반 MCP/API 서버다.

현재 구조는 다음 특징을 가진다.

```text
- Express 기반 HTTP 서버
- Streamable HTTP MCP endpoint: /mcp
- Legacy SSE endpoint: /sse + /messages
- REST test endpoint: /api/search, /api/fit, /api/cancelled, /debug/psis
- PSIS API key query/header/env 전달 지원
- API key masking / safe access log
- rate limit
- response cache
- PSIS fetch-first + Node http fallback
- fit-only 공개 도구 모드
- admin/debug all-tools 모드
- 조경수 현장 용어 정규화
- 등록농약 후보 검색
- 등록취소 농약 확인
- 사용월·희석배수·살포방법 비교
- 추천점수 기반 candidate ranking
```

기준 문서 관점에서 보면 매우 좋은 부분이 있다.

```text
1. 일반 사용자에게는 `check_landscape_pesticide_fit` 단일 읽기 전용 도구만 노출한다.
2. 관리자/디버그 도구는 `MCP_PUBLIC_TOOLS=all`일 때만 전체 노출하는 구조다.
3. 도구 이름이 PSIS 업무 단위로 명확하다.
4. API 키 마스킹, query stripping, rate limit, cache, timeout이 구현되어 있다.
5. README가 초보자와 실무자를 모두 고려해 잘 작성되어 있다.
6. npm package metadata, CI, self-test가 존재한다.
7. 실무 결과 해석과 면책 조항이 명확하다.
```

남은 개선점도 명확하다.

```text
1. src/tools.js에 tool schema와 callTool 라우팅, fit workflow가 함께 있어 점점 커지고 있다.
2. src/landscape.js가 28KB 이상으로 정규화, 판정, 후보랭킹, 비교 로직이 모두 들어 있다.
3. public/admin.html, src/local.js, src/metrics.js, OPERATOR.md 같은 비공개 운영 확장이 로컬에는 존재하지만 Git 추적 제외가 .git/info/exclude 의존이라는 운영 리스크가 있다.
4. `src/local.js`는 분석 중 안전 검사에 차단되어 내용 확인이 불완전했다.
5. `.env.example`은 localcodemcp path policy에서 `**/.env.*`로 차단되어 직접 확인하지 못했다.
6. `psis_raw_request`와 `psis_debug_connection` 같은 debug/admin 도구는 공용 profile에서 반드시 계속 숨겨야 한다.
7. 테스트가 `src/self-test.js` 단일 self-test 중심이라 기능별 회귀 테스트 파일 분리가 필요하다.
```

개선 방향은 다음이다.

```text
현재 fit-only 공개 도구 전략은 유지한다.
admin/debug 도구는 계속 기본 비노출로 둔다.
tools.js를 tool registry, schemas, handlers로 분리한다.
landscape.js를 normalize, fit evaluation, condition checks, candidate ranking으로 분리한다.
운영자 전용 파일은 .git/info/exclude뿐 아니라 .gitignore 또는 별도 private package 전략으로 보호한다.
self-test를 기능별 node:test 테스트로 분리하고 CI에서 계속 실행한다.
```

---

## 2. 현재 프로젝트 현황

### 2.1 프로젝트 유형

로컬 스캔 결과 기준:

```text
프로젝트 유형: node
스캔 파일 수: 32개
스캔 크기: 약 185KB
주요 확장자: .js, .md, .json, .yml, .toml, .html, .log
```

### 2.2 주요 파일 구조

```text
C:/scratch/landscapepsis/
  README.md
  CHANGELOG.md
  OPERATOR.md
  LICENSE
  Dockerfile
  docker-compose.yml
  fly.toml
  render.yaml
  package.json
  package-lock.json
  .github/workflows/ci.yml
  docs/
    CHATGPT_NEW_APP_INPUT.md
    NGINX_VPS.md
  public/
    admin.html
  src/
    config.js
    httpClient.js
    landscape.js
    local.js
    mcp.js
    metrics.js
    psisClient.js
    rateLimit.js
    security.js
    self-test.js
    server.js
    tools.js
```

### 2.3 package 정보

`package.json` 기준:

```text
name: landscape-psis-mcp
version: 1.9.0
type: module
main: src/server.js
bin: landscape-psis-mcp -> src/server.js
node: >=20
scripts:
  start: node src/server.js
  dev: node --watch src/server.js
  test: node src/self-test.js
```

의존성:

```text
express
fast-xml-parser
```

### 2.4 CI

GitHub Actions는 Node 20, 22에서 다음을 실행한다.

```text
npm ci
npm test
```

현재 `npm test`는 `node src/self-test.js`를 실행한다.

### 2.5 현재 Git 상태

분석 시작 시점 Git 작업 트리는 깨끗했다.

```text
tracked_modified: 없음
untracked: 없음
```

이번 작업에서는 기존 파일을 수정하지 않고 새 분석 문서만 추가한다.

---

## 3. 현재 MCP/API 구조

### 3.1 HTTP server 구조

`src/server.js`는 Express 기반이며 다음 endpoint를 제공한다.

```text
GET  /
GET  /health
GET  /.well-known/mcp-server.json
POST /mcp
POST /sse
GET  /sse
POST /messages
GET  /debug/psis
POST /api/search
POST /api/fit
POST /api/cancelled
GET  /api/search
GET  /api/fit
GET  /api/cancelled
```

MCP 핵심 endpoint:

```text
POST /mcp
```

Legacy SSE endpoint:

```text
GET /sse
POST /messages?sessionId=...
```

### 3.2 MCP protocol 처리

`src/mcp.js`가 JSON-RPC MCP 처리를 담당한다.

지원 method:

```text
initialize
notifications/initialized
ping
tools/list
tools/call
```

`tools/list`는 `tools.js`의 `tools` 배열을 반환한다.

`tools/call`은 다음 방식으로 tool default와 caller arguments를 합친다.

```text
args = { ...context.toolDefaults, ...params.arguments }
```

이 구조 덕분에 `/mcp?psisApiKey=...` 또는 header에서 받은 API key가 tool call에 자동 전달된다.

### 3.3 API key 전달 우선순위

`server.js` 기준 우선순위:

```text
URL query: psisApiKey / apiKey / key
HTTP header: apikey / x-psis-api-key
환경변수: PSIS_API_KEY 또는 PSIS_API_BASE_URL
```

이 구조는 README와 일치한다.

---

## 4. 현재 노출 MCP 도구 목록 요약

### 4.1 기본 공개 모드

기본값:

```text
MCP_PUBLIC_TOOLS=fit-only
```

이 경우 ChatGPT에 노출되는 도구는 1개다.

```text
check_landscape_pesticide_fit
```

이 도구는 read-only annotation을 가진다.

```text
readOnlyHint: true
destructiveHint: false
idempotentHint: true
openWorldHint: true
```

이 설계는 기준 문서의 “ChatGPT에 직접 노출되는 도구는 업무 단위로 줄임” 원칙에 매우 잘 맞다.

### 4.2 관리자/디버그 전체 모드

`MCP_PUBLIC_TOOLS=all`이면 내부 도구 전체가 노출된다.

```text
psis_test_connection
psis_debug_connection
psis_search_pesticides
psis_get_pesticide_detail
psis_search_cancelled_pesticides
normalize_landscape_terms
check_landscape_pesticide_fit
psis_raw_request
```

전체 도구도 대부분 read-only 성격이지만, `psis_raw_request`와 `psis_debug_connection`은 운영/디버그 목적이므로 공용 사용자에게 노출하지 않는 현재 정책이 적절하다.

---

## 5. 기준 문서 대비 적합성 평가

| 기준 | 현재 상태 | 평가 | 개선 필요 사항 |
|---|---|---:|---|
| MCP 서버를 프로그램별로 분리 | PSIS/조경수 농약 전용 서버 | 양호 | 유지 |
| 내부 코드를 주제별 모듈로 분리 | server/mcp/tools/psisClient/landscape 등 분리 | 양호 | tools.js, landscape.js 추가 분리 |
| 외부 도구 업무 단위 압축 | 기본 공개 도구 1개 | 매우 양호 | 유지 |
| 도구 이름 규칙 | psis_ / check_landscape_ 계열 | 양호 | admin/debug profile 명시 강화 |
| read-only annotation | 적용됨 | 양호 | all-tools에서도 tool별 위험도 차등 가능 |
| API key 보호 | masking, strip query, safe log 존재 | 양호 | 프록시/Nginx log 설정 지속 점검 |
| rate limit | IP/key 기준 존재 | 양호 | admin endpoint brute force 기록 강화 가능 |
| cache/timeout | 존재 | 양호 | cache invalidation/admin stats 분리 가능 |
| path/write 위험 | 로컬 파일 write 도구 없음 | 양호 | public/admin 운영 파일 보호 필요 |
| 테스트 | self-test + CI 존재 | 보통 | node:test 기능별 분리 권장 |
| README | 실무 중심으로 매우 상세 | 양호 | 도구 profile 표는 이미 좋으나 운영자 파일 보호 주의 보강 가능 |

---

## 6. 주요 문제점

### 6.1 tools.js가 tool schema와 workflow를 함께 담당함

현재 `src/tools.js`는 다음 역할을 모두 수행한다.

```text
- MCP tool schema 정의
- readOnly annotations 정의
- public fit-only tool 정의
- all-tools 목록 정의
- callTool 라우팅
- check_landscape_pesticide_fit workflow
- candidate search loop
- cancelled pesticide search
- fit/candidate result 반환 조립
```

문제:

```text
- 도구가 추가될수록 schema와 handler가 같은 파일에 쌓인다.
- fit workflow가 커져 개별 테스트가 어려워진다.
- all-tools/admin-tools 분리 정책이 커질수록 관리가 어려워진다.
```

권장:

```text
src/tools/registry.js
src/tools/schemas.js
src/tools/handlers/psis.js
src/tools/handlers/fit.js
src/tools/profiles.js
```

또는 소규모 구조를 유지하려면 다음 정도로만 나눠도 충분하다.

```text
src/toolSchemas.js
src/toolHandlers.js
src/tools.js
```

### 6.2 landscape.js가 판정 로직 전체를 담당함

현재 `src/landscape.js`는 28KB 이상이며 다음 기능을 포함한다.

```text
- crop synonyms
- pest synonyms
- term normalization
- PSIS record flattening
- use category classification
- dilution comparison
- application method comparison
- use month analysis
- candidate record summary
- match classification
- recommendation scoring
- candidate result generation
- fit evaluation
```

문제:

```text
- 판정 로직은 도메인 규칙이 계속 늘어날 가능성이 높다.
- 동의어 사전, 비교 로직, 점수화, 결과 메시지가 한 파일에 섞여 있다.
- 특정 규칙 수정 시 회귀 테스트 범위를 좁히기 어렵다.
```

권장 분리:

```text
src/domain/synonyms.js
src/domain/normalize.js
src/domain/conditions.js
src/domain/candidateRanking.js
src/domain/fitEvaluation.js
src/domain/records.js
```

최소 분리안:

```text
src/landscape/synonyms.js
src/landscape/checks.js
src/landscape/evaluate.js
src/landscape/candidates.js
```

### 6.3 비공개 운영 파일 보호 방식이 .git/info/exclude에 의존함

`OPERATOR.md`에 따르면 다음 파일은 비공개 운영 파일이다.

```text
src/local.js
src/metrics.js
public/
OPERATOR.md
```

현재 `.gitignore`에는 다음이 있다.

```text
node_modules
.env
.DS_Store
npm-debug.log*
office/
mcp-shell.log
local_artifacts/
localcodemcp_*.json
```

즉, 비공개 운영 파일은 `.gitignore`가 아니라 `.git/info/exclude`에 의존한다.

문제:

```text
- .git/info/exclude는 clone 시 전달되지 않는다.
- 새 작업 환경에서 실수로 src/local.js, src/metrics.js, public/admin.html, OPERATOR.md를 커밋할 위험이 있다.
- OPERATOR.md 자체가 로컬에는 존재하며, 분석/배포 작업 중 패키지에 포함될 가능성이 있다.
```

권장:

```text
1. 정말 공개하면 안 되는 파일은 .gitignore에도 추가한다.
2. 공개 repo용 파일과 private ops 파일을 별도 폴더/별도 repo로 분리한다.
3. npm files 배열은 현재 src/local.js, src/metrics.js, public을 포함하지 않으므로 npm 공개 측면은 비교적 안전하다.
4. Docker/Fly 배포는 COPY . . 이므로 private files 포함 의도가 맞는지 계속 검토한다.
5. CI에서 forbidden private files check를 추가한다.
```

예시 CI check:

```bash
git ls-files | grep -E '^(src/local\.js|src/metrics\.js|public/|OPERATOR\.md)$' && exit 1 || true
```

### 6.4 local extension 내용 검토 불완전

`server.js`는 다음처럼 optional local extension을 로드한다.

```text
await import("./local.js")
```

분석 중 `src/local.js` 직접 읽기는 안전 검사에 차단되어 세부 내용은 확인하지 못했다. 다만 `OPERATOR.md`에 따르면 역할은 다음이다.

```text
- /admin route
- /admin/stats route
- 인증
- upstream observer 연결
```

확실한 조치:

```text
1. local extension은 공개 서버 핵심 동작과 분리되어 있으므로 MCP 공개 도구 구조 분석에는 큰 영향이 없다.
2. 운영자 대시보드 보안은 별도 보안 리뷰가 필요하다.
3. ADMIN_TOKEN 미설정 시 /admin 비활성화 정책을 유지해야 한다.
```

### 6.5 .env.example은 path policy로 직접 확인하지 못함

`.env.example`은 localcodemcp path policy에서 `**/.env.*`에 매칭되어 읽기가 차단되었다.

이 때문에 `.env.example`의 실제 내용은 본 분석에서 검토하지 못했다.

권장:

```text
1. .env.example에는 실제 secret이 없어야 한다.
2. localcodemcp가 .env.example까지 차단하는 현재 정책은 안전 측면에서는 보수적이다.
3. 공개 배포용 설정 예시는 README 또는 config.example.json 형태로도 제공하는 것이 좋다.
```

### 6.6 admin/debug tools는 기본 비노출을 유지해야 함

전체 도구 모드에는 다음 도구들이 포함된다.

```text
psis_debug_connection
psis_raw_request
psis_get_pesticide_detail
psis_search_cancelled_pesticides
```

이들은 직접적인 write/destructive 도구는 아니지만, 다음 이유로 공용 사용자에게 노출하지 않는 것이 좋다.

```text
- PSIS upstream 호출량 증가
- raw request로 예상하지 못한 endpoint/params 사용 가능
- debug response에 운영 정보가 포함될 수 있음
- ChatGPT가 불필요한 세부 도구를 반복 호출할 수 있음
```

현재 `fit-only` 기본값은 올바르다.

### 6.7 self-test 중심 테스트 구조

현재 `npm test`는 `node src/self-test.js`다.

self-test에서 확인하는 항목은 좋다.

```text
- initialize serverInfo
- tools/list fit-only 노출
- readOnly annotations
- public tool schema에서 psisApiKey 숨김
- normalizeLandscapeTerms
- flattenPsisRecords
- evaluateFit
- buildCandidateResult
- noProductFit behavior
- requestTextWithFallback node-http path
```

보완 필요:

```text
- 기능별 테스트 파일 분리
- node:test 또는 vitest 도입 검토
- rateLimit/security/cache/PSIS error handling 테스트 추가
- candidate scoring 회귀 테스트 추가
- mcpPublicTools=all profile 테스트 추가
```

---

## 7. 권장 최종 내부 구조

현재 Node 프로젝트 구조를 유지하면서 기준 문서에 맞게 정리하면 다음이 적합하다.

```text
landscapepsis/
  README.md
  CHANGELOG.md
  package.json
  src/
    server.js
    mcp.js
    config.js
    security.js
    rateLimit.js
    httpClient.js
    psisClient.js
    tools/
      registry.js
      schemas.js
      profiles.js
      handlers/
        psis.js
        fit.js
        debug.js
    landscape/
      synonyms.js
      normalize.js
      records.js
      conditionChecks.js
      candidateRanking.js
      fitEvaluation.js
    ops/
      local.js          # private package 또는 별도 repo 검토
      metrics.js        # private package 또는 별도 repo 검토
    self-test.js
  test/
    mcp.test.js
    tools.test.js
    security.test.js
    rateLimit.test.js
    psisClient.test.js
    landscape-normalize.test.js
    landscape-fit.test.js
    landscape-candidates.test.js
```

소규모 유지안:

```text
src/tools.js 유지
src/toolProfiles.js 추가
src/toolSchemas.js 추가
src/fitWorkflow.js 추가
src/landscape.js를 3~4개 파일로만 분리
```

---

## 8. 권장 외부 노출 도구 목록

### 8.1 public fit-only profile

현재와 동일하게 1개만 노출하는 것이 좋다.

```text
check_landscape_pesticide_fit
```

이 profile은 ChatGPT 새 앱, Claude 웹, Cursor 일반 사용자가 쓰는 기본값으로 유지한다.

### 8.2 admin/debug profile

`MCP_PUBLIC_TOOLS=all` 또는 별도 admin connector에서만 노출한다.

```text
psis_test_connection
psis_debug_connection
psis_search_pesticides
psis_get_pesticide_detail
psis_search_cancelled_pesticides
normalize_landscape_terms
check_landscape_pesticide_fit
psis_raw_request
```

### 8.3 향후 권장 alias 또는 profile 명칭

현재 도구명은 대체로 적절하므로 필수 rename은 필요 없다. 다만 profile 이름을 명시하면 좋다.

```text
landscape_fit_public
landscape_psis_admin
landscape_psis_debug
```

MCP tool 이름은 현재 그대로 유지하는 것이 호환성 측면에서 좋다.

---

## 9. 현재 도구별 유지·통합·숨김 판단표

판단 기준:

```text
유지: 사용자 업무 단위로 의미가 있고 자주 쓰임
통합: 상위 workflow 도구 안에 포함하는 것이 적절함
숨김: 내부 함수로 충분함
제한: 공용 profile에서는 숨기고 admin/debug profile에서만 사용
```

| 현재 도구명 | 주제 | 위험도 | 판단 | 권장 profile | 이유 |
|---|---|---:|---|---|---|
| check_landscape_pesticide_fit | fit workflow | 낮음 | 유지 | public fit-only | 핵심 업무 단위 단일 도구 |
| psis_test_connection | diagnostics | 낮음/중간 | 제한 | admin/debug | API key/PSIS 연결 진단용 |
| psis_debug_connection | diagnostics | 중간 | 제한 | admin/debug | HTTP/DNS/upstream 상세 진단 포함 가능 |
| psis_search_pesticides | search | 낮음/중간 | 제한 | admin/debug | 세부 검색 도구, public에서는 fit tool로 통합 |
| psis_get_pesticide_detail | detail | 낮음/중간 | 제한 | admin/debug | 상세키 필요, 일반 사용자에게 복잡 |
| psis_search_cancelled_pesticides | cancelled | 낮음/중간 | 제한 | admin/debug | fit tool 내부에서 호출되는 것이 적합 |
| normalize_landscape_terms | normalize | 낮음 | 제한/유지 | admin/debug | 디버그에는 유용하나 public에는 불필요 |
| psis_raw_request | raw request | 중간 | 제한 | admin/debug only | 임의 params upstream 호출, 공용 비노출 유지 |

---

## 10. 안전장치 평가와 개선안

### 10.1 이미 잘 구현된 안전장치

```text
1. MCP_PUBLIC_TOOLS=fit-only 기본값
2. readOnlyHint/destructiveHint/idempotentHint annotations
3. API key query/header/env 전달
4. API key masking: maskSecret, sanitizeUrlForLog
5. safe access log: query string 제거
6. rate limit: IP별/API key별
7. request timeout
8. response cache
9. serviceType AA002를 AA001로 coercion
10. HTML response 감지
11. PSIS error code mapping
12. fit result에 requiredAdditionalInfo와 warnings 포함
13. 면책/라벨 확인 강조
```

### 10.2 보강하면 좋은 안전장치

```text
1. `/health` 응답에 queryKeyMode.hasQueryApiKey는 좋지만, 운영 환경에서 너무 많은 config 정보를 노출하지 않는지 검토
2. admin/debug all-tools는 별도 admin token이 있는 endpoint나 별도 deployment에서만 노출 검토
3. `psis_raw_request`는 endpoint와 params allowlist를 더 좁게 유지
4. upstream cache key에서 apiKey 제거는 공유 캐시 문제를 만들 수 있으므로, PSIS 응답이 사용자 key별로 다를 가능성이 있으면 key hash 포함 검토
5. public README 예시 URL에는 실제 key가 절대 들어가지 않도록 지속 점검
6. private ops 파일 commit 방지 CI 추가
7. `/debug/psis` REST endpoint가 공용 서버에서 과도한 upstream 진단에 쓰이지 않도록 rate limit 또는 admin guard 검토
```

### 10.3 cache key 관련 주의

현재 `cacheKey()`는 `apiKey`를 삭제한 params로 cache key를 만든다.

장점:

```text
- 키별 중복 요청을 줄일 수 있다.
- API key가 메모리 cache key에 남지 않는다.
```

주의:

```text
- PSIS 응답이 API key별 권한/도메인/계정 상태에 따라 달라질 수 있다면 공유 cache가 혼동을 만들 수 있다.
```

권장:

```text
- 기본은 현재 방식 유지 가능
- 문제가 생기면 apiKey 원문이 아니라 hash prefix를 cache key에 포함
```

---

## 11. 작업별 profile 제안

### 11.1 일반 사용자 profile

```json
{
  "profile": "landscape-psis-fit-only",
  "servers": ["landscape-psis-mcp"],
  "preferred_tools": [
    "check_landscape_pesticide_fit"
  ]
}
```

### 11.2 운영자 진단 profile

```json
{
  "profile": "landscape-psis-admin-diagnostics",
  "servers": ["landscape-psis-mcp"],
  "preferred_tools": [
    "psis_test_connection",
    "psis_debug_connection",
    "psis_search_pesticides",
    "psis_get_pesticide_detail",
    "psis_search_cancelled_pesticides",
    "normalize_landscape_terms",
    "check_landscape_pesticide_fit"
  ]
}
```

### 11.3 개발자 raw debug profile

```json
{
  "profile": "landscape-psis-raw-debug",
  "servers": ["landscape-psis-mcp"],
  "preferred_tools": [
    "psis_raw_request",
    "psis_debug_connection"
  ],
  "requires_explicit_admin_context": true
}
```

일반 ChatGPT 새 앱 연결에는 11.1만 사용하는 것이 좋다.

---

## 12. README 개선 방향

현재 README는 실무자용 설명, 연결 방법, API 키, 도구, 보안 주의, 운영 설정을 잘 설명하고 있다.

추가하면 좋은 항목:

```markdown
## 도구 profile 요약

### 일반 사용자
- check_landscape_pesticide_fit만 노출됩니다.

### 운영자/디버그
- MCP_PUBLIC_TOOLS=all일 때만 PSIS 세부 검색/진단 도구가 노출됩니다.
- 일반 사용자 커넥터에는 all 모드를 사용하지 마세요.

## private 운영 파일 주의
- src/local.js, src/metrics.js, public/admin.html, OPERATOR.md는 공개 repo에 올리지 않습니다.
- 새 clone 환경에서는 .git/info/exclude가 자동 복사되지 않습니다.
```

테스트 안내도 현재보다 조금 구체화할 수 있다.

```markdown
npm test는 src/self-test.js를 실행하며, 실제 PSIS API를 호출하지 않는 로컬 회귀 테스트입니다.
```

---

## 13. 테스트 개선 방향

현재 self-test가 좋은 출발점이다. 다만 장기적으로는 다음처럼 분리하는 것이 좋다.

```text
test/mcp.test.js
- initialize
- tools/list fit-only
- tools/list all mode
- tools/call error handling

test/security.test.js
- maskSecret
- sanitizeUrlForLog
- stripQuery
- extractQueryApiKey

test/rateLimit.test.js
- IP bucket
- key bucket
- health bypass

test/landscape-normalize.test.js
- crop/pest synonyms
- unknown input behavior

test/landscape-fit.test.js
- 적합 가능
- 부적합 crop mismatch
- 부적합 pest mismatch
- 등록취소 warning
- 희석배수 불일치
- 사용월 불일치

test/landscape-candidates.test.js
- candidate mode
- duplicate 제거
- ranking score
- direct/related split

test/psisClient.test.js
- build request
- serviceType AA002 -> AA001
- missing key error
- cache behavior
- HTML response detection
```

Node 내장 test runner를 쓰면 dependency를 늘리지 않고 시작할 수 있다.

```json
{
  "scripts": {
    "test": "node --test"
  }
}
```

---

## 14. 배포/운영 관련 점검

현재 README 기준 배포 구조:

```text
ChatGPT 새 앱
→ MCP 서버 URL
→ Cloudflare Workers 또는 HTTPS 프록시
→ VPS / Node.js MCP 서버
→ PSIS OpenAPI
```

좋은 점:

```text
- Query API key 방식과 header 방식을 모두 지원한다.
- SAFE_ACCESS_LOG 기본값이 true다.
- Nginx query string log 제외를 문서화했다.
- Cloudflare Workers 프록시로 원 VPS 주소 숨김 흐름을 갖고 있다.
```

점검 필요:

```text
1. Cloudflare Workers 프록시의 query string/API key logging 차단 상태 유지
2. `OPERATOR.md`에 있는 Worker 원본 경로와 실제 repo/배포 상태의 최신성 확인
3. Fly/Docker 배포 시 private files 포함이 의도된 것인지 매번 확인
4. npm package files 배열에 private ops 파일이 들어가지 않는지 유지
5. GitHub Actions에서 private file tracking 방지 check 추가
```

---

## 15. 최종 권장 상태

최종적으로는 다음 흐름을 목표로 한다.

```text
사용자 질문
  ↓
check_landscape_pesticide_fit 단일 도구 호출
  ↓
조경 용어 정규화
  ↓
PSIS 등록정보 검색
  ↓
등록취소 정보 확인
  ↓
사용월·희석배수·살포방법 자동 비교
  ↓
적합 / 부적합 / 조건부 적합 / 확인 필요 판정
  ↓
후보와 warnings, 라벨 확인 필요사항 반환
```

운영자는 별도 admin/debug profile에서만 다음을 수행한다.

```text
- PSIS 연결 진단
- raw request
- 상세조회
- cancelled search 단독 실행
- admin dashboard 확인
```

도구 수 목표:

```text
public profile: 1개 유지
admin/debug profile: 8개 내외 유지
내부 함수는 모듈별로 분리
```

---

## 16. 바로 적용할 수 있는 최소 수정 목록

코드 구조를 크게 바꾸기 전에 다음 작업부터 적용하는 것이 안전하다.

```text
1. private ops 파일 commit 방지 CI check 추가
2. README에 private ops 파일 주의사항 추가
3. src/tools.js에서 schema와 handler를 분리
4. src/landscape.js를 synonyms/checks/evaluate/candidates로 분리
5. self-test를 node:test 기반 기능별 테스트로 분리
6. MCP_PUBLIC_TOOLS=all에서만 admin/debug tool 노출되는지 별도 테스트 추가
7. psis_raw_request의 허용 endpoint/params 정책을 문서화
8. /debug/psis REST endpoint에 admin guard 또는 별도 rate limit 강화 검토
9. cache key에 apiKey hash 포함 여부를 운영 결과에 따라 검토
```

---

## 17. 결론

`landscapepsis`는 기준 문서의 핵심 원칙인 “외부 노출 도구를 업무 단위로 줄이기”를 가장 잘 지키고 있는 프로젝트 중 하나다. 일반 사용자에게 `check_landscape_pesticide_fit` 하나만 노출하고, 내부에서 PSIS 검색·등록취소 확인·후보 평가·조건 비교를 모두 처리하는 구조는 매우 적절하다.

남은 핵심 과제는 기능 추가보다 유지보수성과 운영 안전성이다. 특히 `tools.js`와 `landscape.js`의 역할을 분리하고, 비공개 운영 파일이 공개 repo에 실수로 올라가지 않도록 CI와 ignore 정책을 강화하는 것이 우선이다.

앞으로의 개선 기준은 다음 한 문장으로 잡는 것이 좋다.

```text
공개 MCP 도구는 `check_landscape_pesticide_fit` 단일 업무 도구로 유지하고, PSIS 세부 조회·진단·raw request·운영 대시보드는 admin/debug profile과 private ops 영역으로 분리한다.
```

이 방향을 유지하면 ChatGPT 사용자는 단순하게 농약 적합성 판단을 받을 수 있고, 운영자는 별도 profile에서 필요한 진단과 모니터링을 안전하게 수행할 수 있다.
