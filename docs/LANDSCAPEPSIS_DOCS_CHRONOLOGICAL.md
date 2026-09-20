# landscapepsis docs chronological summary

생성일: 2026-06-22 KST  
대상 폴더: `C:/scratch/landscapepsis/docs`  
정렬 기준: 기존 `.md` 문서의 수정시각 오름차순  
원본 보존 위치: `C:/tmp`

---

## 1. 통합 결론

`C:/scratch/landscapepsis/docs`의 기존 문서들은 `landscapepsis`가 농촌진흥청 농약안전정보시스템(PSIS) OpenAPI를 안전하게 중계하고, ChatGPT 새 앱에서 조경수 농약 적합성 판단을 단일 공개 도구로 제공하기 위한 운영·배포·구조 개선 과정을 기록한다.

시간순 흐름은 다음과 같다.

1. ChatGPT 새 앱에 MCP 서버 URL과 `psisApiKey`를 붙여 연결하는 입력 방식을 정리했다.
2. VPS + Nginx 배포 시 query string/API key가 access log에 남지 않도록 운영 가이드를 작성했다.
3. 프로젝트 전체 도구 구조를 분석해 `fit-only` 공개 도구 전략, API key masking, rate limit, cache, timeout, PSIS fetch fallback, admin/debug profile 분리 필요성을 정리했다.
4. Profile / API Safety Gate 계획을 작성했고, 해당 계획의 주요 항목은 이후 실제 코드에 구현 완료된 상태로 보관되었다.

핵심 방향은 다음 한 문장으로 요약된다.

> landscapepsis는 공개 MCP 도구를 `check_landscape_pesticide_fit` 단일 업무 도구로 유지하고, PSIS 세부 조회·진단·raw request·운영 대시보드는 admin/debug profile과 private ops 영역으로 분리해야 한다.

---

## 2. 시간순 문서 색인

| 순서 | 수정시각(KST 기준) | 원본 파일 | 제목 | 역할 |
|---:|---|---|---|---|
| 1 | 2026-06-10 06:38:22 | `CHATGPT_NEW_APP_INPUT.md` | ChatGPT 새 앱 창 입력 방법 | ChatGPT 새 앱에서 MCP 서버 URL과 `psisApiKey`를 넣는 올바른 연결 방식 안내 |
| 2 | 2026-06-10 14:38:27 | `NGINX_VPS.md` | VPS + Nginx 배포 가이드 | 공용 VPS/Nginx 운영, query string 로그 제외, HTTPS reverse proxy, PSIS 진단 안내 |
| 3 | 2026-06-13 17:13:12 | `MCP_TOOL_STRUCTURE_ANALYSIS_LANDSCAPEPSIS.md` | landscapepsis 도구 구조 분석 및 개선안 | Node.js PSIS MCP/API 서버의 도구 구조, 보안, profile, 테스트 개선안 분석 |
| 4 | 2026-06-16 07:05:02 | `LANDSCAPEPSIS_PROFILE_AND_API_SAFETY_GATE_PLAN.md` | LandscapePSIS Profile / API Safety Gate 구현 계획 | public/admin profile 분리, API key/VPS URL 마스킹, raw request 제한, response validation 계획 및 구현 완료 기록 |

---

## 3. 단계별 내용 정리

### 3.1 ChatGPT 새 앱 입력 방식 정리 단계

첫 문서는 ChatGPT 새 앱에서 `landscapepsis` MCP를 연결할 때 입력해야 할 서버 URL 형식을 정리한다.

올바른 방식은 MCP 서버 URL 뒤에 사용자가 발급받은 PSIS API key를 붙이는 것이다.

```text
https://배포주소/mcp?psisApiKey=발급키
```

또는 다음 형식도 지원한다.

```text
https://배포주소/mcp?apiKey=발급키
```

SSE 화면을 사용하는 경우에는 다음 형식을 사용한다.

```text
https://배포주소/sse?psisApiKey=발급키
```

문서에서 강조한 잘못된 방식은 PSIS 원본 API 주소를 ChatGPT 새 앱 서버 URL에 직접 넣는 것이다. PSIS 원본 API는 MCP 서버가 내부적으로 호출하는 데이터 원천이지, ChatGPT가 직접 연결할 MCP endpoint가 아니다.

