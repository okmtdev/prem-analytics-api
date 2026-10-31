// Match-level insights: results, scorelines, goal timing, comebacks,
// possession-vs-result, attendance, discipline and referees.

import { groupBy, indexBy, mean, num, parseMinute, pct, ratio, round, sortBy, top } from "../util.js";

const GOAL_TYPES = new Set(["goal", "penalty_goal", "own_goal"]);
const BUCKETS = [
  { label: "1-15", from: 1, to: 15 },
  { label: "16-30", from: 16, to: 30 },
  { label: "31-45+", from: 31, to: 45 },
  { label: "46-60", from: 46, to: 60 },
  { label: "61-75", from: 61, to: 75 },
  { label: "76-90+", from: 76, to: 999 },
];

function playedFixtures(data) {
  return data.fixtures.filter((f) => f.is_played && f.home_score !== null && f.away_score !== null);
}

export function analyzeMatches(data) {
  const played = playedFixtures(data);
  const n = played.length;
  const results = played.map((f) => ({
    matchId: f.match_id,
    gameweek: f.gameweek,
    date: f.date,
    home: f.home_team,
    away: f.away_team,
    homeScore: f.home_score,
    awayScore: f.away_score,
    total: f.home_score + f.away_score,
    margin: Math.abs(f.home_score - f.away_score),
    attendance: f.attendance,
    venue: f.venue,
    referee: f.referee,
  }));

  const scorelines = groupBy(results, (r) => `${Math.max(r.homeScore, r.awayScore)}-${Math.min(r.homeScore, r.awayScore)}`);
  const scorelineFreq = sortBy(
    [...scorelines.entries()].map(([scoreline, rs]) => ({ scoreline, count: rs.length, share: pct(rs.length, n) })),
    "count",
  ).slice(0, 6);

  const byGw = groupBy(results, (r) => r.gameweek);
  const gameweekGoals = sortBy(
    [...byGw.entries()].map(([gw, rs]) => ({ gameweek: gw, matches: rs.length, goals: rs.reduce((a, r) => a + r.total, 0), perMatch: ratio(rs.reduce((a, r) => a + r.total, 0), rs.length) })),
    "gameweek",
    "asc",
  );

  const totalGoals = results.reduce((a, r) => a + r.total, 0);
  const summary = {
    matches: n,
    goals: totalGoals,
    goalsPerMatch: ratio(totalGoals, n),
    drawPct: pct(results.filter((r) => r.margin === 0).length, n),
    bothScoredPct: pct(results.filter((r) => r.homeScore > 0 && r.awayScore > 0).length, n),
    over25Pct: pct(results.filter((r) => r.total > 2.5).length, n),
    cleanSheetPct: pct(results.filter((r) => r.homeScore === 0 || r.awayScore === 0).length, n),
    goallessPct: pct(results.filter((r) => r.total === 0).length, n),
  };

  return {
    summary,
    biggestWins: top(results, "margin", 5),
    highestScoring: top(results, "total", 5),
    scorelineFreq,
    gameweekGoals,
    timing: goalTiming(data.matchEvents),
    comebacks: comebacks(data.matchEvents, data.leagueTable),
    possessionVsResult: possessionVsResult(data.matchTeamStats),
    attendance: attendance(results, data.leagueTable),
    discipline: discipline(data),
    referees: referees(played, data.matchTeamStats, data.matchEvents),
  };
}

