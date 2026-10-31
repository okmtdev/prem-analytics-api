// Team-level attack / defence / goalkeeping / possession insights.

import { cleanSquad, indexBy, num, pct, pearson, ratio, round, sortBy, top } from "../util.js";

function tableIndex(data) {
  return indexBy(data.leagueTable, "squad");
}

export function analyzeAttack(data) {
  const shooting = indexBy(data.squadShooting, "squad");
  const table = tableIndex(data);
  const rows = data.squadStandard.map((s) => {
    const sh = shooting.get(s.squad) ?? {};
    // Official goals (league table GF) include own goals scored by opponents;
    // the squad stats only count goals credited to the club's own players.
    const playerGoals = num(s.performance_gls) ?? 0;
    const gls = num(table.get(s.squad)?.gf) ?? playerGoals;
    return {
      squad: s.squad,
      rank: table.get(s.squad)?.rk ?? null,
      goals: gls,
      playerGoals,
      ownGoalsFor: gls - playerGoals,
      assists: s.performance_ast,
      nonPenGoals: s.performance_g_minus_pk,
      pens: s.performance_pk,
      penAtt: s.performance_pkatt,
      penShare: pct(s.performance_pk, playerGoals),
      goalsPer90: s.per90_gls,
      shots: sh.standard_sh ?? null,
      shotsOnTarget: sh.standard_sot ?? null,
      sotPct: sh.standard_sot_pct ?? null,
      shotsPer90: sh.standard_sh_per_90 ?? null,
      goalsPerShot: sh.standard_g_per_sh ?? null,
      goalsPerSot: sh.standard_g_per_sot ?? null,
      shotsPerGoal: ratio(sh.standard_sh, playerGoals, 1),
      possession: s.poss,
      players: s.num_pl,
      avgAge: s.age,
    };
  });
  const enoughShots = rows.filter((r) => (r.shots ?? 0) >= 30);
  return {
    rows: sortBy(rows, "goals"),
    mostGoals: top(rows, "goals", 3),
    fewestGoals: top(rows, "goals", 3, "asc"),
    mostShots: top(rows, "shotsPer90", 3),
    clinical: top(enoughShots, "goalsPerShot", 3),
    wasteful: top(enoughShots, "goalsPerShot", 3, "asc"),
    bestAccuracy: top(enoughShots, "sotPct", 3),
    penaltyReliant: top(rows.filter((r) => (r.pens ?? 0) > 0), "penShare", 3),
    oldest: top(rows, "avgAge", 3),
    youngest: top(rows, "avgAge", 3, "asc"),
  };
}

export function analyzeDefence(data) {
  const table = tableIndex(data);
  const faced = indexBy(data.opponentShooting.map((r) => ({ ...r, squad: cleanSquad(r.squad) })), "squad");
  const gk = indexBy(data.squadGoalkeeping, "squad");
  const rows = data.leagueTable.map((t) => {
    const f = faced.get(t.squad) ?? {};
    const g = gk.get(t.squad) ?? {};
    return {
      squad: t.squad,
      rank: t.rk,
      conceded: t.ga,
      concededPer90: g.performance_ga90 ?? ratio(t.ga, t.mp),
      shotsFaced: f.standard_sh ?? null,
      shotsFacedPer90: f.standard_sh_per_90 ?? null,
      sotFaced: f.standard_sot ?? null,
      sotFacedPer90: f.standard_sot_per_90 ?? null,
      concededPerShotFaced: f.standard_g_per_sh ?? null,
      savePct: g.performance_save_pct ?? null,
      saves: g.performance_saves ?? null,
      cleanSheets: g.performance_cs ?? null,
      cleanSheetPct: g.performance_cs_pct ?? null,
      pensFaced: g.pk_pkatt ?? null,
      pensSaved: g.pk_pksv ?? null,
    };
  });
  return {
    rows: sortBy(rows, "conceded", "asc"),
    meanest: top(rows, "conceded", 3, "asc"),
    leakiest: top(rows, "conceded", 3),
    shotSuppression: top(rows, "shotsFacedPer90", 3, "asc"),
    mostShotsFaced: top(rows, "shotsFacedPer90", 3),
    bestSavePct: top(rows, "savePct", 3),
    mostCleanSheets: top(rows, "cleanSheets", 3),
    // Teams that concede lots of shots but keep goals out thanks to the keeper.
    keeperReliant: top(
      rows.filter((r) => r.shotsFacedPer90 !== null && r.savePct !== null).map((r) => ({
        ...r,
        relianceScore: round((num(r.shotsFacedPer90) ?? 0) * ((num(r.savePct) ?? 0) / 100), 2),
      })),
      "relianceScore",
      3,
    ),
  };
}

export function analyzeGoalkeepers(data, { minMinutes = 270 } = {}) {
  const rows = data.goalkeepers.map((g) => ({
    player: g.player,
    club: g.club,
    matches: g.mp,
    minutes: g.min,
    conceded: g.ga,
    sotAgainst: g.sota,
    saves: g.saves,
    savePct: g.save_pct,
    cleanSheets: g.cs,
    cleanSheetPct: g.cs_pct,
    ga90: g.ga90,
    savesPer90: ratio(g.saves, (num(g.min) ?? 0) / 90, 2),
  }));
  const regulars = rows.filter((r) => (num(r.minutes) ?? 0) >= minMinutes);
  return {
    minMinutes,
    rows: sortBy(regulars, "savePct"),
    bestSavePct: top(regulars, "savePct", 5),
    mostCleanSheets: top(regulars, "cleanSheets", 5),
    lowestGa90: top(regulars, "ga90", 5, "asc"),
    busiest: top(regulars, "savesPer90", 5),
  };
}

export function analyzePossession(data) {
  const table = tableIndex(data);
  const rows = data.squadStandard
    .map((s) => ({
      squad: s.squad,
      possession: num(s.poss),
      pts: num(table.get(s.squad)?.pts),
      rank: table.get(s.squad)?.rk ?? null,
      goals: num(s.performance_gls),
      ga: num(table.get(s.squad)?.ga),
    }))
    .filter((r) => r.possession !== null);
  const corrPts = pearson(rows.map((r) => r.possession), rows.map((r) => r.pts));
  const corrGoals = pearson(rows.map((r) => r.possession), rows.map((r) => r.goals));
  const corrGa = pearson(rows.map((r) => r.possession), rows.map((r) => r.ga));
  const median = sortBy(rows, "possession").map((r) => r.possession)[Math.floor(rows.length / 2)] ?? 50;
  const medianPts = sortBy(rows, "pts").map((r) => r.pts)[Math.floor(rows.length / 2)] ?? 0;
  const byPts = (r) => r.pts ?? 0;
  return {
    rows: sortBy(rows, "possession"),
    corrPts,
    corrGoals,
    corrGa,
    mostPossession: top(rows, "possession", 3),
    leastPossession: top(rows, "possession", 3, "asc"),
    // Low possession, high points: counter-attacking over-achievers.
    counterPunchers: sortBy(rows.filter((r) => r.possession < median && byPts(r) >= medianPts), "pts").slice(0, 3),
    // High possession, low points: sterile domination.
    sterile: sortBy(rows.filter((r) => r.possession >= median && byPts(r) < medianPts), "pts", "asc").slice(0, 3),
  };

}
