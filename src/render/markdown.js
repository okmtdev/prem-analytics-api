// Renders the insights object (see ../analysis/index.js) as a Markdown report.

import { ordinal, t } from "../i18n.js";

const NA = "–";

/** Format a number with `d` decimals; null -> "–". */
function f(v, d = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return NA;
  if (typeof v !== "number") return String(v);
  return d === 0 ? String(Math.round(v)) : v.toFixed(d);
}

/** Thousands separator. */
function big(v) {
  if (v === null || v === undefined) return NA;
  return Math.round(v).toLocaleString("en-US");
}

function signed(v, d = 1) {
  if (v === null || v === undefined) return NA;
  return `${v > 0 ? "+" : ""}${f(v, d)}`;
}

function esc(s) {
  return s === null || s === undefined ? NA : String(s).replace(/\|/g, "\\|");
}

function table(headers, rows) {
  if (!rows.length) return "";
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map(esc).join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}

function anchor(title) {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function renderMarkdown(insights, { lang = "ja" } = {}) {
  const L = (key, vars) => t(lang, key, vars);
  const ord = (n) => ordinal(lang, n);
  const out = [];
  const sections = [];
  const push = (...lines) => out.push(...lines, "");
  const h2 = (title) => {
    sections.push(title);
    push(`## ${title}`);
  };
  const h3 = (title) => push(`### ${title}`);
  const none = () => push(`_${L("none")}_`);
  const tbl = (headers, rows) => (rows.length ? push(table(headers, rows)) : none());

  const { meta, table: tb, homeAway, attack, defence, goalkeepers, possession, players, matches, upcoming, reports, club } = insights;
  const generated = meta.generatedAt.replace("T", " ").slice(0, 16) + " UTC";

  // ---- Title ---------------------------------------------------------------
  push(`# ${L("title", { season: meta.season ?? "" })}`);
  push(L("metaLine", { gw: meta.gameweeksPlayed, matches: meta.matchesPlayed, last: meta.lastMatchDate, generated, source: meta.source }));
  const tocIndex = out.length;
  push(""); // placeholder for the table of contents

  // ---- Executive summary ----------------------------------------------------
  h2(L("secSummary"));
  const bullets = [];
  if (tb.titleRace) {
    bullets.push(L(tb.titleRace.gapToSecond === 0 ? "sumLeaderLevel" : "sumLeader", { leader: tb.titleRace.leader, pts: tb.titleRace.leaderPts, second: tb.titleRace.second, gap: tb.titleRace.gapToSecond, pace: f(tb.titleRace.leaderPace38, 1) }));
  }
  if (tb.form?.hottest?.length) {
    const hot = tb.form.hottest[0];
    const cold = tb.form.coldest[0];
    bullets.push(L("sumHot", { squad: hot.squad, form: hot.form, pts: hot.formPts, cold: cold.squad, coldForm: cold.form }));
  }
  bullets.push(L("sumGoals", { gpm: f(matches.summary.goalsPerMatch, 2), home: f(homeAway.league.homeWinPct, 1), draw: f(homeAway.league.drawPct, 1), away: f(homeAway.league.awayWinPct, 1) }));
  if (attack.mostGoals[0] && defence.meanest[0]) {
    bullets.push(L("sumAttack", { squad: attack.mostGoals[0].squad, goals: attack.mostGoals[0].goals, def: defence.meanest[0].squad, ga: defence.meanest[0].conceded }));
  }
  if (players.topScorers[0] && players.topAssists[0]) {
    const s = players.topScorers[0];
    const a = players.topAssists[0];
    bullets.push(L("sumScorer", { player: s.player, club: s.club, goals: s.goals, assister: a.player, aclub: a.club, assists: a.assists }));
  }
  if (matches.comebacks.total && matches.comebacks.list[0]) {
    const c = matches.comebacks.list[0];
    bullets.push(L("sumComeback", { n: matches.comebacks.total, fixture: c.fixture, deficit: c.deficit }));
  }
  if (tb.gdModel) {
    const o = tb.gdModel.overPerformers[0];
    const u = tb.gdModel.underPerformers[0];
    bullets.push(L("sumLuck", { over: o.squad, overDiff: f(o.diff, 1), under: u.squad, underDiff: f(u.diff, 1) }));
  }
  push(bullets.map((b) => `- ${b}`).join("\n"));

  // ---- League table ----------------------------------------------------------
  h2(L("secTable"));
  tbl(
    [L("thRank"), L("thSquad"), L("thP"), L("thW"), L("thD"), L("thL"), L("thGF"), L("thGA"), L("thGD"), L("thPts"), L("thPPG"), L("thForm"), L("thTopScorer")],
    tb.rows.map((r) => [r.rank, r.squad, r.played, r.w, r.d, r.l, r.gf, r.ga, signed(r.gd, 0), r.pts, f(r.ptsPerMatch, 2), r.form, r.topScorer]),
  );

  // ---- Title race / relegation / form / luck ---------------------------------
  h2(L("secRace"));
  if (tb.titleRace) {
    h3(L("raceTitle"));
    const lines = [L("raceLine", { leader: tb.titleRace.leader, pts: tb.titleRace.leaderPts, second: tb.titleRace.second, gap: tb.titleRace.gapToSecond })];
    if (tb.titleRace.top4Cutoff) lines.push(L("raceTop4", tb.titleRace.top4Cutoff));
    push(lines.join(" "));
  }
  h3(L("relegationTitle"));
  tbl([L("thRank"), L("thSquad"), L("thP"), L("thPts"), L("thGD"), L("thForm"), L("thGapSafety")], tb.relegation.map((r) => [r.rank, r.squad, r.played, r.pts, signed(r.gd, 0), r.form, r.gapToSafety]));
  if (tb.form) {
    h3(L("formTitle"));
    push(`**${L("formHot")}**`);
    tbl([L("thSquad"), L("thRank"), L("thForm"), L("thFormPts")], tb.form.hottest.map((r) => [r.squad, r.rank, r.form, r.formPts]));
    push(`**${L("formCold")}**`);
    tbl([L("thSquad"), L("thRank"), L("thForm"), L("thFormPts")], tb.form.coldest.map((r) => [r.squad, r.rank, r.form, r.formPts]));
    push(`**${L("formRisers")}**`);
    tbl([L("thSquad"), L("thRank"), L("thFormRank"), L("thForm")], tb.form.risers.filter((r) => r.delta > 0).map((r) => [r.squad, r.rank, r.formRank, r.form]));
    push(`**${L("formFallers")}**`);
    tbl([L("thSquad"), L("thRank"), L("thFormRank"), L("thForm")], tb.form.fallers.filter((r) => r.delta < 0).map((r) => [r.squad, r.rank, r.formRank, r.form]));
  }
  if (tb.gdModel) {
    h3(L("gdModelTitle"));
    push(L("gdModelDesc", { a: f(tb.gdModel.intercept, 2), b: f(tb.gdModel.slope, 3) }));
    push(`**${L("gdOver")}**`);
    tbl([L("thSquad"), L("thPts"), L("thGD"), L("thExpPts"), L("thDiff")], tb.gdModel.overPerformers.map((r) => [r.squad, r.pts, signed(r.gd, 0), f(r.expectedPts, 1), signed(r.diff, 1)]));
    push(`**${L("gdUnder")}**`);
    tbl([L("thSquad"), L("thPts"), L("thGD"), L("thExpPts"), L("thDiff")], tb.gdModel.underPerformers.map((r) => [r.squad, r.pts, signed(r.gd, 0), f(r.expectedPts, 1), signed(r.diff, 1)]));
  }

  // ---- Home / away ---------------------------------------------------------
  h2(L("secHomeAway"));
  push(L("haLeague", { home: f(homeAway.league.homeWinPct, 1), draw: f(homeAway.league.drawPct, 1), away: f(homeAway.league.awayWinPct, 1), n: homeAway.league.matches, hg: f(homeAway.league.homeGoalsPerMatch, 2), ag: f(homeAway.league.awayGoalsPerMatch, 2) }));
  const haRow = (r) => [r.squad, `${f(r.homePts)} (${f(r.homePlayed)})`, f(r.homePpg, 2), `${f(r.awayPts)} (${f(r.awayPlayed)})`, f(r.awayPpg, 2), signed(r.ppgGap, 2)];
  const haHead = [L("thSquad"), `${L("thHomeRec")} ${L("thPts")} (${L("thP")})`, L("thHomePPG"), `${L("thAwayRec")} ${L("thPts")} (${L("thP")})`, L("thAwayPPG"), L("thGap")];
  push(`**${L("haBestHome")}**`);
  tbl(haHead, homeAway.bestHome.map(haRow));
  push(`**${L("haBestAway")}**`);
  tbl(haHead, homeAway.bestAway.map(haRow));
  push(`**${L("haFortress")}**`);
  tbl(haHead, homeAway.fortresses.map(haRow));
  push(`**${L("haRoad")}**`);
  tbl(haHead, homeAway.roadWarriors.filter((r) => r.ppgGap < 0).map(haRow));

  // ---- Attack ----------------------------------------------------------------
  h2(L("secAttack"));
  const atkHead = [L("thSquad"), L("thRank"), L("thGF"), L("thShots"), L("thSoTPct"), L("thShPer90"), L("thGPerSh"), L("thShPerGoal"), L("thPoss")];
  const atkRow = (r) => [r.squad, r.rank, r.goals, r.shots, f(r.sotPct, 1), f(r.shotsPer90, 1), f(r.goalsPerShot, 2), f(r.shotsPerGoal, 1), f(r.possession, 1)];
  tbl(atkHead, attack.rows.map(atkRow));
  push(`**${L("atkClinical")}**`);
  tbl(atkHead, attack.clinical.map(atkRow));
  push(`**${L("atkWasteful")}**`);
  tbl(atkHead, attack.wasteful.map(atkRow));
  push(`**${L("atkVolume")}**`);
  tbl(atkHead, attack.mostShots.map(atkRow));
  push(`**${L("atkPen")}**`);
  tbl([L("thSquad"), L("thGF"), L("thPens"), L("thPenShare")], attack.penaltyReliant.map((r) => [r.squad, r.goals, `${f(r.pens)}/${f(r.penAtt)}`, f(r.penShare, 1)]));
  push(`**${L("atkAge")}**`);
  tbl([L("thSquad"), L("thAge"), L("thPlayers")], [...attack.oldest, ...attack.youngest].map((r) => [r.squad, f(r.avgAge, 1), r.players]));

  // ---- Defence ---------------------------------------------------------------
  h2(L("secDefence"));
  const defHead = [L("thSquad"), L("thRank"), L("thGA"), L("thGA90"), L("thShotsFaced90"), L("thSoTFaced"), L("thGAPerShot"), L("thSavePct"), L("thCS")];
  const defRow = (r) => [r.squad, r.rank, r.conceded, f(r.concededPer90, 2), f(r.shotsFacedPer90, 1), r.sotFaced, f(r.concededPerShotFaced, 2), f(r.savePct, 1), r.cleanSheets];
  tbl(defHead, defence.rows.map(defRow));
  push(`**${L("defSuppress")}**`);
  tbl(defHead, defence.shotSuppression.map(defRow));
  push(`**${L("defMostFaced")}**`);
  tbl(defHead, defence.mostShotsFaced.map(defRow));
  push(`**${L("defKeeperReliant")}**`);
  tbl(defHead, defence.keeperReliant.map(defRow));

  // ---- Goalkeepers -----------------------------------------------------------
  h2(L("secGK"));
  push(L("gkNote", { min: goalkeepers.minMinutes }));
  const gkHead = [L("thPlayer"), L("thClub"), L("thMin"), L("thGA"), L("thSaves"), L("thSavePct"), L("thCS"), L("thGA90"), L("thSaves90")];
  const gkRow = (g) => [g.player, g.club, f(g.minutes), g.conceded, g.saves, f(g.savePct, 1), g.cleanSheets, f(g.ga90, 2), f(g.savesPer90, 2)];
  push(`**${L("gkBest")}**`);
  tbl(gkHead, goalkeepers.bestSavePct.map(gkRow));
  push(`**${L("gkCS")}**`);
  tbl(gkHead, goalkeepers.mostCleanSheets.map(gkRow));
  push(`**${L("gkBusy")}**`);
  tbl(gkHead, goalkeepers.busiest.map(gkRow));

  // ---- Possession ------------------------------------------------------------
  h2(L("secPossession"));
  const r = possession.corrPts;
  const verdict = r === null ? "" : r >= 0.5 ? L("possStrong") : r <= -0.2 ? L("possNeg") : L("possWeak");
  push(`${L("possCorr", { r: f(r, 2), rg: f(possession.corrGoals, 2), rga: f(possession.corrGa, 2) })} ${verdict}`);
  const pv = matches.possessionVsResult;
  push(L("possVsResult", { pw: f(pv.possession.winPct, 1), pd: f(pv.possession.drawPct, 1), pl: f(pv.possession.lossPct, 1), sw: f(pv.shots.winPct, 1), shots: f(pv.avgShotsPerMatch, 1), corners: f(pv.avgCornersPerMatch, 1) }));
  const possHead = [L("thSquad"), L("thPoss"), L("thRank"), L("thPts"), L("thGF"), L("thGA")];
  const possRow = (p) => [p.squad, f(p.possession, 1), p.rank, p.pts, p.goals, p.ga];
  push(`**${L("possMost")}**`);
  tbl(possHead, possession.mostPossession.map(possRow));
  push(`**${L("possLeast")}**`);
  tbl(possHead, possession.leastPossession.map(possRow));
  push(`**${L("possCounter")}**`);
  tbl(possHead, possession.counterPunchers.map(possRow));
  push(`**${L("possSterile")}**`);
  tbl(possHead, possession.sterile.map(possRow));

  // ---- Players ---------------------------------------------------------------
  h2(L("secPlayers"));
  const th = players.thresholds;
  const pHead = [L("thPlayer"), L("thClub"), L("thPos"), L("thApps"), L("thMin"), L("thGoals"), L("thAssists"), L("thGPlusA"), L("thGAPer90")];
  const pRow = (p) => [p.player, p.club, p.pos, p.matches, f(p.minutes), f(p.goals), f(p.assists), f(p.goalsAssists), f(p.gaPer90, 2)];
  h3(L("plScorers"));
  tbl([L("thPlayer"), L("thClub"), L("thPos"), L("thApps"), L("thMin"), L("thGoals"), L("thNPG"), L("thPens"), L("thG90"), L("thShots"), L("thGPerSh")], players.topScorers.map((p) => [p.player, p.club, p.pos, p.matches, f(p.minutes), f(p.goals), f(p.nonPenGoals), `${f(p.pens)}/${f(p.penAtt)}`, f(p.goalsPer90, 2), p.shots, f(p.goalsPerShot, 2)]));
  h3(L("plAssists"));
  tbl(pHead, players.topAssists.map(pRow));
  h3(L("plGA"));
  tbl(pHead, players.topGoalInvolvements.map(pRow));
  h3(L("plPer90", { min: th.minMinutes }));
  tbl(pHead, players.bestGaPer90.map(pRow));
  h3(L("plClinical", { shots: th.minShots }));
  const shHead = [L("thPlayer"), L("thClub"), L("thShots"), L("thSoT"), L("thSoTPct"), L("thGoals"), L("thGPerSh"), L("thShPer90")];
  const shRow = (p) => [p.player, p.club, p.shots, p.shotsOnTarget, f(p.sotPct, 1), f(p.goals), f(p.goalsPerShot, 2), f(p.shotsPer90, 2)];
  tbl(shHead, players.clinicalFinishers.map(shRow));
  h3(L("plWasteful", { shots: th.minShots }));
  tbl(shHead, players.wastefulShooters.map(shRow));
  h3(L("plPlusMinus", { min: th.minMinutes }));
  const pmHead = [L("thPlayer"), L("thClub"), L("thPos"), L("thMin"), L("thPlusMinus"), L("thPlusMinus90"), L("thOnOff")];
  const pmRow = (p) => [p.player, p.club, p.pos, f(p.minutes), signed(p.plusMinus, 0), signed(p.plusMinusPer90, 2), signed(p.onOff, 2)];
  tbl(pmHead, players.bestPlusMinus.map(pmRow));
  h3(L("plPlusMinusWorst", { min: th.minMinutes }));
  tbl(pmHead, players.worstPlusMinus.map(pmRow));
  h3(L("plSuperSub"));
  tbl([L("thPlayer"), L("thClub"), L("thSubGoals"), L("thMatches")], players.superSubs.map((p) => [p.player, p.club, p.subGoals, p.matches]));
  h3(L("plEverPresent"));
  tbl([L("thPlayer"), L("thClub"), L("thPos"), L("thMin")], players.everPresents.map((p) => [p.player, p.club, p.pos, f(p.minutes)]));
  h3(L("plYoung", { min: th.minMinutes }));
  const ageHead = [L("thPlayer"), L("thClub"), L("thPos"), L("thPlayerAge"), L("thMin"), L("thGoals"), L("thAssists")];
  const ageRow = (p) => [p.player, p.club, p.pos, f(p.age, 1), f(p.minutes), f(p.goals), f(p.assists)];
  tbl(ageHead, players.youngRegulars.map(ageRow));
  h3(L("plOld"));
  tbl(ageHead, players.oldestRegulars.map(ageRow));
  h3(L("plFouled"));
  tbl([L("thPlayer"), L("thClub"), L("thFouled"), L("thFouls"), L("thMin")], players.mostFouled.map((p) => [p.player, p.club, p.fouled, p.fouls, f(p.minutes)]));
  h3(L("plCards"));
  tbl([L("thPlayer"), L("thClub"), L("thCards"), L("thFouls"), L("thMin")], players.mostCards.map((p) => [p.player, p.club, `${f(p.yellow)}/${f(p.red)}`, p.fouls, f(p.minutes)]));
  h3(L("plTackles"));
  tbl([L("thPlayer"), L("thClub"), L("thPos"), L("thTkl"), L("thMin")], players.topTacklers.map((p) => [p.player, p.club, p.pos, p.tacklesWon, f(p.minutes)]));
  h3(L("plNations"));
  push(L("plNationsLine", { n: players.nationalities.total }));
  tbl([L("thNation"), L("thPlayers"), L("thMin"), L("thMinShare"), L("thGoals")], players.nationalities.byMinutes.map((n) => [n.nation, n.players, big(n.minutes), f(n.minutesShare, 1), n.goals]));

  // ---- Matches ---------------------------------------------------------------
  h2(L("secMatches"));
  const ms = matches.summary;
  push(L("mSummary", { n: ms.matches, goals: ms.goals, gpm: f(ms.goalsPerMatch, 2), draw: f(ms.drawPct, 1), bts: f(ms.bothScoredPct, 1), over: f(ms.over25Pct, 1), cs: f(ms.cleanSheetPct, 1), nil: f(ms.goallessPct, 1) }));
  const resHead = [L("thGW"), L("thDate"), L("thFixture"), L("thAttendance")];
  const resRow = (m) => [m.gameweek, m.date, `${m.home} ${m.homeScore}-${m.awayScore} ${m.away}`, big(m.attendance)];
  h3(L("mBiggest"));
  tbl(resHead, matches.biggestWins.map(resRow));
  h3(L("mHighest"));
  tbl(resHead, matches.highestScoring.map(resRow));
  h3(L("mScorelines"));
  tbl([L("thScoreline"), L("thCount"), L("thShare")], matches.scorelineFreq.map((s) => [s.scoreline, s.count, f(s.share, 1)]));
  h3(L("mGameweeks"));
  tbl([L("thGW"), L("thMatches"), L("thGF"), L("thPerMatch")], matches.gameweekGoals.map((g) => [g.gameweek, g.matches, g.goals, f(g.perMatch, 2)]));
  const tm = matches.timing;
  h3(L("mTiming"));
  push(L("mTimingLine", { fh: f(tm.firstHalfPct, 1), sh: f(tm.secondHalfPct, 1), st: tm.stoppageTimeGoals, stPct: f(tm.stoppageSharePct, 1), og: tm.ownGoals, pt: tm.penalties.taken, ps: tm.penalties.scored, pc: f(tm.penalties.conversionPct, 1) }));
  tbl([L("thPeriod"), L("thGF"), L("thShare")], tm.buckets.map((b) => [b.label, b.goals, `${f(b.share, 1)} ${bar(b.share)}`]));
  h3(L("mLate"));
  push(L("mLateLine", { w: tm.lateDecisive.winners, e: tm.lateDecisive.equalisers }));
  tbl([L("thGW"), L("thFixture"), L("thMinute"), L("thPlayer"), L("thClub"), L("thKind")], tm.lateDecisive.list.map((g) => [g.gameweek, g.fixture, g.minute, g.player, g.club, g.kind === "winner" ? L("kindWinner") : L("kindEqualiser")]));
  const cb = matches.comebacks;
  h3(L("mComebacks"));
  push(L("mComebackLine", { n: cb.total }));
  tbl([L("thGW"), L("thFixture"), L("thWinner"), L("thDeficit")], cb.list.map((c) => [c.gameweek, c.fixture, c.winner, c.deficit]));
  push(`**${L("mComebackTeams")}**`);
  tbl([L("thSquad"), L("thComebacks"), L("thPtsBehind")], cb.mostComebackWins.map((c) => [c.squad, c.comebackWins, c.ptsFromBehind]));
  push(`**${L("mPtsDropped")}**`);
  tbl([L("thSquad"), L("thDropped"), L("thBlown")], cb.mostPtsDropped.map((c) => [c.squad, c.ptsDroppedFromAhead, c.blownLeads]));
  const at = matches.attendance;
  h3(L("mAttendance"));
  push(L("mAttLine", { avg: big(at.average), total: big(at.total) }));
  push(`**${L("mAttBiggest")}**`);
  tbl([L("thGW"), L("thFixture"), L("thVenue"), L("thAttendance")], at.biggest.map((m) => [m.gameweek, `${m.home} ${m.homeScore}-${m.awayScore} ${m.away}`, m.venue, big(m.attendance)]));
  push(`**${L("mAttSmallest")}**`);
  tbl([L("thGW"), L("thFixture"), L("thVenue"), L("thAttendance")], at.smallest.map((m) => [m.gameweek, `${m.home} ${m.homeScore}-${m.awayScore} ${m.away}`, m.venue, big(m.attendance)]));
  push(`**${L("mAttClub")}**`);
  tbl([L("thSquad"), L("thAttendance")], at.byClub.map((c) => [c.squad, big(c.avgAttendance)]));

  // ---- Discipline & referees ---------------------------------------------------
  h2(L("secDiscipline"));
  const d = matches.discipline;
  push(L("dTotals", { y: d.totals.yellow, r: d.totals.red, f: big(d.totals.fouls) }));
  const dHead = [L("thSquad"), L("thRank"), L("thYellow"), L("thRed"), L("thCardPts"), L("thFouls"), L("thFouls90"), L("thFoulsPerCard"), L("thFouled")];
  const dRow = (x) => [x.squad, x.rank, x.yellow, x.red, x.cardPoints, x.fouls, f(x.foulsPer90, 1), f(x.foulsPerCard, 1), x.fouled];
  tbl(dHead, d.rows.map(dRow));
  push(`**${L("dFouls")}**`);
  tbl(dHead, d.mostFouls.map(dRow));
  push(`**${L("dFouled")}**`);
  tbl(dHead, d.mostFouled.map(dRow));
  h3(L("refTitle"));
  const rf = matches.referees;
  const rHead = [L("thReferee"), L("thMatches"), L("thYellow"), L("thRed"), L("thYPerMatch"), L("thFoulsPerMatch"), L("thPenalties")];
  const rRow = (x) => [x.referee, x.matches, x.yellow, x.red, f(x.yellowPerMatch, 2), f(x.foulsPerMatch, 1), x.penalties];
  push(`**${L("refStrict")}**`);
  tbl(rHead, rf.strictest.map(rRow));
  push(`**${L("refLenient")}**`);
  tbl(rHead, rf.mostLenient.map(rRow));
  push(`**${L("refPens")}**`);
  tbl(rHead, rf.mostPenalties.map(rRow));
  push(`**${L("refBusy")}**`);
  tbl(rHead, rf.busiest.map(rRow));

  // ---- Upcoming --------------------------------------------------------------
  if (upcoming.gameweek !== null) {
    h2(L("secUpcoming", { gw: upcoming.gameweek }));
    if (upcoming.pickOfTheRound) {
      const p = upcoming.pickOfTheRound;
      push(L("upPick", { home: p.home, hr: ord(p.homeRank), hf: p.homeForm ?? NA, away: p.away, ar: ord(p.awayRank), af: p.awayForm ?? NA }));
    }
    if (upcoming.sixPointers.length) {
      push(L("upSix"));
      push(upcoming.sixPointers.map((m) => `- ${m.home} (${ord(m.homeRank)}) vs ${m.away} (${ord(m.awayRank)})`).join("\n"));
    }
    tbl(
      [L("thDate"), L("thTime"), L("thHome"), L("thRankForm"), L("thAway"), L("thRankForm"), L("thVenue")],
      upcoming.matches.map((m) => [m.date, m.time, m.home, `${ord(m.homeRank)} / ${m.homeForm ?? NA}`, m.away, `${ord(m.awayRank)} / ${m.awayForm ?? NA}`, m.venue]),
    );
  }

  // ---- Latest AI reports -----------------------------------------------------
  if (reports?.length) {
    h2(L("secReports"));
    for (const rep of reports) {
      const title = lang === "ja" ? rep.titleJa ?? rep.titleEn : rep.titleEn ?? rep.titleJa;
      const excerpt = lang === "ja" ? rep.excerptJa ?? rep.excerptEn : rep.excerptEn ?? rep.excerptJa;
      const hl = lang === "ja" ? rep.highlightJa ?? rep.highlightEn : rep.highlightEn ?? rep.highlightJa;
      const links = [];
      if (hl) links.push(`[${L("repHighlight")}](${hl})`);
      push(`**${L("gwLabel", { gw: rep.gameweek })} · ${rep.fixture}**${title ? ` — ${title}` : ""}`);
      if (excerpt) push(`> ${excerpt.replace(/\s+/g, " ").trim()}`);
      if (links.length) push(links.join(" · "));
    }
  }

  // ---- Club focus --------------------------------------------------------------
  if (club && !club.notFound) {
    h2(L("secClub", { squad: club.squad }));
    const c = club;
    if (c.table) {
      push(L("clubTable", { rank: ord(c.table.rank), n: c.teamsInLeague, p: c.table.played, w: c.table.w, d: c.table.d, l: c.table.l, gf: c.table.gf, ga: c.table.ga, gd: signed(c.table.gd, 0), pts: c.table.pts, form: c.table.form }));
    }
    push(
      [
        L("clubHA", { hrec: c.homeAway.homeRecord, hppg: f(c.homeAway.homePpg, 2), hrank: ord(c.ranks.homePpg), arec: c.homeAway.awayRecord, appg: f(c.homeAway.awayPpg, 2), arank: ord(c.ranks.awayPpg) }),
        L("clubAttack", { goals: c.attack.goals, rank: ord(c.ranks.goals), shots: c.attack.shots, srank: ord(c.ranks.shots), sot: f(c.attack.sotPct, 1), gps: f(c.attack.goalsPerShot, 2), poss: f(c.attack.possession, 1), prank: ord(c.ranks.possession) }),
        L("clubDefence", { ga: c.defence.conceded, rank: ord(c.ranks.conceded), faced: c.defence.shotsFaced, frank: ord(c.ranks.shotsFaced), save: f(c.defence.savePct, 1), srank: ord(c.ranks.savePct), cs: c.defence.cleanSheets }),
        L("clubDiscipline", { y: c.discipline.yellow, r: c.discipline.red, f: c.discipline.fouls, rank: ord(c.ranks.cards) }),
        L("clubTiming", { ff: c.timing.for.firstHalf, fs: c.timing.for.secondHalf, fl: c.timing.for.last15, share: f(c.timing.last15SharePct, 1), af: c.timing.against.firstHalf, as: c.timing.against.secondHalf, al: c.timing.against.last15 }),
      ]
        .map((s) => `- ${s}`)
        .join("\n"),
    );
    const cHead = [L("thPlayer"), L("thPos"), L("thApps"), L("thStarts"), L("thMin"), L("thGoals"), L("thAssists"), L("thGAPer90")];
    const cRow = (p) => [p.player, p.pos, p.matches, p.starts, f(p.minutes), f(p.goals), f(p.assists), f(p.gaPer90, 2)];
    h3(L("clubScorers"));
    tbl(cHead, c.topScorers.map(cRow));
    h3(L("clubAssists"));
    tbl(cHead, c.topAssists.map(cRow));
    h3(L("clubOnOff"));
    tbl([L("thPlayer"), L("thPos"), L("thMin"), L("thPlusMinus90"), L("thOnOff")], c.bestOnOff.map((p) => [p.player, p.pos, f(p.minutes), signed(p.plusMinusPer90, 2), signed(p.onOff, 2)]));
    h3(L("clubResults"));
    tbl([L("thGW"), L("thDate"), L("thOpponent"), L("thHA"), L("thScore"), L("thResult")], c.results.map((m) => [m.gameweek, m.date, m.opponent, m.venue, `${m.gf}-${m.ga}`, m.result]));
    h3(L("clubUpcoming"));
    tbl([L("thGW"), L("thDate"), L("thOpponent"), L("thHA")], c.upcoming.map((m) => [m.gameweek, m.date, m.opponent, m.venue]));
  }

  // ---- Footer ----------------------------------------------------------------
  push("---");
  push(`_${L("footer")}_`);

  // Table of contents inserted after the title.
  out[tocIndex] = `**${L("toc")}**\n\n${sections.map((s) => `- [${s}](#${anchor(s)})`).join("\n")}`;
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** Tiny text bar for percentages (0-100). */
function bar(sharePct) {
  if (sharePct === null || sharePct === undefined) return "";
  const n = Math.round(sharePct / 4);
  return "█".repeat(n);
}
