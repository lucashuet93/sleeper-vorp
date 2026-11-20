const API_BASE_URL = 'https://api.sleeper.app/v1'
const FIRST_NFL_SEASON = 2017

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
  const [league, users, rosters, players] = await Promise.all([
    fetchJson(`${API_BASE_URL}/league/${encodeURIComponent(leagueId)}`, fetchImpl, 'league_not_found'),
    fetchJson(`${API_BASE_URL}/league/${encodeURIComponent(leagueId)}/users`, fetchImpl),
    fetchJson(`${API_BASE_URL}/league/${encodeURIComponent(leagueId)}/rosters`, fetchImpl),
    fetchJson(`${API_BASE_URL}/players/nfl`, fetchImpl),
  ])

  if (
    !league ||
    typeof league !== 'object' ||
    !Array.isArray(users) ||
    !Array.isArray(rosters) ||
    !players ||
    typeof players !== 'object' ||
    Array.isArray(players)
  ) {
    throw new Error('request_failed')
  }

  const usersById = new Map(users.map((user) => [user.user_id, user]))
  const teams = rosters.map((roster) => ({
    ...roster,
    owner: usersById.get(roster.owner_id) ?? null,
  }))

  return { league, users, rosters, teams, players }
}
