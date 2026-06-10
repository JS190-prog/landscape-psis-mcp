# ChatGPT 새 앱 창 입력 방법

이 최종본은 `korean-law-mcp`처럼 서버 URL 뒤에 API 키를 붙여 쓰는 구조입니다.

## 1. 올바른 입력

| 항목 | 값 |
|---|---|
| 연결 | 서버 URL |
| 인증 | 인증 없음 |
| 서버 URL | `https://배포주소/mcp?psisApiKey=발급키` |

`apiKey` 이름도 지원합니다.

```text
https://배포주소/mcp?apiKey=발급키
```

SSE 화면이면:

```text
https://배포주소/sse?psisApiKey=발급키
```

## 2. 잘못된 입력

아래 PSIS 원본 API 주소를 ChatGPT 새 앱 서버 URL에 직접 넣으면 안 됩니다.

```text
http://psis.rda.go.kr/openApi/service.do?apiKey=발급키&serviceCode=SVC01&serviceType=AA001
```

위 주소는 MCP 서버가 내부에서 호출하는 데이터 원천입니다.

## 3. 내부 처리

ChatGPT가 호출하는 주소:

```text
https://배포주소/mcp?psisApiKey=발급키
```

MCP 서버가 내부에서 호출하는 주소:

```text
http://psis.rda.go.kr/openApi/service.do?apiKey=발급키&serviceCode=SVC01&serviceType=AA001
```

서버가 자동으로 바꾸는 코드:

- 목록 검색: `SVC01`
- 상세 조회: `SVC02`
- 등록취소 농약 조회: `SVC08`
- JSON 응답 기본값: `serviceType=AA001`

## 4. 공용 서버 보호 기능

이번 최종본에는 공용 VPS 사용을 위해 다음 기능이 포함되어 있습니다.

- IP별 rate limit
- API 키별 rate limit
- PSIS 응답 캐시
- 요청 timeout
- API 키 로그 마스킹
- query string 미기록 safe access log
- 적합성 판정 후보 검색 수 제한
- PSIS HTTP fetch 실패 시 Node http fallback과 `/debug/psis` 진단

Nginx를 앞단에 둘 경우 `docs/NGINX_VPS.md`처럼 access log에서 query string을 빼야 합니다.

## 5. ChatGPT에서 도구 승인 질문 줄이기

기본값은 `MCP_PUBLIC_TOOLS=fit-only`입니다. 이 모드에서는 ChatGPT에 아래 단일 도구만 노출됩니다.

```text
check_landscape_pesticide_fit
```

이 도구는 읽기 전용으로 표시됩니다. 서버는 내부적으로 PSIS 목록 검색, 등록취소 조회, 조경 용어 정규화, 적합성 판정을 한 번에 처리합니다.

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": true
}
```

관리자 디버그용으로 모든 도구를 노출하려면 서버 `.env`에 아래를 넣습니다. 일반 사용자용 공용 서버에서는 권장하지 않습니다.

```env
MCP_PUBLIC_TOOLS=all
```

## 6. ChatGPT에서 질문 예시

```text
소나무에 살비왕을 6월 응애 방제로 사용해도 되는지 확인해줘.
```

```text
오티바가 조경수 잎마름병에 등록되어 있는지 확인해줘.
```

```text
이 약제가 등록취소 농약인지 확인해줘: 살비왕
```


## 7. 브라우저에서는 PSIS가 되는데 MCP에서 실패할 때

배포 서버에서 아래 URL을 먼저 확인합니다.

```text
https://배포주소/debug/psis?psisApiKey=발급키&pestiBrandName=살비왕
```

응답의 `transport`가 `fetch`, `node-http`, `node-http-fallback` 중 무엇인지 확인합니다. `EAI_AGAIN`, `ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT` 같은 값이 나오면 API 키 문제가 아니라 VPS의 DNS, outbound HTTP, 방화벽, 호스팅 네트워크 문제일 가능성이 큽니다.

Node fetch만 실패하는 환경에서는 서버 `.env`에 아래를 추가합니다.

```env
PSIS_HTTP_CLIENT=node
```
