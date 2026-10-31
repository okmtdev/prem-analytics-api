import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { analyze } from "../src/analysis/index.js";
import { comebacks, goalTiming } from "../src/analysis/matches.js";
import { superSubs } from "../src/analysis/players.js";
import { renderMarkdown } from "../src/render/markdown.js";

const data = JSON.parse(readFileSync(new URL("./fixtures/season-sample.json", import.meta.url), "utf8"));

test("analyze() produces every section with consistent meta", () => {
  const insights = analyze(data, { now: new Date("2026-10-31T00:00:00Z") });
  assert.equal(insights.meta.season, "26/27");
  assert.equal(insights.meta.teams, 20);
  assert.equal(insights.meta.matchesPlayed, data.fixtures.filter((f) => f.is_played).length);
  for (const key of ["table", "homeAway", "attack", "defence", "goalkeepers", "possession", "players", "matches", "upcoming", "reports"]) {
    assert.ok(insights[key], `missing section ${key}`);
  }
  assert.equal(insights.club, null);
});

test("league table is ordered by rank and title race is derived from it", () => {
  const { table } = analyze(data);
  assert.deepEqual(
    table.rows.map((r) => r.rank),
    table.rows.map((_, i) => i + 1),
  );
  assert.equal(table.titleRace.leader, table.rows[0].squad);
  assert.equal(table.titleRace.gapToSecond, table.rows[0].pts - table.rows[1].pts);
  assert.equal(table.relegation.length, 3);
  assert.ok(table.gdModel.overPerformers[0].diff >= table.gdModel.underPerformers[0].diff);
});

test("home/away league split sums to 100%", () => {
  const { homeAway } = analyze(data);
  const total = homeAway.league.homeWinPct + homeAway.league.drawPct + homeAway.league.awayWinPct;
  assert.ok(Math.abs(total - 100) < 0.2, `got ${total}`);
  assert.equal(homeAway.league.matches, data.fixtures.length);
});

test("goal timing buckets add up to the number of goals", () => {
  const timing = goalTiming(data.matchEvents);
  const goals = data.matchEvents.filter((e) => ["goal", "penalty_goal", "own_goal"].includes(e.event_type)).length;
  assert.equal(timing.total, goals);
  assert.equal(timing.buckets.reduce((a, b) => a + b.goals, 0), goals);
  assert.equal(timing.buckets.length, 6);
});

test("comebacks are detected from goal order", () => {
  const events = [
    { match_id: "m1", date: "2026-01-01", gameweek: 1, home_team: "A", away_team: "B", home_score: 2, away_score: 1, side: "away", minute: "10", event_type: "goal", player: "x" },
    { match_id: "m1", date: "2026-01-01", gameweek: 1, home_team: "A", away_team: "B", home_score: 2, away_score: 1, side: "home", minute: "45+2", event_type: "penalty_goal", player: "y" },
    { match_id: "m1", date: "2026-01-01", gameweek: 1, home_team: "A", away_team: "B", home_score: 2, away_score: 1, side: "home", minute: "88", event_type: "goal", player: "z" },
    // Second match: B led, A equalised late -> B dropped 2 points.
    { match_id: "m2", date: "2026-01-08", gameweek: 2, home_team: "B", away_team: "A", home_score: 1, away_score: 1, side: "home", minute: "5", event_type: "goal", player: "x" },
    { match_id: "m2", date: "2026-01-08", gameweek: 2, home_team: "B", away_team: "A", home_score: 1, away_score: 1, side: "away", minute: "90+3", event_type: "own_goal", player: "w" },
  ];
  const res = comebacks(events, [{ squad: "A" }, { squad: "B" }]);
  assert.equal(res.total, 1);
  assert.equal(res.list[0].winner, "A");
  assert.equal(res.list[0].deficit, 1);
  const a = res.mostPtsFromBehind.find((r) => r.squad === "A");
  assert.equal(a.ptsFromBehind, 4); // 3 from m1 + 1 from m2
  const b = res.mostPtsDropped.find((r) => r.squad === "B");
  assert.equal(b.ptsDroppedFromAhead, 5); // led in m1 (lost: 3) and m2 (drew: 2)
  assert.equal(b.blownLeads, 2);
});

test("super-subs only count goals scored after coming on", () => {
  const events = [
    { match_id: "m1", home_team: "A", away_team: "B", side: "home", minute: "60", event_type: "substitute_in", player: "Sub", secondary_player: "Starter" },
    { match_id: "m1", home_team: "A", away_team: "B", side: "home", minute: "75", event_type: "goal", player: "Sub" },
    { match_id: "m1", home_team: "A", away_team: "B", side: "home", minute: "20", event_type: "goal", player: "Starter" },
    { match_id: "m2", home_team: "C", away_team: "A", side: "away", minute: "80", event_type: "substitute_in", player: "Sub", secondary_player: "Other" },
    { match_id: "m2", home_team: "C", away_team: "A", side: "away", minute: "70", event_type: "goal", player: "Sub" }, // before coming on: ignored
  ];
  const res = superSubs(events);
  assert.deepEqual(res, [{ player: "Sub", club: "A", subGoals: 1, matches: 1 }]);
});

test("club focus resolves partial names and ranks within the league", () => {
  const { club } = analyze(data, { club: "arsenal" });
  assert.equal(club.squad, "Arsenal");
  assert.ok(club.table.rank >= 1 && club.table.rank <= 20);
  assert.ok(club.ranks.goals >= 1 && club.ranks.goals <= 20);
  assert.ok(club.topScorers.length > 0);
  const missing = analyze(data, { club: "Nowhere FC" }).club;
  assert.equal(missing.notFound, "Nowhere FC");
});

test("markdown renders in both languages without unresolved placeholders", () => {
  const insights = analyze(data, { club: "Brighton" });
  for (const lang of ["ja", "en"]) {
    const md = renderMarkdown(insights, { lang });
    assert.ok(md.startsWith("# "), "starts with a title");
    assert.ok(!/\{[a-zA-Z]+\}/.test(md), `unresolved placeholder in ${lang}`);
    assert.ok(md.includes("Brighton"));
    assert.ok(md.split("\n## ").length > 10, "has many sections");
  }
});