이 문서의 핵심은 다음이다.

- ChatGPT는 `/mcp` 또는 `/sse` MCP endpoint를 호출한다.
- 서버는 내부적으로 PSIS OpenAPI의 목록 검색, 상세 조회, 등록취소 농약 조회 endpoint를 호출한다.
- 기본 공개 도구 모드는 `MCP_PUBLIC_TOOLS=fit-only`이다.
- 이 모드에서 ChatGPT에 노출되는 도구는 `check_landscape_pesticide_fit` 하나다.
- 이 도구는 read-only annotation을 갖고, 내부적으로 PSIS 목록 검색, 등록취소 조회, 조경 용어 정규화, 적합성 판정을 한 번에 처리한다.

또한 브라우저에서는 PSIS가 되지만 MCP 서버에서 실패할 때는 `/debug/psis` endpoint로 VPS의 DNS, outbound HTTP, firewall, hosting network 문제를 진단하도록 안내한다.

### 3.2 VPS + Nginx 배포 단계

두 번째 문서는 공용 MCP 서버를 VPS에서 운영할 때 필요한 최소 배포 구조를 정리한다.

권장 구조는 다음과 같다.

```text
인터넷 / ChatGPT
→ HTTPS 443 Nginx
→ http://127.0.0.1:3000 MCP 서버
```

중요한 운영 포인트는 access log에 query string이 남지 않도록 Nginx log format에서 `$request_uri`가 아니라 `$uri`를 사용하는 것이다. `?psisApiKey=...`가 query string에 포함되므로, 일반 access log에 그대로 남으면 API key가 노출될 수 있다.

운영 체크리스트는 다음을 포함한다.

- Nginx access log에서 query string 제외
- `RATE_LIMIT_ENABLED=true`
- `CACHE_ENABLED=true`
- `REQUEST_TIMEOUT_MS=15000` 전후
- `/health` 정상 확인
- ChatGPT 새 앱에 `/mcp?psisApiKey=...` 연결 테스트
- `/debug/psis?psisApiKey=...&pestiBrandName=살비왕`으로 VPS에서 PSIS 원본 API 연결 확인
- API key가 로그에 남지 않는지 확인

이 문서는 `landscapepsis`가 AI 연산을 직접 수행하지 않고 PSIS API를 중계하는 서버이므로, 병목은 보통 CPU가 아니라 외부 API 응답 속도와 요청량이라고 정리한다.

### 3.3 도구 구조 분석 단계

세 번째 문서는 `landscapepsis`가 농촌진흥청 PSIS OpenAPI를 조회해 조경수 농약 사용 적합성을 판정하는 Node.js 기반 MCP/API 서버라고 분석한다.

현재 구조의 핵심 기능은 다음이다.

- Express 기반 HTTP 서버
- Streamable HTTP MCP endpoint: `/mcp`
- Legacy SSE endpoint: `/sse` + `/messages`
- REST test endpoint: `/api/search`, `/api/fit`, `/api/cancelled`, `/debug/psis`
- PSIS API key query/header/env 전달 지원
- API key masking과 safe access log
- rate limit
- response cache
- PSIS fetch-first + Node http fallback
- fit-only 공개 도구 모드
- admin/debug all-tools 모드
- 조경수 현장 용어 정규화
- 등록농약 후보 검색
- 등록취소 농약 확인
- 사용월, 희석배수, 살포방법 비교
- 추천점수 기반 candidate ranking

가장 강한 장점은 일반 사용자에게 `check_landscape_pesticide_fit` 단일 읽기 전용 도구만 노출한다는 점이다. 이 구조는 ChatGPT에 불필요한 저수준 PSIS 도구를 노출하지 않고, 사용자가 원하는 “이 농약을 이 상황에 써도 되는가”라는 업무 단위 질문을 한 번에 처리한다.

문서에서 지적한 개선점은 다음이다.

- `src/tools.js`에 tool schema, callTool routing, fit workflow가 함께 있어 점점 커지고 있다.
- `src/landscape.js`가 28KB 이상으로 정규화, 판정, 후보랭킹, 비교 로직이 모두 들어 있다.
- `public/admin.html`, `src/local.js`, `src/metrics.js`, `OPERATOR.md` 같은 비공개 운영 확장이 `.git/info/exclude`에 의존하는 운영 리스크가 있다.
- admin/debug 도구는 공용 profile에서 계속 숨겨야 한다.
- 테스트가 `src/self-test.js` 단일 self-test 중심이라 기능별 회귀 테스트 분리가 필요하다.

