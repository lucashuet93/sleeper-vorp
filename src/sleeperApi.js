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

const REQUEST_TIMEOUT_MS = 15000
const playerDirectories = new WeakMap()

function requestError(code) {
  return new Error(code)
}

async function requestJson(url, fetchImpl, { signal, league = false } = {}) {
  if (signal?.aborted) throw requestError('request_cancelled')

  const controller = new AbortController()
  let timeout
  let onAbort
  const interrupted = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort()
      reject(requestError('network_error'))
    }, REQUEST_TIMEOUT_MS)
    onAbort = () => {
      controller.abort()
      reject(requestError('request_cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })

  try {
    return await Promise.race([
      (async () => {
        let response
        try {
          response = await fetchImpl(url, { signal: controller.signal })
        } catch {
          throw requestError('network_error')
        }
        if (league && response.status === 404) {
          throw requestError('league_not_found')
        }
        if (!response.ok) throw requestError('request_failed')
        try {
          return await response.json()
        } catch {
          throw requestError('request_failed')
        }
      })(),
      interrupted,
    ])
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
  }
}

function getPlayerDirectory(fetchImpl) {
  let request = playerDirectories.get(fetchImpl)
  if (!request) {
    request = requestJson(`${API_BASE_URL}/players/nfl`, fetchImpl)
      .then((players) => {
        if (!players || typeof players !== 'object' || Array.isArray(players) ||
            Object.keys(players).length === 0) {
          throw requestError('request_failed')
        }
        return players
      })
      .catch((error) => {
        playerDirectories.delete(fetchImpl)
        throw error
      })
    playerDirectories.set(fetchImpl, request)
  }
  return request
}

async function waitForPlayerDirectory(fetchImpl, signal) {
  if (!signal) return getPlayerDirectory(fetchImpl)
  if (signal.aborted) throw requestError('request_cancelled')
  let onAbort
  const cancelled = new Promise((_, reject) => {
    onAbort = () => reject(requestError('request_cancelled'))
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([getPlayerDirectory(fetchImpl), cancelled])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

export async function fetchLeagueData(leagueId, season, { fetchImpl = fetch, signal } = {}) {
  const leagueUrl = `${API_BASE_URL}/league/${encodeURIComponent(leagueId)}`
  const league = await requestJson(leagueUrl, fetchImpl, { signal, league: true })
  if (!league || !league.league_id) throw requestError('league_not_found')
  if (String(league.league_id) !== String(leagueId) ||
      String(league.season) !== String(season)) throw requestError('request_failed')
  if (signal?.aborted) throw requestError('request_cancelled')

  const [state, users, rosters] = await Promise.all([
    requestJson(`${API_BASE_URL}/state/nfl`, fetchImpl, { signal }),
    requestJson(`${leagueUrl}/users`, fetchImpl, { signal }),
    requestJson(`${leagueUrl}/rosters`, fetchImpl, { signal }),
  ])
  if (signal?.aborted) throw requestError('request_cancelled')
  if (!state?.season) throw requestError('request_failed')
  // The global directory has no historical eligibility information.
  if (String(state.season) !== String(season)) throw requestError('unsupported_season')
  if (!Array.isArray(users) || !Array.isArray(rosters)) throw requestError('request_failed')

  const players = await waitForPlayerDirectory(fetchImpl, signal)
  if (signal?.aborted) throw requestError('request_cancelled')
  return {
    league,
    scoringSettings: league.scoring_settings ?? {},
    rosterSettings: league.roster_positions ?? [],
    users,
    rosters,
    players,
    playerDirectory: players,
  }
}
