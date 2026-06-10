# 조경수 농약 적합성 판단 MCP 서버

농약안전정보시스템(PSIS) OpenAPI를 ChatGPT 새 앱에서 MCP 도구로 사용할 수 있게 감싸는 서버입니다. 사용 방식은 `korean-law-mcp`처럼 **MCP 서버 URL 뒤에 공공 API 키를 query parameter로 붙이는 방식**을 기본으로 합니다.

이번 최종본은 공용 VPS 운영과 ChatGPT 도구 승인 질문 최소화를 전제로 다음 보호 기능을 반영했습니다.

- 사용자별 URL query API 키 지원: `/mcp?psisApiKey=발급키` 또는 `/mcp?apiKey=발급키`
- IP별 / API 키별 rate limit
- PSIS 응답 메모리 캐시
- PSIS 요청 timeout
- API 키 로그 마스킹 및 query string 미기록 safe access log
- 적합성 판정 시 후보 검색 수 / 검색 결과 수 제한
- Nginx VPS 배포 가이드 포함
- PSIS HTTP fetch 실패 시 Node http fallback 및 `/debug/psis` 진단 endpoint
- ChatGPT에는 기본적으로 읽기 전용 단일 도구 `check_landscape_pesticide_fit`만 노출
- MCP tool descriptor에 `readOnlyHint`, `destructiveHint:false`, `idempotentHint` 적용

## 1. ChatGPT 새 앱 입력값

ChatGPT 새 앱 창에는 아래처럼 입력합니다.

| 항목 | 값 |
|---|---|
| 이름 | 조경수 농약 적합성 판단 |
| 설명 | 농약안전정보시스템 OpenAPI로 조경수 농약 등록정보와 적합성을 확인합니다. |
| 연결 | 서버 URL |
| 인증 | 인증 없음 |
| 서버 URL | `https://배포주소/mcp?psisApiKey=발급키` |

`apiKey` 이름도 호환됩니다.

```text
https://배포주소/mcp?apiKey=발급키
```

SSE 화면만 보이는 클라이언트에서는 아래도 지원합니다.

```text
https://배포주소/sse?psisApiKey=발급키
```

중요: ChatGPT 새 앱 서버 URL에는 `http://psis.rda.go.kr/openApi/service.do?...`를 직접 넣지 않습니다. 그 주소는 원본 PSIS API이고, ChatGPT에는 이 MCP 서버를 배포한 주소를 넣습니다.

## 2. 내부 PSIS 호출 방식

사용자가 다음처럼 연결하면,

```text
https://landscape-psis-mcp.example.com/mcp?psisApiKey=YOUR_KEY
```

MCP 서버는 내부적으로 아래 PSIS API를 호출합니다.

```text
http://psis.rda.go.kr/openApi/service.do?apiKey=YOUR_KEY&serviceCode=SVC01&serviceType=AA001
```

서비스코드는 서버가 자동 전환합니다.

| 기능 | 내부 호출 |
|---|---|
| 농약등록정보 목록 검색 | `serviceCode=SVC01` |
| 농약등록정보 상세 조회 | `serviceCode=SVC02` |
| 등록취소 농약 조회 | `openApi/cnclAgchm.do` + `serviceCode=SVC08` |

`serviceType` 기본값은 `AA001`(XML)입니다. `AA002`는 브라우저용 HTML 위젯이라 서버가 자동으로 `AA001`로 교정합니다.

## 3. ChatGPT에 노출되는 MCP 도구

기본값은 `MCP_PUBLIC_TOOLS=fit-only`입니다. ChatGPT에는 아래 읽기 전용 단일 도구만 노출됩니다.

- `check_landscape_pesticide_fit`: 제품명·수종·병해충 기준으로 PSIS 목록 검색, 등록취소 조회, 조경 용어 정규화, 적합성 판정을 한 번에 수행

