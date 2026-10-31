// Minimal PremAnalytics Web API client built on the global `fetch` (Node 18+).
//
// - Authentication: `X-API-Key` header.
// - Quota headers (`X-Monthly-Limit/Used/Remaining`) are captured on every call.
// - 429 responses are retried after `Retry-After` seconds (bounded).
// - Responses can be cached on disk to avoid burning the monthly quota while iterating.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_BASE_URL = "https://premie-backend-lvuzwxd3aq-uc.a.run.app/v1";

export class ApiError extends Error {
  constructor(message, { status, url, body } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

function describeStatus(status) {
  switch (status) {
    case 401:
      return "Missing or invalid API key (401). Check PREM_API_KEY / --api-key.";
    case 403:
      return "API access not allowed for this plan, or the key is suspended (403).";
    case 404:
      return "No data for the requested id/season (404).";
    case 429:
      return "Rate limit or monthly quota exceeded (429).";
    default:
      return `Unexpected HTTP status ${status}.`;
  }
}

export class PremAnalyticsClient {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey
   * @param {string} [opts.baseUrl]
   * @param {string|null} [opts.cacheDir]   directory for cached responses; null disables caching
   * @param {number} [opts.cacheTtlMs]      how long a cached response stays fresh
   * @param {boolean} [opts.offline]        only serve from cache, never hit the network
   * @param {(msg: string) => void} [opts.log]
   * @param {typeof fetch} [opts.fetchImpl] injectable for tests
   */
  constructor({
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    cacheDir = null,
    cacheTtlMs = 6 * 60 * 60 * 1000,
    offline = false,
    log = () => {},
    fetchImpl = globalThis.fetch,
    maxRetries = 3,
  }) {
    if (!apiKey && !offline) throw new Error("apiKey is required");
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.cacheDir = cacheDir;
    this.cacheTtlMs = cacheTtlMs;
    this.offline = offline;
    this.log = log;
    this.fetchImpl = fetchImpl;
    this.maxRetries = maxRetries;
    /** Last seen quota headers. */
    this.quota = { limit: null, used: null, remaining: null };
    this.stats = { requests: 0, cacheHits: 0 };
  }

  buildUrl(endpoint, params = {}) {
    const url = new URL(`${this.baseUrl}/${endpoint.replace(/^\/+/, "")}`);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
    return url;
  }

  cachePath(url) {
    const key = createHash("sha1").update(url.toString()).digest("hex").slice(0, 16);
    const name = url.pathname.replace(/^\/v\d+\//, "").replace(/[^a-z0-9]+/gi, "_");
    return path.join(this.cacheDir, `${name}_${key}.json`);
  }

  async readCache(url) {
    if (!this.cacheDir) return null;
    try {
      const raw = await readFile(this.cachePath(url), "utf8");
      const entry = JSON.parse(raw);
      const age = Date.now() - (entry.fetchedAt ?? 0);
      if (!this.offline && age > this.cacheTtlMs) return null;
      return entry;
    } catch {
      return null;
    }
  }

  async writeCache(url, data) {
    if (!this.cacheDir) return;
    try {
      await mkdir(this.cacheDir, { recursive: true });
      await writeFile(
        this.cachePath(url),
        JSON.stringify({ url: url.toString(), fetchedAt: Date.now(), data }),
      );
    } catch (err) {
      this.log(`cache write failed: ${err.message}`);
    }
  }

  captureQuota(headers) {
    const g = (h) => {
      const v = headers.get(h);
      return v === null ? null : Number(v);
    };
    const limit = g("x-monthly-limit");
    if (limit !== null) {
      this.quota = { limit, used: g("x-monthly-used"), remaining: g("x-monthly-remaining") };
    }
  }

  /**
   * GET an endpoint and return parsed JSON.
   * @param {string} endpoint e.g. "league-table/overall"
   * @param {Record<string, string|number|boolean|undefined>} [params]
   */
  async get(endpoint, params = {}) {
    const url = this.buildUrl(endpoint, params);
    const cached = await this.readCache(url);
    if (cached) {
      this.stats.cacheHits += 1;
      this.log(`cache  ${url.pathname}${url.search}`);
      return cached.data;
    }
    if (this.offline) {
      throw new ApiError(`offline mode: no cached response for ${url.pathname}${url.search}`, { url: url.toString() });
    }

    for (let attempt = 0; ; attempt += 1) {
      this.log(`GET    ${url.pathname}${url.search}`);
      this.stats.requests += 1;
      const res = await this.fetchImpl(url, {
        headers: { "X-API-Key": this.apiKey, Accept: "application/json" },
      });
      this.captureQuota(res.headers);

      if (res.status === 429 && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
        const wait = Math.min(retryAfter, 60);
        this.log(`429 received, retrying in ${wait}s (${attempt + 1}/${this.maxRetries})`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new ApiError(`${describeStatus(res.status)} [${url.pathname}]`, {
          status: res.status,
          url: url.toString(),
          body,
        });
      }
      const data = await res.json();
      await this.writeCache(url, data);
      return data;
    }
  }

  // ---- Thin typed wrappers (season is optional everywhere) -----------------

  leagueTable(season) {
    return this.get("league-table/overall", { season });
  }
  leagueTableHomeAway(season) {
    return this.get("league-table/home-away", { season });
  }
  squad(kind, season) {
    return this.get(`squad/${kind}`, { season });
  }
  opponent(kind, season) {
    return this.get(`opponent/${kind}`, { season });
  }
  players(kind, { season, club } = {}) {
    return this.get(`team/${kind}`, { season, club });
  }
  fixtures({ season, gameweek, isPlayed } = {}) {
    return this.get("matches/fixtures", { season, gameweek, is_played: isPlayed });
  }
  schedules({ season, gameweek } = {}) {
    return this.get("matches/schedules", { season, gameweek });
  }
  matchTeamStats({ season, matchId } = {}) {
    return this.get("matches/team-stats", { season, match_id: matchId });
  }
  matchEvents({ season, matchId } = {}) {
    return this.get("matches/events", { season, match_id: matchId });
  }
  postmatchReports({ season, limit = 10, offset = 0 } = {}) {
    return this.get("reports/postmatch", { season, limit, offset });
  }
  prematchReports({ season, limit = 10, offset = 0 } = {}) {
    return this.get("reports/prematch", { season, limit, offset });
  }
  news({ limit = 10, offset = 0, tag } = {}) {
    return this.get("news", { limit, offset, tag });
  }
}
