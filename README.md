# 조경수 농약 적합성 판단 MCP

[![CI](https://github.com/JS190-prog/landscape-psis-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/JS190-prog/landscape-psis-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520-339933.svg)](package.json)
[![MCP](https://img.shields.io/badge/MCP-2025--03--26-blue.svg)](https://modelcontextprotocol.io)
[![Version](https://img.shields.io/badge/version-1.9.0-orange.svg)](CHANGELOG.md)

조경 현장에서 수목 병해충 방제 전에 **이 농약을 이 수종과 병해충에 사용해도 되는지**를 빠르게 확인하기 위한 MCP 도구입니다. ChatGPT, Claude, Cursor 등 MCP를 지원하는 AI 클라이언트에서 사용할 수 있습니다.

> **English**: An MCP (Model Context Protocol) server that checks whether a pesticide
> is officially registered for a specific landscape tree species and pest in Korea,
> by querying the Rural Development Administration's PSIS (Pesticide Safety
> Information System) OpenAPI. Bring your own free PSIS API key, append it to the
> hosted server URL (`/mcp?psisApiKey=YOUR_KEY`) or send it as an `apikey` HTTP
> header, and connect from ChatGPT, Claude.ai, Claude Desktop/Code, or Cursor.
> Returns fit / unfit / needs-review judgments with recommendation scoring.
> Korean documentation follows below.

이 MCP는 농촌진흥청 농약안전정보시스템(PSIS) 공개 OpenAPI를 조회하여, 사용자가 입력한 **제품명·수종·병해충명·사용 시기·살포 목적**을 기준으로 등록 적합성을 확인합니다. 핵심 목적은 개발자용 API 테스트가 아니라, 조경 실무자가 현장에서 농약 선택 전에 등록 여부를 한 번 더 확인할 수 있게 하는 것입니다.

---

## 1. 이 MCP가 실무에서 필요한 이유

조경수 방제 업무에서는 다음과 같은 상황이 자주 발생합니다.

- 6월에 소나무 가지가 누렇게 변해 응애류, 진딧물류, 병해 가능성을 검토해야 하는 경우
- 현장에 보유 중인 농약이 해당 수종과 병해충에 등록되어 있는지 확인해야 하는 경우
- 견적서, 작업지시서, 방제계획서에 사용할 약제를 정하기 전에 근거 자료가 필요한 경우
- 작업자가 관행적으로 쓰던 약제가 현재도 등록되어 있는지 확인해야 하는 경우
- 조경수, 가로수, 공원 수목, 공동주택 식재지 등에서 사용 가능한 약제를 후보군으로 검토해야 하는 경우

이 MCP를 사용하면 ChatGPT에서 자연어로 질문하고, PSIS 등록정보 기반으로 **적합 / 부적합 / 확인 필요** 판단을 받을 수 있습니다.

---

## 2. 대표적인 사용 장면

### 2.1 현장 방제 전 약제 적합성 확인

예시 질문:

```text
6월에 소나무 가지가 노랗게 변해서 응애 방제를 하려고 합니다.
살비왕을 소나무 응애류 방제에 사용해도 되는지 확인해줘.
```

확인 내용:

- 제품명이 PSIS에 등록되어 있는지
- 대상 수종 또는 작물명이 일치하는지
- 병해충명이 일치하거나 유사한 등록 대상인지
- 등록취소 농약에 해당하는지
- 입력한 목적과 실제 등록 용도가 맞는지

---

### 2.2 제품명 없이 등록 약제 후보 찾기

예시 질문:

```text
소나무 응애류에 등록된 조경수 농약 후보를 찾아줘.
```

이 경우 MCP는 제품명을 비워 두고, 수종과 병해충 기준으로 등록 약제 후보를 조회합니다.

활용처:

- 방제계획 수립
- 농약 구매 전 후보 검토
- 견적서 작성 전 약제 선정
- 기존 보유 약제가 없을 때 대체 후보 확인

---

### 2.3 공동주택·공원·가로수 유지관리 업무

예시 질문:

```text
공동주택 조경수 장미에 흰가루병이 발생했습니다.
사용 가능한 등록 약제를 확인해줘.
```

활용처:

- 관리사무소 방제 요청 검토
- 조경 유지관리 업체 작업 전 사전 확인
- 민원 대응 자료 작성
- 방제 결과 보고서의 근거 보완

---

### 2.4 작업지시서·방제계획서 작성 전 확인

예시 질문:

```text
이번 주 방제계획서에 넣을 약제입니다.
오티바를 소나무 잎마름병 방제 목적으로 사용할 수 있는지 확인해줘.
```

확인 후 다음과 같은 식으로 업무 문서에 반영할 수 있습니다.

```text
농약안전정보시스템 등록정보 확인 결과, 해당 수종 및 병해충에 대한 등록 적합성을 검토한 후 사용 여부를 결정함.
```

단, 최종 문서에는 반드시 실제 제품 라벨과 PSIS 원문 확인 결과를 함께 검토하는 것이 안전합니다.

---

## 3. ChatGPT에서 어떻게 질문하면 좋은가

가장 정확한 확인을 위해 아래 정보를 함께 입력하는 것이 좋습니다.

| 입력 항목 | 예시 | 설명 |
|---|---|---|
| 제품명 | 살비왕, 오티바 | 이미 사용할 농약이 정해져 있을 때 입력 |
| 수종 / 작물명 | 소나무, 장미, 벚나무, 조경수 | 방제 대상 수목 또는 작물명 |
| 병해충명 | 응애류, 진딧물류, 잎마름병, 흰가루병 | 방제하려는 병해충 |
| 사용 월 | 6월 | 발생 시기와 방제 목적 설명에 활용 |
| 사용 목적 | 가지 황화, 잎 피해, 병반 발생 | 실제 현장 증상 설명 |
| 살포 방법 | 경엽처리, 관주, 수간주사 등 | 등록 사용방법과 비교할 때 참고 |

권장 질문 형식:

```text
제품명: 살비왕
수종: 소나무
대상 병해충: 응애류
사용 시기: 6월
현장 증상: 가지와 잎이 노랗게 변함
이 농약을 사용해도 되는지 PSIS 기준으로 확인해줘.
```

제품명이 없을 때:

```text
수종: 소나무
대상 병해충: 응애류
사용 시기: 6월
등록된 농약 후보를 찾아줘.
```

---

## 4. 결과를 해석하는 방법

MCP의 판정은 보통 다음 관점으로 확인합니다.

### 적합

제품명, 수종, 병해충명이 PSIS 등록정보와 충분히 일치하는 경우입니다.

실무적으로는 다음을 추가 확인한 뒤 사용합니다.

- 제품 라벨의 작물명·병해충명·사용량·희석배수
- 안전사용기준
- 살포 가능 시기
- 작업자 보호장비
- 주변 식재, 수계, 보행자 통행 여부

### 부적합

제품은 존재하지만 입력한 수종 또는 병해충에 등록되어 있지 않거나, 등록취소 정보가 확인되는 경우입니다.

이 경우 관행 사용을 피하고, 등록된 다른 약제를 찾아야 합니다.

### 확인 필요

입력한 수종명이나 병해충명이 PSIS 표기와 완전히 일치하지 않거나, 조경수처럼 넓은 표현과 개별 수종 표현 사이에 차이가 있는 경우입니다.

이 경우 다음과 같이 다시 질문하는 것이 좋습니다.

```text
소나무 대신 조경수 또는 침엽수 기준으로 다시 확인해줘.
```

또는

```text
응애류와 점박이응애를 모두 기준으로 후보를 다시 찾아줘.
```

---

## 5. ChatGPT 새 앱 연결 방법

ChatGPT 새 앱에서 MCP 서버를 연결할 때 아래 값을 입력합니다.

| 항목 | 값 |
|---|---|
| 이름 | 조경수 농약 적합성 판단 |
| 설명 | 농약안전정보시스템 등록정보를 기준으로 조경수 농약 사용 적합성을 확인합니다. |
| 연결 | 서버 URL |
| 인증 | 인증 없음 |
| 서버 URL | `https://landscapepsis-proxy.landscapepsis.workers.dev/lmcp/mcp?psisApiKey=발급키` |

`apiKey` 이름도 사용할 수 있습니다.

```text
https://landscapepsis-proxy.landscapepsis.workers.dev/lmcp/mcp?apiKey=발급키
```

SSE 연결이 필요한 클라이언트에서는 다음 주소를 사용할 수 있습니다.

```text
https://landscapepsis-proxy.landscapepsis.workers.dev/lmcp/sse?psisApiKey=발급키
```

직접 배포한 서버를 사용하는 경우에는 자신의 배포 주소를 사용합니다.

```text
https://배포주소/mcp?psisApiKey=발급키
```

중요: ChatGPT 새 앱 서버 URL에는 PSIS 원본 API 주소를 직접 넣지 않습니다. ChatGPT에는 이 MCP 서버 주소를 입력하고, MCP 서버가 내부적으로 PSIS OpenAPI를 조회합니다.

### API 키 전달 방식 3가지

| 방식 | 사용법 | 비고 |
|---|---|---|
| URL 쿼리 | `/mcp?psisApiKey=발급키` 또는 `?apiKey=발급키` | 가장 간단, ChatGPT 새 앱 권장 |
| HTTP 헤더 | `apikey: 발급키` 또는 `x-psis-api-key: 발급키` | URL에 키가 남지 않아 로그 노출 위험이 적음 |
| 환경변수 | 서버에 `PSIS_API_KEY` 또는 `PSIS_API_BASE_URL` 설정 | 직접 배포(셀프호스팅) 시 |

우선순위는 URL 쿼리 > HTTP 헤더 > 환경변수입니다.

### Claude·Cursor 등 다른 AI 클라이언트 연결

이 서버는 표준 Streamable HTTP MCP라서 ChatGPT 외 클라이언트에서도 같은 URL로 연결됩니다.

**Claude.ai (웹) — 커스텀 커넥터**

설정 → 커넥터 → "커스텀 커넥터 추가"에서 URL 입력:

```text
https://landscapepsis-proxy.landscapepsis.workers.dev/lmcp/mcp?psisApiKey=발급키
```

**Claude Code (CLI)**

```bash
claude mcp add --transport http landscape-psis "https://landscapepsis-proxy.landscapepsis.workers.dev/lmcp/mcp?psisApiKey=발급키"
```

**Cursor**

`.cursor/mcp.json` (프로젝트) 또는 `~/.cursor/mcp.json` (전역):

```json
{
  "mcpServers": {
    "landscape-psis": {
      "url": "https://landscapepsis-proxy.landscapepsis.workers.dev/lmcp/mcp?psisApiKey=발급키"
    }
  }
}
```

**Gemini CLI**

`~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "landscape-psis": {
      "httpUrl": "https://landscapepsis-proxy.landscapepsis.workers.dev/lmcp/mcp?psisApiKey=발급키"
    }
  }
}
```

URL에 키를 넣고 싶지 않은 클라이언트는 헤더 방식을 지원하는 경우 `apikey` 헤더로 전달할 수 있습니다 (예: Cursor `headers` 필드).

---

## 6. PSIS API 키 발급

PSIS OpenAPI 키는 농약안전정보시스템에서 신청합니다.

```text
https://psis.rda.go.kr/psis/cont/contentMain.ps?menuId=PS00381
```

사이트에서 OpenAPI 키를 신청하고 승인되면 발급된 키를 MCP 서버 URL의 `psisApiKey` 값으로 넣습니다.

예시:

```text
https://landscapepsis-proxy.landscapepsis.workers.dev/lmcp/mcp?psisApiKey=발급받은키
```

---

## 7. ChatGPT에 노출되는 도구

기본 설정에서는 ChatGPT에 읽기 전용 도구 1개만 노출됩니다.

```text
check_landscape_pesticide_fit
```

이 도구는 다음 작업을 한 번에 수행합니다.

- 제품명 기준 농약등록정보 검색
- 수종 / 작물명 기준 등록정보 검색
- 병해충명 기준 등록정보 검색
- 등록취소 농약 여부 확인
- 조경 현장 용어 정규화
- 최종 적합성 판정

도구가 하나만 노출되도록 구성한 이유는 ChatGPT가 여러 세부 도구를 반복 호출하지 않게 하여, 실제 사용자가 더 간단하게 결과를 받을 수 있도록 하기 위해서입니다.

---

## 8. 실무 적용 시 주의사항

이 MCP는 농약 사용을 자동으로 결정해주는 도구가 아닙니다. **등록정보 확인을 보조하는 도구**입니다.

실제 살포 전에는 반드시 다음을 확인해야 합니다.

- 제품 라벨의 적용 작물과 병해충
- 희석배수, 사용량, 사용방법
- 안전사용기준과 취급 제한 사항
- 등록취소 또는 사용 제한 여부
- 현장 수목의 실제 피해 원인
- 주변 보행자, 반려동물, 수계, 어린이 이용 공간 등 안전 조건

특히 잎이 노랗게 변하는 증상은 응애, 진딧물, 병해, 수분 스트레스, 이식 스트레스, 토양 문제, 제초제 피해 등 원인이 다양할 수 있습니다. MCP 결과는 농약 등록 적합성 확인용으로 사용하고, 병해충 진단 자체는 현장 조사와 전문가 판단을 병행해야 합니다.

---

## 9. 운영자용 빠른 실행

로컬에서 실행하려면 다음 명령을 사용합니다.

```bash
npm install
npm start
```

상태 확인:

```text
http://localhost:3000/health
```

API 키 전달 인식 확인:

```text
http://localhost:3000/health?psisApiKey=발급키
```

응답의 `queryKeyMode.hasQueryApiKey`가 `true`이면 URL query 방식의 API 키가 인식된 것입니다.

---

## 10. 운영자용 REST 테스트

제품 검색 테스트:

```text
GET /api/search?psisApiKey=발급키&pestiBrandName=살비왕&cropName=소나무&diseaseWeedName=응애류
```

적합성 판정 테스트:

```text
GET /api/fit?psisApiKey=발급키&productName=살비왕&cropName=소나무&targetPestOrDisease=응애류
```

PSIS 연결 진단:

```text
GET /debug/psis?psisApiKey=발급키&pestiBrandName=살비왕
```

응답과 로그에서는 API 키가 마스킹되도록 구성되어 있습니다.

---

## 11. 배포 구성 참고

권장 배포 구조는 다음과 같습니다.

```text
ChatGPT 새 앱
→ MCP 서버 URL
→ Cloudflare Workers 또는 HTTPS 프록시
→ VPS / Node.js MCP 서버
→ PSIS OpenAPI
```

VPS 직접 운영 시에는 다음 구조를 권장합니다.

```text
Ubuntu VPS
→ Nginx HTTPS
→ Node.js MCP 서버 localhost:3000
→ PM2 또는 Docker
→ ChatGPT 새 앱: https://도메인/mcp?psisApiKey=사용자키
```

Nginx 설정에서는 query string이 access log에 남지 않도록 주의해야 합니다. 상세 예시는 다음 문서를 참고합니다.

```text
docs/NGINX_VPS.md
```

---

## 12. 공용 서버 보호 설정

공용 서버로 운영할 때는 `.env`에서 요청 제한, 캐시, timeout, 공개 도구 범위를 조정할 수 있습니다.

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

주요 설정 의미:

| 설정 | 기본값 | 설명 |
|---|---:|---|
| `RATE_LIMIT_MAX_PER_IP` | 60 | IP별 1분 요청 제한 |
| `RATE_LIMIT_MAX_PER_KEY` | 60 | API 키별 1분 요청 제한 |
| `CACHE_TTL_MS` | 21600000 | 동일 PSIS 검색 결과 6시간 캐시 |
| `REQUEST_TIMEOUT_MS` | 15000 | PSIS API 응답 대기 제한 |
| `FIT_MAX_CANDIDATE_SEARCHES` | 10 | 적합성 판정 1회당 후보 검색 API 호출 제한 |
| `FIT_SEARCH_DISPLAY_COUNT` | 10 | 후보 검색 1회당 표시 결과 수 제한 |
| `SAFE_ACCESS_LOG` | true | access log에서 query string/API 키 제외 |
| `MCP_PUBLIC_TOOLS` | fit-only | ChatGPT에는 단일 판정 도구만 노출 |
| `PSIS_HTTP_CLIENT` | fetch-first | fetch 실패 시 Node http fallback 사용 가능 |

---

## 13. 관리자 / 디버그 도구

기본값은 `MCP_PUBLIC_TOOLS=fit-only`입니다. 관리자 또는 디버그 목적으로 전체 도구를 노출하려면 `.env`에 다음을 설정합니다.

```env
MCP_PUBLIC_TOOLS=all
```

전체 도구 노출 시 사용할 수 있는 도구는 다음과 같습니다.

- `psis_test_connection`: PSIS 키 연결 테스트
- `psis_debug_connection`: PSIS HTTP/DNS/outbound 진단
- `psis_search_pesticides`: 농약등록정보 목록 검색
- `psis_get_pesticide_detail`: 농약등록정보 상세 조회
- `psis_search_cancelled_pesticides`: 등록취소 농약 조회
- `normalize_landscape_terms`: 조경 현장 용어 정규화
- `check_landscape_pesticide_fit`: 제품명·수종·병해충 기준 적합성 판정
- `psis_raw_request`: 고급 사용자용 원시 PSIS 요청

일반 사용자에게는 전체 도구 노출보다 `fit-only` 구성을 권장합니다.

---

## 14. API 키와 보안 주의

URL query 방식은 사용이 쉽지만, API 키가 브라우저 기록, 프록시 로그, 웹서버 access log에 남을 수 있습니다. 클라이언트가 지원한다면 `apikey` HTTP 헤더 방식이 로그 노출 위험이 더 적습니다.

이 MCP는 앱 로그와 응답에서 API 키를 마스킹하도록 구성되어 있지만, 실제 운영 환경에서는 다음을 반드시 확인해야 합니다.

- Nginx 또는 프록시 access log에서 query string 제외
- 오류 로그에 전체 URL이 남지 않도록 설정
- GitHub README, 예제 파일, 스크린샷에 실제 API 키 업로드 금지
- 공용 서버 운영 시 IP별 / API 키별 rate limit 적용
- 필요 시 사용자별 API 키 발급 방식 안내

개인용, 소규모 공용, 공공 API 편의형 사용에는 query key 방식이 간단합니다. 대규모 운영 서비스에서는 OAuth, 사용자별 암호화 저장, 별도 인증 프록시 방식을 검토하는 것이 좋습니다.

---

## 15. 이 MCP가 하지 않는 일

이 MCP는 다음을 대신하지 않습니다.

- 실제 병해충 진단
- 현장 조사
- 농약 제품 라벨 확인
- 안전사용기준 확인
- 전문가의 최종 판단
- 지자체, 발주처, 관리주체의 별도 기준 검토

즉, 이 MCP는 “사용 가능한 농약을 자동으로 골라주는 도구”라기보다, **PSIS 등록정보를 빠르게 조회하여 실무 판단의 근거를 보강하는 도구**입니다.

---

## 16. 면책 조항

이 MCP의 판정 결과는 농촌진흥청 농약안전정보시스템(PSIS) 공개 데이터 기반의 참고 정보입니다.

실제 농약 선택과 사용은 반드시 제품 등록 라벨, 안전사용기준, 현장 여건, 관련 법령, 전문가 판단을 함께 검토한 후 결정해야 합니다. 판정 결과의 오류·누락 또는 그 사용으로 발생하는 손해에 대해 개발자는 책임을 지지 않습니다.

---

## 17. 데이터 출처

본 MCP는 농촌진흥청 농약안전정보시스템(PSIS) 공개 OpenAPI 데이터를 사용합니다.

농촌진흥청은 본 MCP 서비스를 보증하거나 제휴하지 않으며, 데이터의 최신성·정확성은 원천 시스템 기준입니다.
