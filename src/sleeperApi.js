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

  const leagues = new Map()
  leagueLists.flat().forEach((league) => {
    const existing = leagues.get(league.league_id)
    if (existing) {
      existing.seasons.push(league.season)
    } else {
      leagues.set(league.league_id, {
        ...league,
        seasons: [league.season],
      })
    }
  })

  return [...leagues.values()]
    .map((league) => ({
      ...league,
      seasons: [...new Set(league.seasons)].sort(
        (left, right) => Number(right) - Number(left),
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
}
