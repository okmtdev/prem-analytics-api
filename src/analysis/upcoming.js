// Next gameweek preview + latest AI post-match reports (titles/excerpts only).

import { indexBy, num, parseForm, sortBy } from "../util.js";

export function analyzeUpcoming(data) {
  const table = indexBy(data.leagueTable, "squad");
  const upcoming = data.schedules.filter((s) => num(s.gameweek) !== null);
  if (!upcoming.length) return { gameweek: null, matches: [], pickOfTheRound: null, sixPointers: [] };
  const nextGw = Math.min(...upcoming.map((s) => s.gameweek));
  const matches = upcoming
    .filter((s) => s.gameweek === nextGw)
    .map((s) => {
      const h = table.get(s.home_team);
      const a = table.get(s.away_team);
      return {
        gameweek: s.gameweek,
        date: s.date,
        time: s.time,
        home: s.home_team,
        away: s.away_team,
        venue: s.venue,
        homeRank: h?.rk ?? null,
        awayRank: a?.rk ?? null,
        homeForm: h?.last_5 ?? null,
        awayForm: a?.last_5 ?? null,
        homeFormPts: parseForm(h?.last_5).pts,
        awayFormPts: parseForm(a?.last_5).pts,
        rankSum: (h?.rk ?? 20) + (a?.rk ?? 20),
        rankGap: h?.rk !== undefined && a?.rk !== undefined ? Math.abs(h.rk - a.rk) : null,
      };
    });
  const sorted = sortBy(matches, "rankSum", "asc");
  return {
    gameweek: nextGw,
    matches: [...matches].sort((p, q) => `${p.date} ${p.time}`.localeCompare(`${q.date} ${q.time}`)),
    pickOfTheRound: sorted[0] ?? null,
    // Neighbours in the table (gap <= 2 places) facing each other.
    sixPointers: matches.filter((m) => m.rankGap !== null && m.rankGap <= 2 && m !== sorted[0]),
  };
}

export function latestReports(data) {
  return (data.postmatchReports ?? []).map((r) => ({
    matchId: r.match_id,
    date: r.match_date,
    gameweek: r.gameweek,
    fixture: `${r.home_team} ${r.home_score ?? "?"}-${r.away_score ?? "?"} ${r.away_team}`,
    titleJa: r.llm_analysis?.match_summary?.title_ja ?? null,
    titleEn: r.llm_analysis?.match_summary?.title_en ?? null,
    excerptJa: r.excerpt_ja ?? null,
    excerptEn: r.excerpt_en ?? null,
    highlightJa: r.highlight_url_ja ?? null,
    highlightEn: r.highlight_url_en ?? null,
    url: r.slug ? `https://premianalytics.com/ja/reports/${r.slug}` : null,
  }));
}
