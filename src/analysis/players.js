// Player-level insights: scorers, creators, efficiency, impact, youngsters, super-subs.

import { groupBy, indexBy, num, parseAge, parseMinute, pct, ratio, sortBy, top } from "../util.js";

const key = (r) => `${r.club}|${r.player}`;

export function analyzePlayers(data, { minMinutes = 270, minShots = 10 } = {}) {
  const shooting = indexBy(data.playerShooting, key);
  const playing = indexBy(data.playerPlayingTime, key);
  const misc = indexBy(data.playerMisc, key);

  const rows = data.playerStandard.map((p) => {
    const sh = shooting.get(key(p)) ?? {};
    const pt = playing.get(key(p)) ?? {};
    const mi = misc.get(key(p)) ?? {};
    const minutes = num(p.min) ?? 0;
    return {
      player: p.player,
      club: p.club,
      pos: p.pos,
      nation: p.nation ? String(p.nation).split(" ").pop() : null,
      age: parseAge(p.age),
      matches: p.mp,
      starts: p.starts,
      minutes,
      goals: num(p.gls) ?? 0,
      assists: num(p.ast) ?? 0,
      goalsAssists: num(p.g_plus_a) ?? 0,
      nonPenGoals: num(p.g_minus_pk) ?? 0,
      pens: num(p.pk) ?? 0,
      penAtt: num(p.pkatt) ?? 0,
      goalsPer90: p.per90_gls ?? p.gls_per90 ?? null,
      assistsPer90: p.per90_ast ?? p.ast_per90 ?? null,
      gaPer90: p.per90_g_plus_a ?? p.g_plus_a_per90 ?? null,
      shots: num(sh.sh),
      shotsOnTarget: num(sh.sot),
      sotPct: sh.sot_pct ?? null,
      goalsPerShot: sh.g_per_sh ?? null,
      shotsPer90: sh.sh_per_90 ?? null,
      yellow: num(p.crdy) ?? 0,
      red: num(p.crdr) ?? 0,
      fouls: num(mi.fls),
      fouled: num(mi.fld),
      tacklesWon: num(mi.tklw),
      interceptions: num(mi.intercept),
      minutesPct: pt.min_pct ?? null,
      subAppearances: num(pt.subs),
      plusMinus: pt.plus_minus ?? null,
      plusMinusPer90: pt.plus_minus_90 ?? null,
      onOff: pt.on_off ?? null,
      pointsPerMatch: pt.ppm ?? null,
    };
  });

  const regulars = rows.filter((r) => r.minutes >= minMinutes);
  const shooters = rows.filter((r) => (r.shots ?? 0) >= minShots);
  const maxMinutes = Math.max(0, ...rows.map((r) => r.minutes));

  return {
    thresholds: { minMinutes, minShots },
    topScorers: top(rows, "goals", 10),
    topNonPenScorers: top(rows, "nonPenGoals", 5),
    topAssists: top(rows, "assists", 10),
    topGoalInvolvements: top(rows, "goalsAssists", 10),
    bestGaPer90: top(regulars, "gaPer90", 5),
    bestGoalsPer90: top(regulars, "goalsPer90", 5),
    mostShots: top(rows, "shots", 5),
    clinicalFinishers: top(shooters, "goalsPerShot", 5),
    wastefulShooters: top(shooters, "goalsPerShot", 5, "asc"),
    bestPlusMinus: top(regulars, "plusMinusPer90", 5),
    worstPlusMinus: top(regulars, "plusMinusPer90", 5, "asc"),
    everPresents: rows.filter((r) => r.minutes === maxMinutes && maxMinutes > 0).map((r) => ({ ...r })),
    mostMinutes: top(rows, "minutes", 5),
    youngRegulars: sortBy(
      regulars.filter((r) => r.age !== null && r.age < 21),
      "minutes",
    ).slice(0, 8),
    oldestRegulars: top(regulars.filter((r) => r.age !== null), "age", 5),
    mostFouled: top(rows, "fouled", 5),
    mostFouls: top(rows, "fouls", 5),
    mostCards: top(
      rows.map((r) => ({ ...r, cardPoints: r.yellow + r.red * 3 })).filter((r) => r.cardPoints > 0),
      "cardPoints",
      5,
    ),
    topTacklers: top(rows.filter((r) => r.tacklesWon !== null), "tacklesWon", 5),
    superSubs: superSubs(data.matchEvents),
    nationalities: nationalityBreakdown(rows),
  };
}

/** Goals scored by players after coming on as a substitute (from match events). */
export function superSubs(events) {
  const byMatch = groupBy(events, (e) => e.match_id);
  const tally = new Map();
  for (const es of byMatch.values()) {
    const subbedOn = new Map();
    for (const e of es) {
      if (e.event_type === "substitute_in" && e.player) {
        const m = parseMinute(e.minute);
        if (m) subbedOn.set(`${e.side}|${e.player}`, m.total);
      }
    }
    for (const e of es) {
      if (e.event_type !== "goal" && e.event_type !== "penalty_goal") continue;
      const on = subbedOn.get(`${e.side}|${e.player}`);
      const m = parseMinute(e.minute);
      if (on === undefined || !m || m.total < on) continue;
      const club = e.side === "home" ? e.home_team : e.away_team;
      const k = `${club}|${e.player}`;
      const cur = tally.get(k) ?? { player: e.player, club, subGoals: 0, matches: new Set() };
      cur.subGoals += 1;
      cur.matches.add(e.match_id);
      tally.set(k, cur);
    }
  }
  return sortBy(
    [...tally.values()].map((t) => ({ player: t.player, club: t.club, subGoals: t.subGoals, matches: t.matches.size })),
    "subGoals",
  ).slice(0, 5);
}

function nationalityBreakdown(rows) {
  const byNation = groupBy(rows.filter((r) => r.nation), (r) => r.nation);
  const totalMinutes = rows.reduce((a, r) => a + r.minutes, 0);
  const list = [...byNation.entries()].map(([nation, ps]) => ({
    nation,
    players: ps.length,
    minutes: ps.reduce((a, r) => a + r.minutes, 0),
    minutesShare: pct(ps.reduce((a, r) => a + r.minutes, 0), totalMinutes),
    goals: ps.reduce((a, r) => a + r.goals, 0),
  }));
  return { total: byNation.size, byMinutes: top(list, "minutes", 8), goalsPerPlayer: ratio(list.reduce((a, r) => a + r.goals, 0), rows.length, 2) };
}
