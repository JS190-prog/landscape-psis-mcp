import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { config, parseTrustProxy } from "../src/config.js";
import { rateLimitMiddleware } from "../src/rateLimit.js";

function requestFrom(app, peer, forwarded) {
  // Inherit the real Express getters, including the trust-proxy-aware req.ip.
  const req = Object.create(app.request);
  req.app = app;
  req.socket = { remoteAddress: peer };
  req.headers = { "x-forwarded-for": forwarded };
  req.url = "/mcp";
  return req;
}

function checkRateLimit(req) {
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  let allowed = false;
  rateLimitMiddleware(req, response, () => { allowed = true; });
  return { ...response, allowed };
}

function enableOneRequestLimit(t) {
  const original = { ...config.rateLimit };
  Object.assign(config.rateLimit, { enabled: true, windowMs: 60000, maxPerIp: 1 });
  t.after(() => Object.assign(config.rateLimit, original));
  t.mock.method(Date, "now", () => 120000);
}

test("trust proxy configuration defaults to loopback and accepts explicit IP/CIDR lists", () => {
  assert.deepEqual(parseTrustProxy(), ["loopback"]);
  assert.deepEqual(parseTrustProxy(" "), ["loopback"]);
  assert.equal(parseTrustProxy(" false "), false);
  assert.deepEqual(parseTrustProxy("127.0.0.1, ::1, 10.0.0.0/8, 2001:db8::/64"), [
    "127.0.0.1", "::1", "10.0.0.0/8", "2001:db8::/64"
  ]);
  for (const value of ["true", "1", "2", "proxy.invalid", "10.0.0.0/33", "::1/129", "127.0.0.1,"]) {
    assert.throws(() => parseTrustProxy(value), /TRUST_PROXY/);
  }
});

test("untrusted peers cannot rotate IP buckets by changing X-Forwarded-For", (t) => {
  enableOneRequestLimit(t);
  const app = express();
  app.set("trust proxy", parseTrustProxy());
  const first = requestFrom(app, "203.0.113.10", "192.0.2.101");
  const second = requestFrom(app, "203.0.113.10", "192.0.2.102");
  assert.equal(first.ip, "203.0.113.10");
  assert.equal(second.ip, first.ip);
  assert.equal(checkRateLimit(first).allowed, true);
  const rejected = checkRateLimit(second);
  assert.equal(rejected.statusCode, 429);
  assert.equal(rejected.body.code, "RATE_LIMIT_IP");
});

test("trusted loopback proxies use the appended client boundary and ignore spoofed prefixes", (t) => {
  enableOneRequestLimit(t);
  const app = express();
  app.set("trust proxy", parseTrustProxy());
  const first = requestFrom(app, "127.0.0.1", "192.0.2.201, 203.0.113.20");
  const second = requestFrom(app, "127.0.0.1", "192.0.2.202, 203.0.113.20");
  assert.equal(first.ip, "203.0.113.20");
  assert.equal(second.ip, first.ip);
  assert.equal(checkRateLimit(first).allowed, true);
  assert.equal(checkRateLimit(second).statusCode, 429);
  const anotherClient = requestFrom(app, "127.0.0.1", "203.0.113.21");
  assert.equal(anotherClient.ip, "203.0.113.21");
  assert.equal(checkRateLimit(anotherClient).allowed, true);
});

test("false ignores forwarding headers even for loopback peers", (t) => {
  enableOneRequestLimit(t);
  const app = express();
  app.set("trust proxy", parseTrustProxy("false"));
  const first = requestFrom(app, "127.0.0.1", "192.0.2.210");
  const second = requestFrom(app, "127.0.0.1", "192.0.2.211");
  assert.equal(first.ip, "127.0.0.1");
  assert.equal(second.ip, first.ip);
  assert.equal(checkRateLimit(first).allowed, true);
  assert.equal(checkRateLimit(second).statusCode, 429);
});

test("explicit CIDR allowlists support remote reverse proxies", () => {
  const app = express();
  app.set("trust proxy", parseTrustProxy("10.12.0.0/16"));
  const trusted = requestFrom(app, "10.12.0.2", "198.51.100.8");
  const untrusted = requestFrom(app, "10.13.0.2", "198.51.100.9");
  assert.equal(trusted.ip, "198.51.100.8");
  assert.equal(untrusted.ip, "10.13.0.2");
});
