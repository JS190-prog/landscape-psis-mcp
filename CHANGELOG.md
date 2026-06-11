# Changelog

이 프로젝트의 주요 변경 사항을 기록합니다. 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따르며,
버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

## [1.9.0] - 2026-06-12

### Added
- `apikey` / `x-psis-api-key` HTTP 헤더로 PSIS API 키 전달 지원 (우선순위: URL 쿼리 > 헤더 > 환경변수). 헤더 방식은 URL에 키가 남지 않아 로그 노출 위험이 적음
- LICENSE (MIT) 추가
- CHANGELOG.md 추가
- README: 배지, 영문 요약, Claude.ai·Claude Code·Cursor·Gemini CLI 연결 가이드, 키 전달 방식 3종 비교표
- `psisClient.js`: upstream 호출 계측 훅(`setUpstreamObserver`) 및 캐시 통계 조회(`getCacheStats`)
- `server.js`: 배포 로컬 확장 모듈(`src/local.js`) 선택 로드 훅 — 파일이 없으면 동일하게 동작

### Changed
- 헤더 키도 키별 rate limit 대상에 포함

## [1.8.0] - 2026-06-11

### Added
- 필드 단위 사용조건 비교: 사용월·희석배수·살포방법을 입력값과 자동 대조
- 등록 후보 추천 점수(recommendation scoring) 및 직접/관련 후보 구분

## [1.7.0] - 2026-06-10

### Added
- `check_landscape_pesticide_fit` 후보 목록 조회 모드: 제품명 없이 수종·병해충 기준 등록 후보 검색

## [1.6.0] - 2026-06-10

### Added
- `MCP_PUBLIC_TOOLS=fit-only` 기본값: ChatGPT에 읽기 전용 판정 도구 1개만 노출하여 도구 승인 질문 감소

## [1.5.0] - 2026-06-10

### Added
- 최초 공개 베이스라인
- PSIS AA001 XML 응답 파싱 (AA002 HTML 위젯 자동 교정)
- 브라우저 User-Agent 적용 (PSIS WAF 차단 회피)
- 일시적 연결 리셋 재시도 및 fetch → Node http fallback 클라이언트
- 쿼리 키 모드, 캐시, IP/키별 rate limit, timeout, API 키 로그 마스킹
- Streamable HTTP `/mcp` + legacy SSE `/sse` 전송, ChatGPT 새 앱 연결 지원
