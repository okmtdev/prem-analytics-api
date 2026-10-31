// League-table insights: title race, relegation zone, form, and the
// "goal-difference model" (points you would expect from your GD).

import { indexBy, linearFit, num, parseForm, pct, ratio, round, sortBy, top } from "../util.js";

export function analyzeTable(data) {
  const rows = sortBy(data.leagueTable, "rk", "asc").map((r) => ({
    rank: r.rk,
    squad: r.squad,
    played: r.mp,
    w: r.w,
    d: r.d,
    l: r.l,
    gf: r.gf,
    ga: r.ga,
    gd: r.gd,
    pts: r.pts,
    ptsPerMatch: r.pts_per_mp,
    form: r.last_5,
    formPts: parseForm(r.last_5).pts,
    topScorer: r.top_team_scorer,
    goalkeeper: r.goalkeeper,
    attendance: r.attendance,
  }));
  const n = rows.length;
  if (!n) return { rows, titleRace: null, relegation: [], gdModel: null, form: null };

  const leader = rows[0];
  const second = rows[1];
  const fourth = rows[3];
  const fifth = rows[4];
  const titleRace = {
    leader: leader.squad,
    leaderPts: leader.pts,
    gapToSecond: second ? leader.pts - second.pts : null,
    second: second?.squad ?? null,
    top4Cutoff: fourth && fifth ? { fourth: fourth.squad, fifth: fifth.squad, gap: fourth.pts - fifth.pts } : null,
    // Points the leader is on pace for over 38 matches.
    leaderPace38: leader.played ? round((leader.pts / leader.played) * 38, 1) : null,
  };

  const bottom3 = rows.slice(-3);
  const safeTeam = rows[n - 4];
  const relegation = bottom3.map((r) => ({
    ...r,
    gapToSafety: safeTeam ? safeTeam.pts - r.pts : null,
  }));

  // Expected points from goal difference (league-wide linear fit) ---------
  const fit = linearFit(
    rows.map((r) => r.gd),
    rows.map((r) => r.pts),
  );
  let gdModel = null;
  if (fit) {
    const withResidual = rows.map((r) => {
      const expected = round(fit.a + fit.b * (num(r.gd) ?? 0), 1);
      return { squad: r.squad, pts: r.pts, gd: r.gd, expectedPts: expected, diff: round(r.pts - expected, 1) };
    });
    gdModel = {
      slope: round(fit.b, 3),
      intercept: round(fit.a, 2),
      overPerformers: top(withResidual, "diff", 3),
      underPerformers: top(withResidual, "diff", 3, "asc"),
      all: withResidual,
    };
  }

  // Form (last 5) -----------------------------------------------------------
  const byForm = sortBy(rows, "formPts");
  const formRank = indexBy(byForm.map((r, i) => ({ squad: r.squad, formRank: i + 1 })), "squad");
  const movers = rows
    .map((r) => ({ squad: r.squad, rank: r.rank, form: r.form, formPts: r.formPts, formRank: formRank.get(r.squad).formRank, delta: r.rank - formRank.get(r.squad).formRank }))
    .filter((r) => r.form);
  const form = {
    hottest: byForm.slice(0, 3),
    coldest: byForm.slice(-3).reverse(),
    // Big positive delta = form far better than league position (risers).
    risers: top(movers, "delta", 3),
    fallers: top(movers, "delta", 3, "asc"),
  };

  const totals = {
    matches: rows.reduce((a, r) => a + (num(r.played) ?? 0), 0) / 2,
    goals: rows.reduce((a, r) => a + (num(r.gf) ?? 0), 0),
  };
  totals.goalsPerMatch = ratio(totals.goals, totals.matches);
  totals.winPct = pct(rows.reduce((a, r) => a + (num(r.w) ?? 0), 0), totals.matches * 2);

  return { rows, titleRace, relegation, gdModel, form, totals };
}

export function analyzeHomeAway(data) {
  const rows = data.homeAway.map((r) => ({
    squad: r.squad,
    homePlayed: r.home_mp,
    homePts: r.home_pts,
    homePpg: r.home_pts_per_mp,
    homeGf: r.home_gf,
    homeGa: r.home_ga,
    awayPlayed: r.away_mp,
    awayPts: r.away_pts,
    awayPpg: r.away_pts_per_mp,
    awayGf: r.away_gf,
    awayGa: r.away_ga,
    ppgGap: round((num(r.home_pts_per_mp) ?? 0) - (num(r.away_pts_per_mp) ?? 0), 2),
  }));

  const played = data.fixtures.filter((f) => f.is_played && f.home_score !== null && f.away_score !== null);
  const homeWins = played.filter((f) => f.home_score > f.away_score).length;
  const draws = played.filter((f) => f.home_score === f.away_score).length;
  const awayWins = played.length - homeWins - draws;
  const homeGoals = played.reduce((a, f) => a + f.home_score, 0);
  const awayGoals = played.reduce((a, f) => a + f.away_score, 0);

  return {
    rows,
    bestHome: top(rows, "homePpg", 3),
    bestAway: top(rows, "awayPpg", 3),
    fortresses: top(rows, "ppgGap", 3),
    roadWarriors: top(rows, "ppgGap", 3, "asc"),
    league: {
      matches: played.length,
      homeWinPct: pct(homeWins, played.length),
      drawPct: pct(draws, played.length),
      awayWinPct: pct(awayWins, played.length),
      homeGoalsPerMatch: ratio(homeGoals, played.length),
      awayGoalsPerMatch: ratio(awayGoals, played.length),
    },
  };
}
