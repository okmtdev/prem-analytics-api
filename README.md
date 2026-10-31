# prem-analytics-api

[PremAnalytics](https://premianalytics.com) の Web API を使って、プレミアリーグの統計データから
**インサイトレポート（Markdown / JSON）を自動生成する CLI のサンプルコード**です。

依存パッケージなし・Node.js だけで動きます。API キーを `.env` に書いて 1 コマンド実行するだけで、
`reports/` 配下に日本語（または英語）のレポートが出力されます。

- 生成例（日本語）: [reports/premier-league-report-26-27-2026-10-31.md](reports/premier-league-report-26-27-2026-10-31.md)
- 生成例（英語 + Arsenal 特集）: [reports/premier-league-report-26-27-2026-10-31-en-arsenal.md](reports/premier-league-report-26-27-2026-10-31-en-arsenal.md)

> English quick start is at the bottom of this page.

## レポートに含まれるインサイト

| セクション | 内容 |
| --- | --- |
| エグゼクティブサマリー | 首位争い・好調/不調クラブ・得点傾向・得点王・逆転劇・「幸運度」を箇条書きで要約 |
| 順位表 | 勝点/試合、直近5試合のフォーム、チーム得点王付きの順位表 |
| 優勝争い・残留争い・勢い | 首位との差、CL 圏ボーダー、残留ライン、フォームと順位の乖離（上昇気流 / 失速中）、得失点差から見た期待勝点との差 |
| ホーム / アウェイ | リーグ全体のホーム勝率、ホーム最強 / アウェイ最強、要塞型 / 旅人型クラブ |
| 攻撃 | 得点、シュート数、枠内率、決定率（効率的 / 非効率）、PK 依存度、平均年齢 |
| 守備 | 失点、被シュート、セーブ率、クリーンシート、シュート抑止力、GK 頼み度 |
| ゴールキーパー | セーブ率、クリーンシート、失点/90、最も忙しい GK |
| ポゼッションと結果 | 支配率と勝点の相関、カウンター型 / 持たされ型クラブ、「支配率で上回った側の勝率」 |
| 選手 | 得点・アシスト・G+A・90分あたり、決定力、出場中の得失点差（+/-）、スーパーサブ、フル出場、U-21 主力、ベテラン、被ファウル、カード、タックル、国籍の内訳 |
| 試合の傾向 | 大勝 / 多得点試合、よく出るスコア、節ごとの得点、ゴールの時間帯、終盤の決勝点 / 同点弾、逆転劇、観客動員 |
| 規律とレフェリー | カード・ファウルのクラブ別集計、主審別のカード数 / PK 判定 |
| 次節の見どころ | 次節の全カードと両チームの順位・フォーム、注目カード、直接対決 |
| 最新の AI 試合レポート | PremAnalytics が公開している試合レポートのタイトル・抜粋・ハイライト動画リンク |
| クラブ特集（任意） | `--club` で指定したクラブのリーグ内順位（各指標）、選手、全結果、今後の日程 |

## 必要なもの

- Node.js 20 以上（`node --version` で確認）
- PremAnalytics の API キー（`pak_...` 形式）
  - [premianalytics.com](https://premianalytics.com) にログイン → **Settings > Web API** で発行できます
  - API キーは Data Supporter / Data Ultras プランで利用できます（Data Fan は不可）

## セットアップと実行

```bash
git clone <this repository>
cd prem-analytics-api

# API キーを .env に設定（.env は git 管理外です）
cp .env.example .env
#   -> エディタで PREM_API_KEY=pak_xxxx を自分のキーに書き換える

# レポートを生成（今シーズン・日本語・Markdown + JSON）
npm run report
#   -> reports/premier-league-report-<season>-<date>.md / .json
```

`npm install` は不要です（依存パッケージがありません）。

### よく使うオプション

```bash
node bin/prem-report.js --lang en                  # 英語レポート
node bin/prem-report.js --club "Arsenal"           # クラブ特集セクションを追加
node bin/prem-report.js --season 25/26             # 過去シーズン
node bin/prem-report.js --format md                # Markdown のみ
node bin/prem-report.js --stdout --format md       # 標準出力にも表示
node bin/prem-report.js --api-key pak_xxx          # .env を使わずキーを直接指定
node bin/prem-report.js --offline --lang en        # キャッシュだけで再生成（API 消費ゼロ）
node bin/prem-report.js --help                     # 全オプション
```

| オプション | 説明 |
| --- | --- |
| `-k, --api-key <key>` | API キー。省略時は環境変数 `PREM_API_KEY`（`.env` から自動読込） |
| `-s, --season <yy/yy>` | シーズン。例 `25/26`。省略時は今シーズン |
| `-l, --lang <ja\|en>` | レポートの言語（既定 `ja`。環境変数 `PREM_REPORT_LANG` でも指定可） |
| `-c, --club <name>` | クラブ特集を追加。部分一致可（例 `arsenal`） |
| `-o, --out <dir>` | 出力先ディレクトリ（既定 `reports`） |
| `-f, --format <list>` | `md,json` から選択（既定は両方） |
| `--name <basename>` | 出力ファイル名（拡張子なし） |
| `--stdout` | Markdown を標準出力にも書き出す |
| `--no-reports` | AI 試合レポートの取得をスキップ（リクエストを 1 回節約） |
| `--no-cache` | キャッシュを無視して必ず API を呼ぶ |
| `--offline` | API を呼ばずキャッシュだけで生成 |
| `--cache-dir <dir>` / `--cache-ttl <h>` | キャッシュ先（既定 `.cache`）と有効時間（既定 6 時間） |
| `-v, --verbose` | 各リクエストをログ出力 |

## API 利用量について

- フルレポート 1 回の生成で **16 リクエスト**（AI レポート込みで 17）を消費します。
- レスポンスは `.cache/` にディスクキャッシュされ（既定 6 時間）、同じデータで `--lang` や `--club` を変えて
  再生成してもリクエストは消費されません。
- 実行後に `quota: 24/300 used this month` のように月間クォータの残量が表示されます。
- Data Supporter プランは **月 300 リクエスト**なので、1 日 1 回程度の生成が目安です。
- 429（レート制限）が返った場合は `Retry-After` に従って自動で再試行します。

## リポジトリ構成

```
bin/prem-report.js        CLI エントリポイント
src/cli.js                引数の解釈・.env 読込・実行フロー
src/client.js             PremAnalytics API クライアント（X-API-Key、429 リトライ、ディスクキャッシュ、クォータ表示）
src/data.js               レポートに必要なデータセットの取得（どのエンドポイントを何回叩くか）
src/analysis/             統計データからインサイトを計算する純粋関数群
  table.js                順位表・優勝/残留争い・フォーム・期待勝点、ホーム/アウェイ
  teams.js                攻撃・守備・GK・ポゼッション
  players.js              選手ランキング・スーパーサブ・国籍
  matches.js              試合結果・時間帯・逆転劇・観客・規律・レフェリー
  upcoming.js             次節プレビュー・AI レポート
  club.js                 クラブ特集
src/render/markdown.js    インサイト → Markdown
src/i18n.js               日本語 / 英語の文言
test/                     ユニットテスト（node --test、実データ由来のフィクスチャ）
reports/                  生成されたレポートの出力先
```

### 利用している API エンドポイント

| エンドポイント | 用途 |
| --- | --- |
| `GET /league-table/overall`, `/league-table/home-away` | 順位表、ホーム / アウェイ |
| `GET /squad/standard-stats`, `/squad/shooting`, `/squad/goalkeeping`, `/squad/misc-stats` | クラブ別の攻撃・守備・規律 |
| `GET /opponent/shooting` | 被シュート |
| `GET /team/standard-stats`, `/team/shooting`, `/team/playing-time`, `/team/misc-stats`, `/team/goalkeeper-stats` | 選手別スタッツ |
| `GET /matches/fixtures`, `/matches/schedules`, `/matches/team-stats`, `/matches/events` | 結果、日程、試合別スタッツ、ゴール / カード / 交代イベント |
| `GET /reports/postmatch` | AI 試合レポート |

API 全体の仕様は [PremAnalytics Web API ページ](https://premianalytics.com/ja/api/) と
Swagger ドキュメント（`https://premie-backend-lvuzwxd3aq-uc.a.run.app/v1/docs`）を参照してください。

## 自分でインサイトを追加するには

1. `src/analysis/` に関数を追加し、`src/analysis/index.js` の `analyze()` の戻り値に含める
2. `src/i18n.js` に日本語 / 英語の文言を追加する
3. `src/render/markdown.js` でセクションを描画する
4. `node --test` でテストを実行する（`test/fixtures/season-sample.json` は実 API レスポンスの抜粋）

新しいエンドポイントが必要な場合は `src/client.js` にラッパーを追加し、`src/data.js` の `loadSeasonData()` で取得してください。

## 開発

```bash
npm test                    # ユニットテスト
node bin/prem-report.js -v  # リクエストログ付きで実行
```

## 注意事項

- **API キーは絶対にコミットしないでください。** `.env` と `.cache/` は `.gitignore` 済みです。
- 「期待勝点」「幸運度」「スーパーサブ」「GK 頼み度」などは本レポート独自の簡易指標です。
- xG などデータ提供のないフィールドは API 上 `null` のため、レポートには含めていません。
- クラブ名・選手名は API の英語表記のまま出力します。

## License

MIT

---

## English quick start

A dependency-free Node.js CLI that turns [PremAnalytics](https://premianalytics.com) Web API data into a
Premier League insights report (Markdown + JSON). Sample output: [reports/](reports/).

```bash
cp .env.example .env            # paste your PremAnalytics API key (Settings > Web API)
node bin/prem-report.js --lang en --club "Arsenal"
```

Requires Node.js 20+. A full report costs 16 API requests (17 with AI reports); responses are cached in `.cache/`
so re-rendering with other options is free. See `node bin/prem-report.js --help` for all options.