이렇게 하면 ChatGPT가 여러 개의 세부 도구를 반복 선택하지 않아 도구 사용 승인 질문이 줄어듭니다. 이 도구 descriptor에는 다음 힌트가 포함됩니다.

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": true
}
```

관리자/debug 목적으로 모든 도구를 노출하려면 `.env`에 아래를 설정합니다.

```env
MCP_PUBLIC_TOOLS=all
```

`all` 모드에서 노출되는 도구는 다음입니다.

- `psis_test_connection`: PSIS 키 연결 테스트
- `psis_debug_connection`: 브라우저에서는 되지만 서버에서 `fetch failed`가 날 때 PSIS HTTP/DNS/outbound 진단
- `psis_search_pesticides`: 농약등록정보 목록 검색
- `psis_get_pesticide_detail`: 농약등록정보 상세 조회
- `psis_search_cancelled_pesticides`: 등록취소 농약 조회
- `normalize_landscape_terms`: 소나무/조경수/응애 등 현장 용어 정규화
- `check_landscape_pesticide_fit`: 제품명·수종·병해충 기준 적합성 판정
- `psis_raw_request`: 고급 사용자용 원시 PSIS 요청

## 4. 빠른 실행

```bash
npm install
npm start
```

로컬 확인:

```text
http://localhost:3000/health
```

로컬에서 query key 전달 테스트:

```text
http://localhost:3000/health?psisApiKey=발급키
```

응답의 `queryKeyMode.hasQueryApiKey`가 `true`이면 서버 URL query key 방식이 인식된 것입니다.

PSIS 원본 API가 브라우저에서는 열리는데 MCP 서버에서 `fetch failed`가 나면 아래 진단 endpoint를 확인합니다. 응답에는 API 키가 마스킹됩니다.

```text
http://localhost:3000/debug/psis?psisApiKey=발급키&pestiBrandName=살비왕
```

## 5. VPS 배포 권장 구성

권장 구조:

```text
Ubuntu VPS
→ Nginx HTTPS
→ Node.js MCP 서버 localhost:3000
→ PM2 또는 Docker
→ ChatGPT 새 앱: https://도메인/mcp?psisApiKey=사용자키
```

상세 Nginx 예시는 `docs/NGINX_VPS.md`를 확인하세요. 핵심은 **Nginx access log에 query string을 남기지 않는 것**입니다.

## 6. 공용 서버 보호 설정

`.env`에서 조정할 수 있습니다.

```env
REQUEST_TIMEOUT_MS=15000
CACHE_ENABLED=true
CACHE_TTL_MS=21600000
CACHE_MAX_ENTRIES=1000
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_PER_IP=60
RATE_LIMIT_MAX_PER_KEY=60
FIT_MAX_CANDIDATE_SEARCHES=10
FIT_SEARCH_DISPLAY_COUNT=10
FIT_MAX_RETURNED_ITEMS=100
SAFE_ACCESS_LOG=true
MCP_PUBLIC_TOOLS=fit-only
PSIS_HTTP_CLIENT=fetch-first
```

의미:

| 설정 | 기본값 | 설명 |
|---|---:|---|
| `RATE_LIMIT_MAX_PER_IP` | 60 | IP별 1분 요청 제한 |
| `RATE_LIMIT_MAX_PER_KEY` | 60 | API 키별 1분 요청 제한 |
| `CACHE_TTL_MS` | 21600000 | 동일 PSIS 검색 결과 6시간 캐시 |
| `REQUEST_TIMEOUT_MS` | 15000 | PSIS API 응답 대기 제한 |
| `FIT_MAX_CANDIDATE_SEARCHES` | 10 | 적합성 판정 1회당 후보 검색 API 호출 제한 |
| `FIT_SEARCH_DISPLAY_COUNT` | 10 | 후보 검색 1회당 결과 수 제한 |
| `SAFE_ACCESS_LOG` | true | access log에서 query string/API 키 제외 |
| `MCP_PUBLIC_TOOLS` | fit-only | ChatGPT에는 단일 판정 도구만 노출. 관리자용은 `all` |
| `PSIS_HTTP_CLIENT` | fetch-first | `fetch-first` 또는 `node`. Node fetch가 실패하면 `node`로 강제 가능 |

## 7. 보조 환경변수 방식

URL에 키를 붙이고 싶지 않은 경우 서버 환경변수도 지원합니다.

```env
PSIS_API_KEY=발급키
```

또는 전체 PSIS URL 방식도 지원합니다.

```env
PSIS_API_BASE_URL=http://psis.rda.go.kr/openApi/service.do?apiKey=발급키&serviceCode=SVC01&serviceType=AA001
```

우선순위는 다음과 같습니다.

1. `/mcp?psisApiKey=...` 또는 `/mcp?apiKey=...`
2. 도구 인자 `psisApiKey`, `apiKey`, `psisApiUrl`
3. 서버 환경변수 `PSIS_API_BASE_URL`
4. 서버 환경변수 `PSIS_API_KEY`

## 8. REST / debug 테스트

PSIS 브라우저 호출은 되는데 서버에서 실패할 때는 다음을 먼저 확인합니다.

```text
GET /debug/psis?psisApiKey=발급키&pestiBrandName=살비왕
```

응답의 `transport`가 `fetch`, `node-http`, `node-http-fallback` 중 무엇인지 확인합니다. DNS 오류나 outbound HTTP 차단이 있으면 `details.target`, `details.fetchFailure`, `details.nodeHttpFailure`에 구조화되어 표시됩니다.

VPS에서 Node fetch만 실패하면 `.env`에 아래를 추가해 Node 기본 http 모듈을 우선 사용하도록 할 수 있습니다.

```env
PSIS_HTTP_CLIENT=node
```

## 9. REST 테스트

브라우저/REST로도 테스트할 수 있습니다.

```text
GET /api/search?psisApiKey=발급키&pestiBrandName=살비왕&cropName=소나무&diseaseWeedName=응애류
```

```text
GET /api/fit?psisApiKey=발급키&productName=살비왕&cropName=소나무&targetPestOrDisease=응애류
```

응답의 request 정보에서는 `apiKey`가 `[REDACTED]`로 마스킹됩니다.

## 10. 보안 주의

URL query key 방식은 사용이 가장 쉽지만, API 키가 브라우저 기록, 프록시 로그, 서버 접근 로그에 남을 수 있습니다. 이 프로그램은 앱 로그와 응답에서 API 키를 마스킹하지만, **Nginx/웹서버 access log도 반드시 query string 제외 방식으로 설정**해야 합니다.

개인용·소규모 공용 또는 공공 API 편의형 사용에는 적합하지만, 대규모 운영 서비스에서는 OAuth 또는 사용자별 암호화 저장 방식을 권장합니다.

## 11. 한계

이 서버는 농약등록정보 기준으로 적합성을 판단합니다. 실제 수목 병해충 진단은 현장 사진, 피해 양상, 발생 시기, 수목 상태 자료가 필요합니다.
