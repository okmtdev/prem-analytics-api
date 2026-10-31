// Optional deep-dive on one club (--club "Arsenal").

import { cleanSquad, indexBy, num, parseMinute, pct, sortBy, top } from "../util.js";

/** Rank of `squad` within `rows` by `key` (1 = best). */
function rankOf(rows, squad, key, dir = "desc") {
  const sorted = sortBy(rows, key, dir);
  const i = sorted.findIndex((r) => r.squad === squad);
  return i === -1 ? null : i + 1;
}

export function resolveClubName(data, query) {
  if (!query) return null;
  const names = data.leagueTable.map((t) => t.squad);
  const q = query.toLowerCase();
  return names.find((n) => n.toLowerCase() === q) ?? names.find((n) => n.toLowerCase().includes(q)) ?? null;
}

export function analyzeClub(data, clubName) {
  const squad = resolveClubName(data, clubName);
  if (!squad) return { notFound: clubName, candidates: data.leagueTable.map((t) => t.squad) };

  const table = indexBy(data.leagueTable, "squad").get(squad);
  const ha = indexBy(data.homeAway, "squad").get(squad) ?? {};
  const std = indexBy(data.squadStandard, "squad").get(squad) ?? {};
  const sho = indexBy(data.squadShooting, "squad").get(squad) ?? {};
  const gk = indexBy(data.squadGoalkeeping, "squad").get(squad) ?? {};
  const misc = indexBy(data.squadMisc, "squad").get(squad) ?? {};
  const oppSho = indexBy(data.opponentShooting.map((r) => ({ ...r, squad: cleanSquad(r.squad) })), "squad").get(squad) ?? {};
  const n = data.leagueTable.length;

  const ranks = {
    goals: rankOf(data.squadStandard, squad, "performance_gls"),
    conceded: rankOf(data.leagueTable, squad, "ga", "asc"),
    shots: rankOf(data.squadShooting, squad, "standard_sh"),
    shotsFaced: rankOf(data.opponentShooting.map((r) => ({ ...r, squad: cleanSquad(r.squad) })), squad, "standard_sh", "asc"),
    possession: rankOf(data.squadStandard, squad, "poss"),
    savePct: rankOf(data.squadGoalkeeping, squad, "performance_save_pct"),
    cards: rankOf(data.squadMisc.map((m) => ({ squad: m.squad, cp: (num(m.performance_crdy) ?? 0) + 3 * (num(m.performance_crdr) ?? 0) })), squad, "cp"),
    homePpg: rankOf(data.homeAway, squad, "home_pts_per_mp"),
    awayPpg: rankOf(data.homeAway, squad, "away_pts_per_mp"),
  };

  const players = data.playerStandard.filter((p) => p.club === squad).map((p) => ({
    player: p.player,
    pos: p.pos,
    matches: p.mp,
    starts: p.starts,
    minutes: num(p.min) ?? 0,
    goals: num(p.gls) ?? 0,
    assists: num(p.ast) ?? 0,
    goalsAssists: num(p.g_plus_a) ?? 0,
    gaPer90: p.per90_g_plus_a ?? null,
  }));
  const playing = indexBy(data.playerPlayingTime.filter((p) => p.club === squad), "player");

  const results = data.fixtures
    .filter((f) => f.is_played && (f.home_team === squad || f.away_team === squad) && f.home_score !== null)
    .map((f) => {
      const isHome = f.home_team === squad;
      const gf = isHome ? f.home_score : f.away_score;
      const ga = isHome ? f.away_score : f.home_score;
      return {
        gameweek: f.gameweek,
        date: f.date,
        opponent: isHome ? f.away_team : f.home_team,
        venue: isHome ? "H" : "A",
        gf,
        ga,
        result: gf > ga ? "W" : gf === ga ? "D" : "L",
        matchId: f.match_id,
      };
    })
    .sort((p, q) => String(p.date).localeCompare(String(q.date)));

  // Goal timing for / against from events.
  const timingFor = { firstHalf: 0, secondHalf: 0, last15: 0 };
  const timingAgainst = { firstHalf: 0, secondHalf: 0, last15: 0 };
  for (const e of data.matchEvents) {
    if (!["goal", "penalty_goal", "own_goal"].includes(e.event_type)) continue;
    if (e.home_team !== squad && e.away_team !== squad) continue;
    const scoredByClub = (e.side === "home") === (e.home_team === squad);
    const m = parseMinute(e.minute);
    if (!m) continue;
    const t = scoredByClub ? timingFor : timingAgainst;
    if (m.base <= 45) t.firstHalf += 1;
    else t.secondHalf += 1;
    if (m.base >= 76) t.last15 += 1;
  }

  const upcoming = data.schedules
    .filter((s) => s.home_team === squad || s.away_team === squad)
    .sort((p, q) => `${p.date} ${p.time}`.localeCompare(`${q.date} ${q.time}`))
    .slice(0, 5)
    .map((s) => ({ gameweek: s.gameweek, date: s.date, opponent: s.home_team === squad ? s.away_team : s.home_team, venue: s.home_team === squad ? "H" : "A" }));

  return {
    squad,
    teamsInLeague: n,
    table: table ? { rank: table.rk, played: table.mp, w: table.w, d: table.d, l: table.l, gf: table.gf, ga: table.ga, gd: table.gd, pts: table.pts, form: table.last_5, topScorer: table.top_team_scorer } : null,
    homeAway: { homePpg: ha.home_pts_per_mp ?? null, awayPpg: ha.away_pts_per_mp ?? null, homeRecord: `${ha.home_w ?? 0}-${ha.home_d ?? 0}-${ha.home_l ?? 0}`, awayRecord: `${ha.away_w ?? 0}-${ha.away_d ?? 0}-${ha.away_l ?? 0}` },
    attack: { goals: std.performance_gls ?? null, shots: sho.standard_sh ?? null, sotPct: sho.standard_sot_pct ?? null, goalsPerShot: sho.standard_g_per_sh ?? null, possession: std.poss ?? null, pens: std.performance_pk ?? null },
    defence: { conceded: table?.ga ?? null, shotsFaced: oppSho.standard_sh ?? null, savePct: gk.performance_save_pct ?? null, cleanSheets: gk.performance_cs ?? null },
    discipline: { yellow: misc.performance_crdy ?? null, red: misc.performance_crdr ?? null, fouls: misc.performance_fls ?? null },
    ranks,
    topScorers: top(players, "goals", 5),
    topAssists: top(players, "assists", 5),
    mostMinutes: top(players, "minutes", 5),
    bestOnOff: top(
      players.filter((p) => p.minutes >= 270).map((p) => ({ ...p, onOff: playing.get(p.player)?.on_off ?? null, plusMinusPer90: playing.get(p.player)?.plus_minus_90 ?? null })),
      "plusMinusPer90",
      5,
    ),
    results,
    timing: { for: timingFor, against: timingAgainst, last15SharePct: pct(timingFor.last15, timingFor.firstHalf + timingFor.secondHalf) },
    upcoming,
  };
}
