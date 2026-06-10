# VPS + Nginx 배포 가이드

이 파일은 사용자가 각자 `?psisApiKey=발급키`를 붙여 접속하는 공용 MCP 서버를 VPS에서 운영할 때 필요한 최소 설정입니다.

## 1. 권장 구조

```text
인터넷 / ChatGPT
→ HTTPS 443 Nginx
→ http://127.0.0.1:3000 MCP 서버
```

ChatGPT 새 앱 서버 URL:

```text
https://your-domain.example/mcp?psisApiKey=사용자발급키
```

## 2. Node.js 서버 실행 예시

```bash
npm install
npm start
```

PM2 사용 예시:

```bash
npm install -g pm2
pm2 start src/server.js --name landscape-psis-mcp
pm2 save
pm2 startup
```

## 3. Nginx 설정 예시

중요: access log에 query string이 남지 않도록 `$uri`만 기록합니다. `$request_uri`를 쓰면 `?psisApiKey=...`가 로그에 남을 수 있습니다.

```nginx
log_format no_query '$remote_addr - $remote_user [$time_local] '
                    '"$request_method $uri $server_protocol" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent"';

server {
    listen 80;
    server_name your-domain.example;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.example;

    access_log /var/log/nginx/landscape-psis-mcp.access.log no_query;
    error_log  /var/log/nginx/landscape-psis-mcp.error.log warn;

    ssl_certificate     /etc/letsencrypt/live/your-domain.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.example/privkey.pem;

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

## 4. Let's Encrypt 예시

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

## 5. 운영 확인

```text
https://your-domain.example/health
```

query key 인식 확인:

```text
https://your-domain.example/health?psisApiKey=테스트키
```

응답에서 아래가 보이면 URL query key가 인식된 것입니다.

```json
{
  "queryKeyMode": {
    "hasQueryApiKey": true
  }
}
```

## 6. VPS 사양 기준

2 vCPU / 8GB RAM / 100GB disk / 8TB bandwidth면 소규모~중간 규모 공용 MCP 서버에는 충분합니다. 이 서버는 AI 연산을 하지 않고 PSIS API를 중계하므로, 병목은 보통 CPU가 아니라 외부 API 응답 속도와 요청량입니다.

## 7. 필수 운영 체크리스트

- [ ] Nginx access log에서 query string 제외
- [ ] `RATE_LIMIT_ENABLED=true`
- [ ] `CACHE_ENABLED=true`
- [ ] `REQUEST_TIMEOUT_MS=15000` 전후
- [ ] `/health` 정상 확인
- [ ] ChatGPT 새 앱에 `/mcp?psisApiKey=...` 연결 테스트
- [ ] `/debug/psis?psisApiKey=...&pestiBrandName=살비왕`로 VPS에서 PSIS 원본 API 연결 확인
- [ ] API 키가 로그에 남지 않는지 확인


## 8. PSIS 연결 진단

사용자 PC 브라우저에서는 PSIS URL이 열리는데 VPS의 MCP 서버에서 `fetch failed`가 나면, 먼저 VPS에서 직접 확인합니다.

```bash
curl -v "http://psis.rda.go.kr/openApi/service.do?apiKey=REDACTED&serviceCode=SVC01&serviceType=AA001&pestiBrandName=%EC%82%B4%EB%B9%84%EC%99%95"
```

MCP 서버 자체 진단 endpoint도 제공합니다.

```text
https://your-domain.example/debug/psis?psisApiKey=사용자발급키&pestiBrandName=살비왕
```

Node fetch만 실패하고 curl은 성공한다면 `.env`에 아래를 추가한 뒤 MCP 서버를 재시작합니다.

```env
PSIS_HTTP_CLIENT=node
```

DNS 오류(`EAI_AGAIN`, `ENOTFOUND`)가 나오면 VPS의 DNS resolver, 방화벽, 호스팅 provider outbound 정책을 먼저 확인하세요.
