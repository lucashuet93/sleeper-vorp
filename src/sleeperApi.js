const API_BASE_URL = 'https://api.sleeper.app/v1'
const FIRST_NFL_SEASON = 2017
const PLAYER_CACHE_TTL = 24 * 60 * 60 * 1000
const PLAYER_CACHE_NAME = 'sleeper-nfl-players-v1'
const PLAYER_URL = `${API_BASE_URL}/players/nfl`
const playerCaches = new WeakMap()

function isPlayerDirectory(players) {
  return players && typeof players === 'object' && !Array.isArray(players)
}

async function readPlayerCache() {
  try {
    const cache = await globalThis.caches.open(PLAYER_CACHE_NAME)
    const response = await cache.match(PLAYER_URL)
    if (!response) return null
    const savedAt = Number(response.headers.get('x-sleeper-cached-at'))
    const age = Date.now() - savedAt
    if (!savedAt || age < 0 || age >= PLAYER_CACHE_TTL) return null
    const players = await response.json()
    return isPlayerDirectory(players) ? { players, savedAt } : null
  } catch {
    return null
  }
}

async function writePlayerCache(players, savedAt) {
  try {
    const cache = await globalThis.caches.open(PLAYER_CACHE_NAME)
    await cache.put(PLAYER_URL, new Response(JSON.stringify(players), {
      headers: { 'x-sleeper-cached-at': String(savedAt) },
    }))
  } catch {
    // Cache storage can be unavailable or full; keep the in-memory copy.
  }
}

async function fetchPlayers(fetchImpl) {
  let state = playerCaches.get(fetchImpl)
  if (!state) {
    state = {}
    playerCaches.set(fetchImpl, state)
  }
  const age = Date.now() - state.savedAt
  if (state.players && age >= 0 && age < PLAYER_CACHE_TTL) return state.players
  if (state.inFlight) return state.inFlight

  state.inFlight = (async () => {
    const cached = fetchImpl === globalThis.fetch ? await readPlayerCache() : null
    if (cached) {
      Object.assign(state, cached)
      return cached.players
    }

    const players = await fetchJson(PLAYER_URL, fetchImpl)
    if (!isPlayerDirectory(players)) throw new Error('request_failed')
    state.players = players
    state.savedAt = Date.now()
    if (fetchImpl === globalThis.fetch) await writePlayerCache(players, state.savedAt)
    return players
  })()

  try {
    return await state.inFlight
  } finally {
    state.inFlight = null
  }
}

async function fetchJson(url, fetchImpl, notFoundError = 'request_failed') {
  let response
  try {
    response = await fetchImpl(url)
  } catch {
    throw new Error('request_failed')
  }

  if (response.status === 429) {
    throw new Error('rate_limited')
  }
  if (response.status === 404) {
    throw new Error(notFoundError)
  }
  if (!response.ok) {
    throw new Error('request_failed')
  }

  try {
    return await response.json()
  } catch {
    throw new Error('request_failed')
  }
}

export async function fetchLeaguesForUsername(username, fetchImpl = fetch) {
  const user = await fetchJson(
    `${API_BASE_URL}/user/${encodeURIComponent(username)}`,
    fetchImpl,
    'user_not_found',
  )

  if (!user?.user_id) {
    throw new Error('user_not_found')
  }

  const currentSeason = new Date().getFullYear()
  const seasons = Array.from(
    { length: currentSeason - FIRST_NFL_SEASON + 1 },
    (_, index) => String(currentSeason - index),
  )
  const leagueLists = await Promise.all(
    seasons.map(async (season) => {
      return fetchJson(
        `${API_BASE_URL}/user/${user.user_id}/leagues/nfl/${season}`,
        fetchImpl,
      )
    }),
  )

  const leagueRecords = leagueLists.flat()
  const recordsById = new Map(
    leagueRecords.map((league) => [league.league_id, league]),
  )
  const leagues = new Map()

  function getRenewalRootId(league) {
    let current = league
    const visited = new Set()
    while (current.previous_league_id && !visited.has(current.league_id)) {
      visited.add(current.league_id)
      const previous = recordsById.get(current.previous_league_id)
      if (!previous) {
        return current.previous_league_id
      }
      current = previous
    }
    return current.league_id
  }

  leagueRecords.forEach((league) => {
    const renewalRootId = getRenewalRootId(league)
    const existing = leagues.get(renewalRootId)
    const season = { season: league.season, league_id: league.league_id }
    if (existing) {
      existing.seasons.push(season)
    } else {
      leagues.set(renewalRootId, {
        ...league,
        league_id: renewalRootId,
        seasons: [season],
      })
    }
  })

  return [...leagues.values()]
    .map((league) => ({
      ...league,
      seasons: [
        ...new Map(
          league.seasons.map((season) => [season.season, season]),
        ).values(),
      ].sort((left, right) => Number(right.season) - Number(left.season)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

export async function fetchLeagueData(leagueId, fetchImpl = fetch) {
  const league = await fetchJson(
    `${API_BASE_URL}/league/${encodeURIComponent(leagueId)}`,
    fetchImpl,
    'league_not_found',
  )

  if (!league) {
    throw new Error('league_not_found')
  }
  if (typeof league !== 'object' || Array.isArray(league)) {
    throw new Error('request_failed')
  }

  const nflState = await fetchJson(`${API_BASE_URL}/state/nfl`, fetchImpl)
  if (
    typeof league.season !== 'string' || !/^\d{4}$/.test(league.season) ||
    typeof nflState?.season !== 'string' || !/^\d{4}$/.test(nflState.season)
  ) {
    throw new Error('request_failed')
  }
  if (league.season !== nflState.season) {
    throw new Error('unsupported_season')
  }

  const [users, rosters, playerDirectory] = await Promise.all([
    fetchJson(`${API_BASE_URL}/league/${encodeURIComponent(leagueId)}/users`, fetchImpl),
    fetchJson(`${API_BASE_URL}/league/${encodeURIComponent(leagueId)}/rosters`, fetchImpl),
    fetchPlayers(fetchImpl),
  ])

  if (
    !Array.isArray(users) ||
    !Array.isArray(rosters) ||
    !isPlayerDirectory(playerDirectory)
  ) {
    throw new Error('request_failed')
  }

  const usersById = new Map(users.map((user) => [user.user_id, user]))
  const teams = rosters.map((roster) => ({
    ...roster,
    owner: usersById.get(roster.owner_id) ?? null,
  }))

  return { league, users, rosters, teams, playerDirectory, players: playerDirectory, playerPool: null }
}