export function goalTiming(events) {
  const goals = events.filter((e) => GOAL_TYPES.has(e.event_type));
  const buckets = BUCKETS.map((b) => ({ ...b, goals: 0 }));
  let stoppage = 0;
  let firstHalf = 0;
  for (const g of goals) {
    const m = parseMinute(g.minute);
    if (!m) continue;
    if (m.added > 0) stoppage += 1;
    if (m.base <= 45) firstHalf += 1;
    const b = buckets.find((x) => m.base >= x.from && m.base <= x.to) ?? buckets[buckets.length - 1];
    b.goals += 1;
  }
  const total = goals.length;
  const types = groupBy(goals, (g) => g.event_type);
  const pens = events.filter((e) => e.event_type === "penalty_goal" || e.event_type === "penalty_miss");
  const penScored = events.filter((e) => e.event_type === "penalty_goal").length;
  // Late winners / equalisers: goals from 85' that changed the result state.
  const late = lateDecisiveGoals(events);
  return {
    total,
    buckets: buckets.map((b) => ({ label: b.label, goals: b.goals, share: pct(b.goals, total) })),
    stoppageTimeGoals: stoppage,
    stoppageSharePct: pct(stoppage, total),
    firstHalfPct: pct(firstHalf, total),
    secondHalfPct: pct(total - firstHalf, total),
    ownGoals: types.get("own_goal")?.length ?? 0,
    penalties: { taken: pens.length, scored: penScored, conversionPct: pct(penScored, pens.length) },
    lateDecisive: late,
  };
}

function matchGoalsInOrder(es) {
  return es
    .filter((e) => GOAL_TYPES.has(e.event_type))
    .map((e) => ({ ...e, m: parseMinute(e.minute) }))
    .filter((e) => e.m)
    .sort((a, b) => a.m.total - b.m.total);
}

/** Goals in the 85th minute or later that turned a draw into a win or a loss into a draw. */
function lateDecisiveGoals(events) {
  const out = [];
  for (const es of groupBy(events, (e) => e.match_id).values()) {
    let h = 0;
    let a = 0;
    for (const g of matchGoalsInOrder(es)) {
      const before = Math.sign(h - a);
      if (g.side === "home") h += 1;
      else a += 1;
      const after = Math.sign(h - a);
      const final = Math.sign(g.home_score - g.away_score);
      if (g.m.base >= 85 && before !== after && after === final) {
        const scorerClub = g.side === "home" ? g.home_team : g.away_team;
        out.push({
          matchId: g.match_id,
          date: g.date,
          gameweek: g.gameweek,
          fixture: `${g.home_team} ${g.home_score}-${g.away_score} ${g.away_team}`,
          minute: g.minute,
          player: g.player,
          club: scorerClub,
          kind: after === 0 ? "equaliser" : "winner",
        });
      }
    }
  }
  return {
    winners: out.filter((o) => o.kind === "winner").length,
    equalisers: out.filter((o) => o.kind === "equaliser").length,
    list: out.sort((p, q) => String(q.date).localeCompare(String(p.date))).slice(0, 8),
  };
}

