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

The Sleeper player directory is cached for up to 24 hours and returned as
`playerDirectory` (also available as `players`) for ID lookup. It is not a season-specific player pool:
Sleeper's documented player endpoint does not provide historical eligibility.
`playerPool` is `null` because season-specific eligibility is unavailable even for the current
season. `fetchLeagueData` rejects seasons other than Sleeper's current NFL season with
`unsupported_season`, rather than treating the directory as a historical pool.