권장 방향은 현재 fit-only 공개 도구 전략을 유지하면서 내부적으로 `tools.js`를 registry, schemas, handlers로 분리하고, `landscape.js`를 normalize, fit evaluation, condition checks, candidate ranking 등으로 나누는 것이다.

### 3.4 Profile / API Safety Gate 구현 계획 및 아카이브 단계

마지막 문서는 `landscapepsis`에 필요한 safety gate가 HWP/Office/CAD처럼 무거운 파일 preflight가 아니라 profile과 API 응답 검증 중심이어야 한다고 정리한다.

문서 상단에는 이 계획의 주요 항목이 이미 실제 코드에 구현되어 있다고 기록되어 있다. 구현 완료 항목은 다음 축으로 정리된다.

- public/admin profile 분리
- 민감정보 마스킹
- raw 요청 파라미터 제약
- timeout, retry, rate limit
- empty result와 error 구분
- 입력값 검증
- 테스트 분리

관련 구현 위치로는 `config.js`, `src/tools/profiles.js`, `src/security.js`, `src/psisClient.js`, `src/httpClient.js`, `src/rateLimit.js`, `test/*.test.js`가 언급되어 있다.

이 문서의 핵심 원칙은 다음이다.

- 공용 profile에는 안전 조회와 적합성 판단 도구만 노출한다.
- admin/debug 도구에는 raw request, debug connection, endpoint status, full response dump, API key/config diagnostics가 포함될 수 있으므로 별도 profile에서만 노출한다.
- API key, token, VPS URL, query secret, internal endpoint는 응답과 로그에서 마스킹한다.
- API 응답은 success, no_results, partial, error를 구분해 표준화한다.
- 조회 결과가 없을 때 이를 “사용 가능”으로 추정하지 않는다.
- 농약 사용 가능 여부는 근거 없이 단정하지 않고, 실제 살포 전 라벨과 등록사항 확인 필요를 명시한다.

---

## 4. 현재 기준 권장 다음 작업

1. `docs` 루트에는 이 통합 문서만 유지하고, 기존 원본 문서는 `C:/tmp`에서 참조한다.
2. 공개 MCP profile은 `check_landscape_pesticide_fit` 단일 도구 노출을 계속 유지한다.
3. `MCP_PUBLIC_TOOLS=all`은 운영자/디버그 전용으로만 사용하고, 일반 사용자용 공용 서버에는 적용하지 않는다.
4. Nginx와 Cloudflare Workers 등 프록시 계층에서 query string/API key가 로그에 남지 않는지 계속 점검한다.
5. `src/tools.js`와 `src/landscape.js`의 역할이 다시 커지면 registry/schema/handler와 normalize/evaluate/candidate 모듈로 분리한다.
6. private ops 파일이 공개 repo에 실수로 들어가지 않도록 `.gitignore`, CI, package files 정책을 유지한다.
7. no_results, timeout, upstream error는 success와 구분해서 응답하고, 사용 가능 여부를 추정하지 않는다.
8. 실제 농약 사용 안내에는 PSIS 조회 근거와 라벨/등록사항 확인 필요를 계속 포함한다.

---

## 5. 유지해야 할 운영 원칙

- ChatGPT 새 앱에는 PSIS 원본 API URL이 아니라 MCP 서버의 `/mcp` 또는 `/sse` URL을 넣는다.
- API key를 query로 받을 수 있으므로 Nginx, Worker, 서버 access log에서 query string을 남기지 않는다.
- public profile은 fit-only로 유지하고, raw/debug 도구는 admin/debug profile에만 둔다.
- PSIS API key, VPS URL, internal endpoint는 응답과 로그에서 마스킹한다.
- 조회 결과가 없으면 “사용 가능”이 아니라 “근거 부족” 또는 “확인 필요”로 보고한다.
- timeout, DNS 오류, PSIS upstream 오류는 구조화된 error로 보고한다.
- 농약 사용 여부는 등록정보와 라벨 확인이 필수이며, MCP 응답만으로 최종 살포 결정을 단정하지 않는다.