/** Comeback wins and points won from losing / dropped from winning positions. */
export function comebacks(events, leagueTable = []) {
  const teams = new Map(leagueTable.map((t) => [t.squad, { squad: t.squad, comebackWins: 0, ptsFromBehind: 0, ptsDroppedFromAhead: 0, blownLeads: 0 }]));
  const ensure = (s) => {
    if (!teams.has(s)) teams.set(s, { squad: s, comebackWins: 0, ptsFromBehind: 0, ptsDroppedFromAhead: 0, blownLeads: 0 });
    return teams.get(s);
  };
  const list = [];
  for (const es of groupBy(events, (e) => e.match_id).values()) {
    const first = es[0];
    if (first.home_score === null || first.away_score === null) continue;
    let h = 0;
    let a = 0;
    let homeTrailed = false;
    let awayTrailed = false;
    let homeLed = false;
    let awayLed = false;
    let maxDeficitHome = 0;
    let maxDeficitAway = 0;
    for (const g of matchGoalsInOrder(es)) {
      if (g.side === "home") h += 1;
      else a += 1;
      if (h < a) {
        homeTrailed = true;
        maxDeficitHome = Math.max(maxDeficitHome, a - h);
      }
      if (a < h) {
        awayTrailed = true;
        maxDeficitAway = Math.max(maxDeficitAway, h - a);
      }
      if (h > a) homeLed = true;
      if (a > h) awayLed = true;
    }
    const hs = first.home_score;
    const as = first.away_score;
    const ptsHome = hs > as ? 3 : hs === as ? 1 : 0;
    const ptsAway = as > hs ? 3 : hs === as ? 1 : 0;
    const home = ensure(first.home_team);
    const away = ensure(first.away_team);
    if (homeTrailed && ptsHome > 0) home.ptsFromBehind += ptsHome;
    if (awayTrailed && ptsAway > 0) away.ptsFromBehind += ptsAway;
    if (homeLed && ptsHome < 3) {
      home.ptsDroppedFromAhead += 3 - ptsHome;
      home.blownLeads += 1;
    }
    if (awayLed && ptsAway < 3) {
      away.ptsDroppedFromAhead += 3 - ptsAway;
      away.blownLeads += 1;
    }
    const winnerTrailed = (hs > as && homeTrailed) || (as > hs && awayTrailed);
    if (winnerTrailed) {
      const winner = hs > as ? first.home_team : first.away_team;
      ensure(winner).comebackWins += 1;
      list.push({
        matchId: first.match_id,
        date: first.date,
        gameweek: first.gameweek,
        fixture: `${first.home_team} ${hs}-${as} ${first.away_team}`,
        winner,
        deficit: hs > as ? maxDeficitHome : maxDeficitAway,
      });
    }
  }
  const rows = [...teams.values()];
  return {
    total: list.length,
    list: sortBy(list, "deficit").slice(0, 8),
    mostComebackWins: top(rows.filter((r) => r.comebackWins > 0), "comebackWins", 3),
    mostPtsFromBehind: top(rows.filter((r) => r.ptsFromBehind > 0), "ptsFromBehind", 3),
    mostPtsDropped: top(rows.filter((r) => r.ptsDroppedFromAhead > 0), "ptsDroppedFromAhead", 3),
  };
}

/** How often does the team with more possession / more shots win? */
export function possessionVsResult(teamStats) {
  let possWin = 0;
  let possDraw = 0;
  let possLoss = 0;
  let shotsWin = 0;
  let shotsDraw = 0;
  let shotsLoss = 0;
  let nPoss = 0;
  let nShots = 0;
  const shotsPerMatch = [];
  const cornersPerMatch = [];
  for (const sides of groupBy(teamStats, (t) => t.match_id).values()) {
    if (sides.length !== 2) continue;
    const [x, y] = sides;
    const score = (t) => (t.side === "home" ? [t.home_score, t.away_score] : [t.away_score, t.home_score]);
    const [xf, xa] = score(x);
    if (xf === null || xa === null) continue;
    shotsPerMatch.push((num(x.shots) ?? 0) + (num(y.shots) ?? 0));
    cornersPerMatch.push((num(x.corners) ?? 0) + (num(y.corners) ?? 0));
    const outcome = (fav) => {
      const [f, a] = score(fav);
      return f > a ? "win" : f === a ? "draw" : "loss";
    };
    if (num(x.possession) !== null && num(y.possession) !== null && x.possession !== y.possession) {
      nPoss += 1;
      const o = outcome(x.possession > y.possession ? x : y);
      if (o === "win") possWin += 1;
      else if (o === "draw") possDraw += 1;
      else possLoss += 1;
    }
    if (num(x.shots) !== null && num(y.shots) !== null && x.shots !== y.shots) {
      nShots += 1;
      const o = outcome(x.shots > y.shots ? x : y);
      if (o === "win") shotsWin += 1;
      else if (o === "draw") shotsDraw += 1;
      else shotsLoss += 1;
    }
  }
  return {
    possession: { matches: nPoss, winPct: pct(possWin, nPoss), drawPct: pct(possDraw, nPoss), lossPct: pct(possLoss, nPoss) },
    shots: { matches: nShots, winPct: pct(shotsWin, nShots), drawPct: pct(shotsDraw, nShots), lossPct: pct(shotsLoss, nShots) },
    avgShotsPerMatch: round(mean(shotsPerMatch), 1),
    avgCornersPerMatch: round(mean(cornersPerMatch), 1),
  };
}

