// Command-line entry point: parse args, load .env, fetch data, analyse, write report.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { analyze } from "./analysis/index.js";
import { ApiError, DEFAULT_BASE_URL, PremAnalyticsClient } from "./client.js";
import { loadSeasonData } from "./data.js";
import { renderMarkdown } from "./render/markdown.js";
import { slug, todayISO } from "./util.js";

const HELP = `prem-report - Premier League insights report powered by the PremAnalytics API

Usage:
  prem-report [options]
  node bin/prem-report.js [options]

Options:
  -k, --api-key <key>     PremAnalytics API key (or PREM_API_KEY env / .env file)
  -s, --season <yy/yy>    Season, e.g. 25/26 (default: current season)
  -l, --lang <ja|en>      Report language (default: ja, or PREM_REPORT_LANG)
  -c, --club <name>       Add a deep-dive section for one club, e.g. "Arsenal"
  -o, --out <dir>         Output directory (default: reports, or PREM_REPORT_OUT_DIR)
  -f, --format <list>     Comma-separated: md,json (default: md,json)
      --name <basename>   Output file base name (default: premier-league-report-<season>-<date>)
      --stdout            Also print the Markdown report to stdout
      --no-reports        Skip the "latest AI post-match reports" section (saves 1 request)
      --no-cache          Ignore the local response cache and always call the API
      --offline           Build the report from the local cache only (no network)
      --cache-dir <dir>   Cache directory (default: .cache)
      --cache-ttl <h>     Cache freshness in hours (default: 6)
      --base-url <url>    Override the API base URL
  -v, --verbose           Log every request
  -h, --help              Show this help

A full report costs 16 API requests (17 with AI reports). Responses are cached
on disk, so re-running with different --lang/--club/--format is free.

Examples:
  prem-report                               # current season, Japanese, Markdown + JSON
  prem-report --lang en --club "Arsenal"    # English report with an Arsenal deep dive
  prem-report --season 25/26 --format md    # last season, Markdown only
  prem-report --offline --lang en           # re-render from cache without spending quota
`;

/** Load KEY=VALUE pairs from a .env file into process.env (without overriding). */
export async function loadDotEnv(file = ".env") {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return false;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
  return true;
}

export function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    allowNegative: true,
    options: {
      "api-key": { type: "string", short: "k" },
      season: { type: "string", short: "s" },
      lang: { type: "string", short: "l" },
      club: { type: "string", short: "c" },
      out: { type: "string", short: "o" },
      format: { type: "string", short: "f" },
      name: { type: "string" },
      stdout: { type: "boolean", default: false },
      reports: { type: "boolean", default: true },
      cache: { type: "boolean", default: true },
      offline: { type: "boolean", default: false },
      "cache-dir": { type: "string" },
      "cache-ttl": { type: "string" },
      "base-url": { type: "string" },
      verbose: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  return values;
}

export async function main(argv) {
  let args;
  try {
    args = parseCliArgs(argv);
  } catch (err) {
    console.error(err.message);
    console.error(HELP);
    return 2;
  }
  if (args.help) {
    console.log(HELP);
    return 0;
  }

  await loadDotEnv();

  const apiKey = args["api-key"] ?? process.env.PREM_API_KEY ?? "";
  const lang = (args.lang ?? process.env.PREM_REPORT_LANG ?? "ja").toLowerCase();
  if (!["ja", "en"].includes(lang)) {
    console.error(`Unsupported --lang "${lang}". Use ja or en.`);
    return 2;
  }
  const season = normalizeSeason(args.season);
  if (args.season && !season) {
    console.error(`Invalid --season "${args.season}". Use the form 25/26.`);
    return 2;
  }
  const formats = new Set((args.format ?? "md,json").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  for (const f of formats) {
    if (!["md", "json"].includes(f)) {
      console.error(`Unsupported --format "${f}". Use md and/or json.`);
      return 2;
    }
  }
  if (!apiKey && !args.offline) {
    console.error("No API key. Pass --api-key, set PREM_API_KEY, or create a .env file (see .env.example).");
    return 2;
  }

  const outDir = args.out ?? process.env.PREM_REPORT_OUT_DIR ?? "reports";
  const log = args.verbose ? (m) => console.error(`[prem-report] ${m}`) : () => {};
  const cacheTtlHours = Number(args["cache-ttl"] ?? 6);

  const client = new PremAnalyticsClient({
    apiKey,
    baseUrl: args["base-url"] ?? process.env.PREM_API_BASE_URL ?? DEFAULT_BASE_URL,
    cacheDir: args.cache || args.offline ? args["cache-dir"] ?? ".cache" : null,
    cacheTtlMs: (Number.isFinite(cacheTtlHours) ? cacheTtlHours : 6) * 60 * 60 * 1000,
    offline: args.offline,
    log,
  });

  console.error(`Fetching PremAnalytics data${season ? ` for season ${season}` : " for the current season"}...`);
  let data;
  try {
    data = await loadSeasonData(client, { season, includeReports: args.reports });
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(`API request failed: ${err.message}`);
      if (err.status === 404 && season) console.error("Hint: check the season format (e.g. 25/26) and that data exists for it.");
      return 1;
    }
    throw err;
  }

  const insights = analyze(data, { club: args.club ?? null });
  if (insights.club?.notFound) {
    console.error(`Club "${insights.club.notFound}" not found. Known clubs: ${insights.club.candidates.join(", ")}`);
    return 2;
  }

  const baseName = args.name ?? `premier-league-report-${slug(insights.meta.season ?? "season")}-${todayISO()}${lang === "en" ? "-en" : ""}${insights.club ? `-${slug(insights.club.squad)}` : ""}`;
  await mkdir(outDir, { recursive: true });
  const written = [];
  if (formats.has("md")) {
    const md = renderMarkdown(insights, { lang });
    const file = path.join(outDir, `${baseName}.md`);
    await writeFile(file, md, "utf8");
    written.push(file);
    if (args.stdout) process.stdout.write(md);
  }
  if (formats.has("json")) {
    const file = path.join(outDir, `${baseName}.json`);
    await writeFile(file, JSON.stringify(insights, null, 2), "utf8");
    written.push(file);
  }

  const q = client.quota;
  const quotaMsg = q.limit !== null ? ` | quota: ${q.used}/${q.limit} used this month (${q.remaining} left)` : "";
  console.error(`Done. API requests: ${client.stats.requests}, cache hits: ${client.stats.cacheHits}${quotaMsg}`);
  for (const f of written) console.error(`  -> ${f}`);
  return 0;
}

/** Accept "25/26", "2025/26", "25-26", "2025-2026" and normalise to "25/26". */
export function normalizeSeason(s) {
  if (!s) return undefined;
  const m = String(s).trim().match(/^(\d{2}|\d{4})[/-](\d{2}|\d{4})$/);
  if (!m) return null;
  const a = m[1].slice(-2);
  const b = m[2].slice(-2);
  return `${a}/${b}`;
}
