# sleeper-vorp

This repository is managed by Software Factory.

## Getting started

Install Node.js 24 and run:

```sh
npm ci
npm start
```

Open the local URL printed by Vite.

Run the test suite with `npm test` and create a production build with `npm run build`.

## Loading league data

After a user selects a league and season, Continue loads the selected season's
league ID. `fetchLeagueData` in `src/sleeperApi.js` is also available to
downstream components:

```js
const data = await fetchLeagueData(leagueId, season, { signal })
const { league, scoringSettings, rosterSettings, users, rosters, players } = data
```

`league` is the Sleeper league record, including `name`, `season`, and
`total_rosters` (number of teams). `scoringSettings` is its
`scoring_settings` object; `rosterSettings` is the `roster_positions` array,
including bench and starter slots such as `SUPER_FLEX`. `users` and `rosters`
are the selected league's Sleeper records, linked by `user_id` / `owner_id`.
`players` is Sleeper's NFL player directory keyed by player ID, with each player
annotated with `rosterStatus` (`rostered` or `free_agent`) and `roster`. A
rostered player's `roster` contains its `rosterId`, `ownerId`, and matching
`owner` user record (or `null` if no owner record is available); a free agent's
`roster` is `null`. Active roster, reserve, and taxi player IDs are treated as
rostered. `playerDirectory` is an alias of this same labeled object. It is an ID
lookup for the current NFL season, not a historical eligibility list or a
guarantee that every listed player is eligible for a particular calculation.

The current season is identified by Sleeper's `/state/nfl` `season`, rather
than the calendar year. For another season, the service fetches the selected
league, users and rosters when available, but rejects with `unsupported_season`:
Sleeper's global directory does not establish historical player eligibility.
The directory is shared in memory per season for the browser session, including
in-flight loads; failures and empty directories are not cached. Individual
callers can cancel their load without aborting a shared directory download.

Errors are `Error` objects with these `message` codes:

- `league_not_found`: the selected league does not exist.
- `unsupported_season`: no season-appropriate player pool is available.
- `network_error`: a network failure or a 15-second request timeout.
- `request_failed`: an HTTP error, invalid response, empty player directory,
  or a league whose season does not match the selection.
- `request_cancelled`: the supplied abort signal was triggered.

The loaded object is also exposed to descendants of `App` through the exported
`LeagueDataContext`: use `useContext(LeagueDataContext)` to access it. Its value
is `null` until loading succeeds and is cleared when the selection changes.
Changing the username or selection invalidates pending loads so old results
cannot replace the new selection.

## Calculating VORS

`calculateVors` in `src/vors.js` accepts a player directory, the league's
`rosterSettings`, and `total_rosters`. Each player needs a supported `position`
and numeric `projectedPoints` value. It returns the directory with a `vors`
value on each player, plus `replacementBaselines` for QB, RB, WR, TE, and K.
The baseline is the projected score of the first player outside the
league-wide starter count for that position; a baseline is `null` when the
league has no starter slots for the position or the player pool is too small.
Repeated QB slots and `SUPER_FLEX` slots count toward QB starters, while
eligible FLEX slots count toward RB, WR, and TE starters.