function attendance(results, leagueTable) {
  const withAtt = results.filter((r) => num(r.attendance) !== null);
  const byClub = sortBy(
    leagueTable.filter((t) => num(t.attendance) !== null).map((t) => ({ squad: t.squad, avgAttendance: t.attendance })),
    "avgAttendance",
  );
  return {
    average: round(mean(withAtt.map((r) => r.attendance)), 0),
    total: withAtt.reduce((a, r) => a + r.attendance, 0),
    biggest: top(withAtt, "attendance", 3),
    smallest: top(withAtt, "attendance", 3, "asc"),
    byClub,
  };
}

function discipline(data) {
  const table = indexBy(data.leagueTable, "squad");
  const rows = data.squadMisc.map((m) => {
    const cards = (num(m.performance_crdy) ?? 0) + (num(m.performance_crdr) ?? 0);
    return {
      squad: m.squad,
      rank: table.get(m.squad)?.rk ?? null,
      yellow: m.performance_crdy,
      red: m.performance_crdr,
      cardPoints: (num(m.performance_crdy) ?? 0) + 3 * (num(m.performance_crdr) ?? 0),
      fouls: m.performance_fls,
      fouled: m.performance_fld,
      foulsPerCard: ratio(m.performance_fls, cards, 1),
      offsides: m.performance_off,
      interceptions: m.performance_int,
      tacklesWon: m.performance_tklw,
      ownGoals: m.performance_og,
      foulsPer90: ratio(m.performance_fls, m.s90, 1),
    };
  });
  return {
    rows: sortBy(rows, "cardPoints"),
    mostCards: top(rows, "cardPoints", 3),
    fewestCards: top(rows, "cardPoints", 3, "asc"),
    mostFouls: top(rows, "foulsPer90", 3),
    mostFouled: top(rows, "fouled", 3),
    totals: {
      yellow: rows.reduce((a, r) => a + (num(r.yellow) ?? 0), 0),
      red: rows.reduce((a, r) => a + (num(r.red) ?? 0), 0),
      fouls: rows.reduce((a, r) => a + (num(r.fouls) ?? 0), 0),
    },
  };
}

function referees(played, teamStats, events) {
  const statsByMatch = groupBy(teamStats, (t) => t.match_id);
  const pensByMatch = groupBy(events.filter((e) => e.event_type === "penalty_goal" || e.event_type === "penalty_miss"), (e) => e.match_id);
  const byRef = groupBy(played.filter((f) => f.referee), (f) => f.referee);
  const rows = [...byRef.entries()].map(([referee, fs]) => {
    let yellow = 0;
    let red = 0;
    let fouls = 0;
    let pens = 0;
    for (const f of fs) {
      for (const t of statsByMatch.get(f.match_id) ?? []) {
        yellow += num(t.yellow_cards) ?? 0;
        red += num(t.red_cards) ?? 0;
        fouls += num(t.fouls) ?? 0;
      }
      pens += pensByMatch.get(f.match_id)?.length ?? 0;
    }
    return {
      referee,
      matches: fs.length,
      yellow,
      red,
      yellowPerMatch: ratio(yellow, fs.length, 2),
      foulsPerMatch: ratio(fouls, fs.length, 1),
      penalties: pens,
    };
  });
  const regular = rows.filter((r) => r.matches >= 2);
  return {
    rows: sortBy(rows, "matches"),
    strictest: top(regular, "yellowPerMatch", 3),
    mostLenient: top(regular, "yellowPerMatch", 3, "asc"),
    mostPenalties: top(rows.filter((r) => r.penalties > 0), "penalties", 3),
    busiest: top(rows, "matches", 3),
  };
}
