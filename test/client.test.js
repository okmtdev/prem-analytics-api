import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { ApiError, PremAnalyticsClient } from "../src/client.js";
import { loadDotEnv, normalizeSeason, parseCliArgs } from "../src/cli.js";

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: url.toString(), headers: init.headers });
    const { status = 200, body = [], headers = {} } = handler(url.toString(), calls.length);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "x-monthly-limit": "300", "x-monthly-used": String(calls.length), "x-monthly-remaining": String(300 - calls.length), ...headers },
    });
  };
  fn.calls = calls;
  return fn;
}

test("sends the X-API-Key header and builds query strings", async () => {
  const fetchImpl = fakeFetch(() => ({ body: [{ squad: "Arsenal" }] }));
  const client = new PremAnalyticsClient({ apiKey: "pak_test", fetchImpl });
  const rows = await client.players("standard-stats", { season: "25/26", club: "Arsenal" });
  assert.deepEqual(rows, [{ squad: "Arsenal" }]);
  assert.equal(fetchImpl.calls[0].headers["X-API-Key"], "pak_test");
  assert.equal(fetchImpl.calls[0].url, "https://premie-backend-lvuzwxd3aq-uc.a.run.app/v1/team/standard-stats?season=25%2F26&club=Arsenal");
  assert.deepEqual(client.quota, { limit: 300, used: 1, remaining: 299 });
});

test("retries once on 429 using Retry-After", async () => {
  const fetchImpl = fakeFetch((_url, n) => (n === 1 ? { status: 429, body: {}, headers: { "retry-after": "0" } } : { body: [1] }));
  const client = new PremAnalyticsClient({ apiKey: "k", fetchImpl });
  assert.deepEqual(await client.leagueTable(), [1]);
  assert.equal(fetchImpl.calls.length, 2);
});

test("maps error statuses to ApiError", async () => {
  const fetchImpl = fakeFetch(() => ({ status: 401, body: { detail: "nope" } }));
  const client = new PremAnalyticsClient({ apiKey: "bad", fetchImpl });
  await assert.rejects(() => client.leagueTable(), (err) => err instanceof ApiError && err.status === 401);
});

test("caches responses on disk and serves them in offline mode", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prem-cache-"));
  try {
    const fetchImpl = fakeFetch(() => ({ body: [{ rk: 1 }] }));
    const online = new PremAnalyticsClient({ apiKey: "k", fetchImpl, cacheDir: dir });
    await online.leagueTable("25/26");
    await online.leagueTable("25/26");
    assert.equal(fetchImpl.calls.length, 1, "second call served from cache");
    assert.equal(online.stats.cacheHits, 1);

    const offline = new PremAnalyticsClient({ apiKey: "", offline: true, cacheDir: dir, fetchImpl });
    assert.deepEqual(await offline.leagueTable("25/26"), [{ rk: 1 }]);
    await assert.rejects(() => offline.leagueTable("24/25"), /offline mode/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("normalizeSeason accepts common spellings", () => {
  assert.equal(normalizeSeason("25/26"), "25/26");
  assert.equal(normalizeSeason("2025/26"), "25/26");
  assert.equal(normalizeSeason("2025-2026"), "25/26");
  assert.equal(normalizeSeason("abc"), null);
  assert.equal(normalizeSeason(undefined), undefined);
});

test("parseCliArgs understands --no-cache / --no-reports", () => {
  const args = parseCliArgs(["--no-cache", "--no-reports", "-l", "en", "--club", "Arsenal"]);
  assert.equal(args.cache, false);
  assert.equal(args.reports, false);
  assert.equal(args.lang, "en");
  assert.equal(args.club, "Arsenal");
});

test("loadDotEnv reads KEY=VALUE without overriding existing env", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prem-env-"));
  try {
    const file = path.join(dir, ".env");
    await import("node:fs/promises").then((fs) => fs.writeFile(file, "# comment\nPREM_TEST_A=\"quoted value\"\nexport PREM_TEST_B=plain\n"));
    process.env.PREM_TEST_B = "already";
    assert.equal(await loadDotEnv(file), true);
    assert.equal(process.env.PREM_TEST_A, "quoted value");
    assert.equal(process.env.PREM_TEST_B, "already");
    assert.equal(await loadDotEnv(path.join(dir, "missing")), false);
  } finally {
    delete process.env.PREM_TEST_A;
    delete process.env.PREM_TEST_B;
    await rm(dir, { recursive: true, force: true });
  }
});
