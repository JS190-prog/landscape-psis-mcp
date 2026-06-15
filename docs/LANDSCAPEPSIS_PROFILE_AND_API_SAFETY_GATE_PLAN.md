# LandscapePSIS Profile / API Safety Gate 구현 계획

> **상태: 구현 완료 — 보관용 아카이브 (2026-06-16 정리)**
>
> 이 계획이 제안한 항목(public/admin profile 분리, 민감정보 마스킹, raw 요청 파라미터 제약,
> timeout·retry·rate limit, empty result/에러 구분, 입력값 검증, 테스트 분리)은 모두 현재 코드에
> 이미 반영되어 있습니다 — `config.js`(`mcpPublicTools`), `src/tools/profiles.js`, `src/security.js`,
> `src/psisClient.js`(`RAW_REQUEST_ALLOWED_PARAMS`), `src/httpClient.js`, `src/rateLimit.js`, `test/*.test.js`.
> 신규 작업 지시가 아니라 의사결정 기록으로만 보관합니다. 거의 동일한 중복본
> `LANDSCAPEPSIS_PROFILE_API_GATE_IMPLEMENTATION_PLAN.md`는 정리 시 삭제했습니다.

작성일: 2026-06-15 KST
대상 폴더: `C:/scratch/landscapepsis`
우선순위: 4순위 / 중간
문서 목적: 조경·농약 PSIS 조회 MCP에서 공용 도구와 관리자/debug 도구를 분리하고, API key/VPS URL 노출, raw request 남용, 조회 실패 오판을 줄이기 위한 profile / API safety / response validation gate 구현 방향을 정리한다.

---

## 1. 적용 판단

`landscapepsis`는 HWP/Office/CAD처럼 로컬 파일을 직접 수정하는 MCP가 아니다. 주된 역할은 조경·농약 관련 정보를 조회하고 적합성을 판단하는 것이다.

따라서 무거운 preflight gate나 planning_required 흐름은 적합하지 않다.

대신 다음이 중요하다.

```text
- 공용 profile과 admin/debug profile 분리
- API key, VPS URL, 내부 endpoint 마스킹
- raw request 도구의 공용 노출 금지
- 외부 API timeout / rate limit / retry 정책
- 조회 결과의 confidence와 source 구분
- 실패한 조회를 성공처럼 보고하지 않음
```

---

## 2. 목표 상태

LandscapePSIS MCP 호출은 다음 흐름을 따른다.

```text
public query tool
  ↓
입력값 검증: 작물명 / 병해충명 / 제품명 / 지역 / 적용 목적
  ↓
API 호출 정책 확인: timeout / retry / rate limit
  ↓
민감정보 마스킹
  ↓
응답 정규화
  ↓
조회 성공 / 부분 성공 / 실패 / 근거 부족 구분
```

공용 사용자는 다음만 접근 가능해야 한다.

```text
- 일반 조경 농약 적합성 조회
- 병해충/작물/제품명 기반 검색
- 사용상 주의사항 요약
- 출처/조회시각 포함 결과
```

관리자/debug 도구는 별도 profile에서만 노출한다.

```text
- raw request
- debug connection
- endpoint status
- full response dump
- API key/config diagnostics
```

---

## 3. 도구 위험도 분류

| 위험도 | 예시 작업 | 기본 정책 |
|---|---|---|
| public_read | 농약/병해충/작물 조회 | 공용 profile 허용 |
| fit_check | 사용 목적 적합성 판단 | 공용 profile 허용, 근거 표시 |
| diagnostic | 연결상태, endpoint health | operator profile |
| raw_debug | raw request, raw response dump | admin/debug only |
| config_sensitive | API key, endpoint, VPS URL 확인 | 마스킹 필수 |
| write_config | config 수정 | confirm + backup 필요 |

---

## 4. 추가 권장 파일

### 4.1 `src/tools/profilePolicy.js`

역할:

- 도구별 profile과 위험도를 중앙화한다.
- public profile에는 안전한 조회 도구만 노출한다.

권장 구조:

```javascript
export const TOOL_RISK = {
  PUBLIC_READ: 'public_read',
  FIT_CHECK: 'fit_check',
  DIAGNOSTIC: 'diagnostic',
  RAW_DEBUG: 'raw_debug',
  CONFIG_SENSITIVE: 'config_sensitive',
  WRITE_CONFIG: 'write_config',
};

export const TOOL_POLICIES = {
  check_landscape_pesticide_fit: {
    risk: TOOL_RISK.FIT_CHECK,
    profiles: ['public', 'operator', 'admin'],
    requiresInputValidation: true,
    masksSensitiveOutput: true,
    requiresSourceSummary: true,
  },
  psis_search_product: {
    risk: TOOL_RISK.PUBLIC_READ,
    profiles: ['public', 'operator', 'admin'],
    requiresInputValidation: true,
    masksSensitiveOutput: true,
  },
  psis_debug_connection: {
    risk: TOOL_RISK.DIAGNOSTIC,
    profiles: ['operator', 'admin'],
    masksSensitiveOutput: true,
  },
  psis_raw_request: {
    risk: TOOL_RISK.RAW_DEBUG,
    profiles: ['admin'],
    masksSensitiveOutput: true,
    requiresConfirm: true,
  },
};

export function isToolAllowed(toolName, profile = 'public') {
  const policy = TOOL_POLICIES[toolName];
  if (!policy) return false;
  return policy.profiles.includes(profile);
}
```

---

### 4.2 `src/security/maskSensitive.js`

역할:

- API key, token, VPS URL, query secret, internal endpoint를 응답과 로그에서 마스킹한다.

