// Collects every dataset the report needs. One API request per dataset
// (16 requests for a full report; the client's disk cache makes re-runs free).

/** @typedef {import("./client.js").PremAnalyticsClient} PremAnalyticsClient */

/**
 * @param {PremAnalyticsClient} client
 * @param {{ season?: string, includeReports?: boolean }} opts
 */
export async function loadSeasonData(client, { season, includeReports = true } = {}) {
  // Requests are issued sequentially on purpose: it keeps us well inside the
  // per-minute rate limit and makes the log easy to follow.
  const data = {
    season: season ?? null,
    fetchedAt: new Date().toISOString(),
    leagueTable: await client.leagueTable(season),
    homeAway: await client.leagueTableHomeAway(season),
    squadStandard: await client.squad("standard-stats", season),
    squadShooting: await client.squad("shooting", season),
    squadGoalkeeping: await client.squad("goalkeeping", season),
    squadMisc: await client.squad("misc-stats", season),
    opponentShooting: await client.opponent("shooting", season),
    playerStandard: await client.players("standard-stats", { season }),
    playerShooting: await client.players("shooting", { season }),
    playerPlayingTime: await client.players("playing-time", { season }),
    playerMisc: await client.players("misc-stats", { season }),
    goalkeepers: await client.players("goalkeeper-stats", { season }),
    fixtures: await client.fixtures({ season }),
    schedules: await client.schedules({ season }),
    matchTeamStats: await client.matchTeamStats({ season }),
    matchEvents: await client.matchEvents({ season }),
    postmatchReports: [],
  };

  if (includeReports) {
    try {
      data.postmatchReports = await client.postmatchReports({ season, limit: 5 });
    } catch (err) {
      // Reports are a nice-to-have; never fail the whole run because of them.
      client.log(`post-match reports unavailable: ${err.message}`);
    }
  }

  if (!data.season) {
    data.season = data.leagueTable?.[0]?.season ?? null;
  }
  return data;
}

/** Datasets and the endpoint behind each one, for the README / --help text. */
export const DATASET_ENDPOINTS = {
  leagueTable: "league-table/overall",
  homeAway: "league-table/home-away",
  squadStandard: "squad/standard-stats",
  squadShooting: "squad/shooting",
  squadGoalkeeping: "squad/goalkeeping",
  squadMisc: "squad/misc-stats",
  opponentShooting: "opponent/shooting",
  playerStandard: "team/standard-stats",
  playerShooting: "team/shooting",
  playerPlayingTime: "team/playing-time",
  playerMisc: "team/misc-stats",
  goalkeepers: "team/goalkeeper-stats",
  fixtures: "matches/fixtures",
  schedules: "matches/schedules",
  matchTeamStats: "matches/team-stats",
  matchEvents: "matches/events",
  postmatchReports: "reports/postmatch",
};
