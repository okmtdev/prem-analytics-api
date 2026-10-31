// Turns the raw datasets into a language-neutral "insights" object.
// Rendering (Markdown, JSON) lives in ../render.

import { analyzeAttack, analyzeDefence, analyzeGoalkeepers, analyzePossession } from "./teams.js";
import { analyzeClub } from "./club.js";
import { analyzeMatches } from "./matches.js";
import { analyzePlayers } from "./players.js";
import { analyzeHomeAway, analyzeTable } from "./table.js";
import { analyzeUpcoming, latestReports } from "./upcoming.js";

/**
 * @param {Awaited<ReturnType<import("../data.js").loadSeasonData>>} data
 * @param {{ club?: string|null, now?: Date }} [opts]
 */
export function analyze(data, { club = null, now = new Date() } = {}) {
  const played = data.fixtures.filter((f) => f.is_played);
  const gameweeks = played.map((f) => f.gameweek).filter((g) => g !== null);
  const dates = played.map((f) => f.date).filter(Boolean).sort();
  return {
    meta: {
      season: data.season,
      generatedAt: now.toISOString(),
      dataFetchedAt: data.fetchedAt,
      teams: data.leagueTable.length,
      matchesPlayed: played.length,
      gameweeksPlayed: gameweeks.length ? Math.max(...gameweeks) : 0,
      firstMatchDate: dates[0] ?? null,
      lastMatchDate: dates[dates.length - 1] ?? null,
      source: "PremAnalytics Web API (https://premianalytics.com)",
    },
    table: analyzeTable(data),
    homeAway: analyzeHomeAway(data),
    attack: analyzeAttack(data),
    defence: analyzeDefence(data),
    goalkeepers: analyzeGoalkeepers(data),
    possession: analyzePossession(data),
    players: analyzePlayers(data),
    matches: analyzeMatches(data),
    upcoming: analyzeUpcoming(data),
    reports: latestReports(data),
    club: club ? analyzeClub(data, club) : null,
  };
}
