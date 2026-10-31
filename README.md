# prem-analytics-api

A dependency-free Node.js CLI that turns Premier League data from the
[PremAnalytics](https://premianalytics.com) Web API into an **insights report**
(Markdown + JSON), in English or Japanese.

Paste your API key into `.env`, run one command, and a report like the ones
below lands in `reports/`.

- Sample report (English, with an Arsenal deep dive): [reports/premier-league-report-26-27-2026-10-31-en-arsenal.md](reports/premier-league-report-26-27-2026-10-31-en-arsenal.md)
- Sample report (Japanese): [reports/premier-league-report-26-27-2026-10-31.md](reports/premier-league-report-26-27-2026-10-31.md)

The code is meant to be read as much as run: it shows how to authenticate,
respect the monthly quota, cache responses, and derive insights from the raw
endpoints. Fork it and add your own.

## What is in the report

| Section | Insights |
| --- | --- |
| Executive summary | Title race, form teams, scoring trends, top scorer, comebacks, "luck index" in a few bullets |
| League table | Full table with points per game, last-five form and each club's top scorer |
| Title race, relegation and momentum | Gap at the top, top-four line, gap to safety, form vs position (risers / fallers), expected points from goal difference |
| Home and away | League-wide home win rate, best home / away sides, fortresses and road warriors |
| Attack | Goals, shots, accuracy, conversion (clinical / wasteful), penalty reliance, squad age |
| Defence | Goals conceded, shots faced, save rate, clean sheets, shot suppression, keeper reliance |
| Goalkeepers | Save percentage, clean sheets, goals against per 90, busiest keepers |
| Possession and results | Correlation between possession and points, counter-punchers vs sterile domination, how often the side with more possession wins |
| Players | Scorers, assists, G+A, per-90 rates, finishing, on-pitch goal difference, super-subs, ever-presents, U-21 regulars, veterans, fouls, cards, tackles, nationalities |
| Match trends | Biggest wins, highest-scoring games, common scorelines, goals by matchweek, goal timing, late winners, comebacks, attendance |
| Discipline and referees | Cards and fouls per club, cards and penalties per referee |
| Next up | Every fixture of the next matchweek with rank and form, pick of the round, six-pointers |
| Latest AI post-match reports | Titles, excerpts and highlight links of PremAnalytics' published reports |
| Club focus (optional) | `--club` adds league ranks for every metric, players, all results and upcoming fixtures for one club |

## Requirements

- Node.js 20 or newer (`node --version`)
- A PremAnalytics API key (`pak_...`)
  - Sign in at [premianalytics.com](https://premianalytics.com) and open **Settings > Web API**
  - Keys are available on the Data Supporter and Data Ultras plans (not on Data Fan)

## Quick start

```bash
git clone https://github.com/okmtdev/prem-analytics-api.git
cd prem-analytics-api

cp .env.example .env
# edit .env and set PREM_API_KEY=pak_... to your own key (.env is git-ignored)

node bin/prem-report.js --lang en
# -> reports/premier-league-report-<season>-<date>-en.md and .json
```

No `npm install` is needed: the project has no dependencies.

### Common options

```bash
node bin/prem-report.js --lang en --club "Arsenal"   # English report plus a club deep dive
node bin/prem-report.js                              # Japanese report (default language)
node bin/prem-report.js --season 25/26               # a past season
node bin/prem-report.js --format md --stdout         # Markdown only, also printed to stdout
node bin/prem-report.js --api-key pak_xxx            # pass the key directly instead of .env
node bin/prem-report.js --offline --lang ja          # re-render from the local cache, zero API calls
node bin/prem-report.js --help                       # all options
```

| Option | Description |
| --- | --- |
| `-k, --api-key <key>` | API key. Defaults to `PREM_API_KEY` (loaded from `.env`) |
| `-s, --season <yy/yy>` | Season, e.g. `25/26`. Defaults to the current season |
| `-l, --lang <ja\|en>` | Report language (default `ja`; `PREM_REPORT_LANG` also works) |
| `-c, --club <name>` | Add a club-focus section. Partial names work (`arsenal`) |
| `-o, --out <dir>` | Output directory (default `reports`) |
| `-f, --format <list>` | `md`, `json` or both (default both) |
| `--name <basename>` | Output file name without extension |
| `--stdout` | Also print the Markdown to stdout |
| `--no-reports` | Skip the AI post-match reports section (saves one request) |
| `--no-cache` | Ignore the cache and always call the API |
| `--offline` | Build the report from the cache only |
| `--cache-dir <dir>` / `--cache-ttl <h>` | Cache location (default `.cache`) and freshness (default 6 hours) |
| `-v, --verbose` | Log every request |

## API usage and quota

- A full report costs **16 requests** (17 with AI reports).
- Responses are cached on disk in `.cache/` (6 hours by default). Re-running with a different
  `--lang`, `--club` or `--format` costs nothing.
- The CLI prints the monthly quota after every run, e.g. `quota: 24/300 used this month`.
- The Data Supporter plan allows **300 requests per month**, so roughly one fresh report a day is the budget.
- On a 429 response the client waits for `Retry-After` and retries.

## Project layout

```
bin/prem-report.js        CLI entry point
src/cli.js                argument parsing, .env loading, run flow
src/client.js             PremAnalytics API client (X-API-Key, 429 retry, disk cache, quota headers)
src/data.js               which endpoints a report needs and how many times they are called
src/analysis/             pure functions that turn raw rows into insights
  table.js                table, title race, relegation, form, expected points, home/away
  teams.js                attack, defence, goalkeepers, possession
  players.js              player rankings, super-subs, nationalities
  matches.js              results, goal timing, comebacks, attendance, discipline, referees
  upcoming.js             next matchweek preview, AI reports
  club.js                 club focus
src/render/markdown.js    insights -> Markdown
src/i18n.js               English / Japanese strings
test/                     unit tests (node --test) on fixtures taken from real API responses
reports/                  generated reports
```

### Endpoints used

| Endpoint | Used for |
| --- | --- |
| `GET /league-table/overall`, `/league-table/home-away` | Table, home/away splits |
| `GET /squad/standard-stats`, `/squad/shooting`, `/squad/goalkeeping`, `/squad/misc-stats` | Club attack, defence, discipline |
| `GET /opponent/shooting` | Shots faced |
| `GET /team/standard-stats`, `/team/shooting`, `/team/playing-time`, `/team/misc-stats`, `/team/goalkeeper-stats` | Player stats |
| `GET /matches/fixtures`, `/matches/schedules`, `/matches/team-stats`, `/matches/events` | Results, schedule, per-match stats, goal / card / substitution events |
| `GET /reports/postmatch` | AI post-match reports |

The full API reference is on the [PremAnalytics Web API page](https://premianalytics.com/en/api/) and in the
Swagger docs at `https://premie-backend-lvuzwxd3aq-uc.a.run.app/v1/docs`.

## Adding your own insights

1. Add a function under `src/analysis/` and include its result in `analyze()` in `src/analysis/index.js`.
2. Add the English and Japanese labels to `src/i18n.js`.
3. Render the section in `src/render/markdown.js`.
4. Run `npm test`. `test/fixtures/season-sample.json` is a trimmed copy of real API responses, so you can develop without spending quota.

If you need another endpoint, add a wrapper to `src/client.js` and fetch it in `loadSeasonData()` in `src/data.js`.

## Development

```bash
npm test                    # unit tests
node bin/prem-report.js -v  # run with request logging
```

## Notes

- **Never commit your API key.** `.env` and `.cache/` are git-ignored.
- "Expected points", "luck index", "super-sub" and "keeper reliance" are simple metrics defined in this report, not official statistics.
- Fields the API does not currently populate (for example xG) are `null` upstream and are therefore not shown.
- Club and player names are printed as returned by the API.
- Data in the sample reports belongs to [PremAnalytics](https://premianalytics.com); this project is an independent sample client and is not affiliated with them.

## License

MIT. See [LICENSE](LICENSE).

---

## 日本語

[PremAnalytics](https://premianalytics.com) の Web API からプレミアリーグのインサイトレポート（Markdown / JSON）を生成する、依存パッケージなしの Node.js CLI です。

```bash
cp .env.example .env        # PREM_API_KEY=pak_... を自分のキーに書き換える（.env は git 管理外）
node bin/prem-report.js     # 日本語レポートを reports/ に出力
node bin/prem-report.js --lang en --club "Arsenal"   # 英語 + クラブ特集
```

Node.js 20 以上が必要です。フルレポート 1 回で API を 16 リクエスト（AI レポート込みで 17）消費し、レスポンスは `.cache/` にキャッシュされます。オプション一覧は `node bin/prem-report.js --help` を参照してください。生成例は [reports/](reports/) にあります。
