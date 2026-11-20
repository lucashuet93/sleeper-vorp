const API_BASE_URL = 'https://api.sleeper.app/v1'
const FIRST_NFL_SEASON = 2017

export async function fetchLeaguesForUsername(username, fetchImpl = fetch) {
  const userResponse = await fetchImpl(
    `${API_BASE_URL}/user/${encodeURIComponent(username)}`,
  )

  if (userResponse.status === 404) {
    throw new Error('user_not_found')
  }
  if (!userResponse.ok) {
    throw new Error('request_failed')
  }

  const user = await userResponse.json()
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
      const response = await fetchImpl(
        `${API_BASE_URL}/user/${user.user_id}/leagues/nfl/${season}`,
      )
      if (!response.ok) {
        throw new Error('request_failed')
      }
      return response.json()
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