권장 구조:

```javascript
export function maskSensitiveText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/psisApiKey=[A-Za-z0-9_-]+/gi, 'psisApiKey=***')
    .replace(/api[_-]?key[=:]\s*[A-Za-z0-9_-]+/gi, 'apiKey=***')
    .replace(/https?:\/\/[^\s]+\/lmcp\/mcp\?[^\s]+/gi, '[masked-mcp-url]');
}

export function maskSensitiveObject(obj) {
  if (Array.isArray(obj)) return obj.map(maskSensitiveObject);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, maskSensitiveObject(v)])
    );
  }
  return maskSensitiveText(obj);
}
```

---

### 4.3 `src/tools/apiResponseGate.js`

역할:

- API 응답을 표준화한다.
- 조회 실패와 부분 성공을 명확히 구분한다.
- 근거 없는 추천을 방지한다.

권장 응답 형식:

```javascript
export function normalizePsisResponse({ query, response, source, elapsedMs }) {
  const rows = Array.isArray(response?.items) ? response.items : [];
  return {
    status: rows.length > 0 ? 'success' : 'no_results',
    query,
    result_count: rows.length,
    source,
    elapsed_ms: elapsedMs,
    confidence: rows.length > 0 ? 'source_backed' : 'insufficient_evidence',
    items: rows,
    warning: rows.length > 0 ? null : '조회 결과가 없어 농약 사용을 단정할 수 없습니다.',
  };
}
```

---

## 5. 입력값 검증

공용 조회 도구는 다음을 확인해야 한다.

```text
[ ] 작물명 또는 대상 식물명이 있는가?
[ ] 병해충명 또는 증상이 있는가?
[ ] 제품명 검색인지 성분 검색인지 구분되는가?
[ ] 사용 목적이 방제인지 예방인지 구분되는가?
[ ] 지역/계절 정보가 필요한 질문인지 판단되는가?
[ ] 사용자에게 법적/안전상 확정 지시처럼 표현하지 않는가?
```

응답 표현 원칙:

```text
- 등록 여부와 사용 가능 여부를 구분
- 조회 결과가 없으면 '사용 가능'으로 추정하지 않음
- 실제 살포 전 라벨/등록사항 확인 필요 명시
- 농약 안전사용기준과 현장 전문가 확인을 권장
```

---

## 6. API 호출 정책

권장 정책:

```text
- timeout 기본값 설정
- retry는 짧게 1~2회만
- 동일 질의 cache 또는 debounce
- API key는 로그에 남기지 않음
- raw response는 public profile에서 숨김
- external API error는 구조화된 error로 변환
```

오류 응답 예시:

```json
{
  "status": "error",
  "stage": "psis_api_request",
  "error_code": "api_timeout",
  "message": "PSIS API 응답 시간이 초과되었습니다.",
  "recoverable": true,
  "suggestion": "잠시 후 다시 조회하거나 제품명/작물명을 줄여 검색하세요."
}
```

---

## 7. 기존 파일 수정 방향

### 7.1 `src/tools/profiles.js`

- public / operator / admin profile을 명확히 분리
- raw/debug 도구는 public에서 제거
- 기본 profile은 public 또는 fit-only로 유지

### 7.2 `src/tools/handlers.js`

- 모든 handler 응답 전에 `maskSensitiveObject` 적용
- no result / partial / error 상태를 분리
- source, query, result_count, confidence 필드 추가

### 7.3 `src/server.js` 또는 `src/mcp.js`

- profile 환경변수 적용
- 허용되지 않은 도구 호출은 구조화된 blocked 응답 반환

예시:

```javascript
if (!isToolAllowed(toolName, activeProfile)) {
  return {
    status: 'blocked',
    error_code: 'tool_not_allowed_in_profile',
    tool: toolName,
    profile: activeProfile,
  };
}
```

---

## 8. 테스트 추가 방향

```text
test/profile-policy.test.js
test/mask-sensitive.test.js
test/api-response-gate.test.js
test/public-profile-tools.test.js
```

테스트 항목:

```text
[ ] public profile에 raw/debug 도구가 없음
[ ] admin profile에는 raw/debug 도구가 있음
[ ] API key와 VPS URL이 마스킹됨
[ ] no_results는 success로 처리되지 않음
[ ] API timeout은 구조화된 error 반환
[ ] source/result_count/confidence 필드가 유지됨
```

실행 예시:

```powershell
cd C:\scratch\landscapepsis
npm test
```

또는 package script가 없다면:

```powershell
node --test
```

---

## 9. 단계별 구현 순서

1. profilePolicy.js 추가 또는 기존 profiles.js 보강
2. maskSensitive.js 추가
3. apiResponseGate.js 추가
4. public/admin profile 분리 강화
5. raw/debug 도구 public 비노출 확인
6. 응답 표준화
7. 테스트 추가
8. README에 public/admin profile 사용법 보강

---

## 10. 적용하지 말아야 할 방식

```text
- local-code-mcp 같은 무거운 file preflight를 그대로 복사
- 모든 조회에 planning_required 적용
- API key 또는 VPS URL을 응답/로그에 노출
- no result를 사용 가능으로 추정
- raw request 도구를 공용 profile에 노출
- 외부 API 실패를 일반 success로 포장
```

---

## 11. 최종 권장안

`landscapepsis`는 4순위로 적용한다. 핵심은 다음이다.

```text
공용 profile은 안전 조회만
admin/debug 도구는 분리
API key/VPS URL 마스킹
조회 결과와 근거 수준 표시
no_results/error를 success와 구분
농약 사용 가능 여부를 근거 없이 단정하지 않음
```
