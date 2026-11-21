import { fetchLeagueData } from './sleeperApi.js'

const base = 'https://api.sleeper.app/v1'
const season = '2025'
const league = {
  league_id: '123',
  name: 'League',
  season,
  total_rosters: 12,
  scoring_settings: { pass_td: 4 },
  roster_positions: ['QB', 'SUPER_FLEX', 'BN'],
}

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function mockApi(overrides = {}) {
  return jest.fn((url) => {
    const data = {
      [`${base}/league/123`]: league,
      [`${base}/league/123/users`]: [{ user_id: 'owner' }],
      [`${base}/league/123/rosters`]: [{ owner_id: 'owner', players: ['p1'] }],
      [`${base}/state/nfl`]: { season },
      [`${base}/players/nfl`]: { p1: { player_id: 'p1', position: 'QB' } },
      ...overrides,
    }
    return Promise.resolve(response(data[url]))
  })
}

test('returns selected league settings, owners, rosters and the labeled player directory', async () => {
  const fetchImpl = mockApi()
  const data = await fetchLeagueData('123', season, { fetchImpl })
  expect(data).toEqual({
    league,
    scoringSettings: { pass_td: 4 },
    rosterSettings: ['QB', 'SUPER_FLEX', 'BN'],
    users: [{ user_id: 'owner' }],
    rosters: [{ owner_id: 'owner', players: ['p1'] }],
    players: {
      p1: {
        player_id: 'p1',
        position: 'QB',
        rosterStatus: 'rostered',
        roster: {
          rosterId: null,
          ownerId: 'owner',
          owner: { user_id: 'owner' },
        },
      },
    },
    playerDirectory: {
      p1: {
        player_id: 'p1',
        position: 'QB',
        rosterStatus: 'rostered',
        roster: {
          rosterId: null,
          ownerId: 'owner',
          owner: { user_id: 'owner' },
        },
      },
    },
  })
  expect(data.players).toBe(data.playerDirectory)
})

test('fresh loads refetch the directory and season performance without using the shared cache', async () => {
  let version = 0
  const fetchImpl = mockApi()
  const normal = fetchImpl.getMockImplementation()
  fetchImpl.mockImplementation((url, options) => {
    if (url.endsWith('/players/nfl')) {
      version += 1
      return Promise.resolve(response({ p1: { position: 'QB', full_name: `Player ${version}` } }))
    }
    if (url === `https://api.sleeper.com/stats/nfl/${season}?season_type=regular`) {
      return Promise.resolve(response([{ player_id: 'p1', stats: { pass_td: version } }]))
    }
    return normal(url, options)
  })

  await fetchLeagueData('123', season, { fetchImpl })
  const first = await fetchLeagueData('123', season, { fetchImpl, fresh: true })
  const second = await fetchLeagueData('123', season, { fetchImpl, fresh: true })
  expect(first.players.p1).toMatchObject({ full_name: 'Player 2', stats: { pass_td: 2 }, rosterStatus: 'rostered' })
  expect(second.players.p1).toMatchObject({ full_name: 'Player 3', stats: { pass_td: 3 } })
  expect(second.playerDirectory).toBe(second.players)
  expect(fetchImpl.mock.calls.filter(([url]) => url.includes('/stats/nfl/'))).toHaveLength(2)
})

test('a failed or invalid season statistics response fails the fresh load', async () => {
  for (const result of [
    response(null, 503),
    response({ invalid: true }),
    response([{ message: 'unavailable' }]),
    response([{ player_id: 'p1', stats: { pass_yd: 'invalid' } }]),
    response([{ player_id: 'unknown', stats: { pass_yd: 100 } }]),
    response([{ player_id: 'p1', stats: { pass_yd: null, pass_td: '0' } }]),
    response([{ player_id: 'p1', stats: { pass_yd: 100 } }, { player_id: 'p1', stats: {} }]),
  ]) {
    const fetchImpl = mockApi()
    const normal = fetchImpl.getMockImplementation()
    fetchImpl.mockImplementation((url, options) => url.includes('/stats/nfl/')
      ? Promise.resolve(result)
      : normal(url, options))
    await expect(fetchLeagueData('123', season, { fetchImpl, fresh: true })).rejects.toThrow('request_failed')
  }
})

test('fresh loads accept empty statistics and finite statistics for a matching player', async () => {
  for (const performance of [
    [],
    [{ player_id: 'unknown', stats: { pass_yd: 'invalid' } }, { player_id: 'p1', stats: { pass_yd: 0 } }],
  ]) {
    const fetchImpl = mockApi()
    const normal = fetchImpl.getMockImplementation()
    fetchImpl.mockImplementation((url, options) => url.includes('/stats/nfl/')
      ? Promise.resolve(response(performance))
      : normal(url, options))
    const data = await fetchLeagueData('123', season, { fetchImpl, fresh: true })
    if (performance.length) expect(data.players.p1.stats).toEqual({ pass_yd: 0 })
  }
})

test('labels rostered players with their owner and marks all other players as free agents', async () => {
  const owner = { user_id: 'owner-1', display_name: 'Team Owner' }
  const fetchImpl = mockApi({
    [`${base}/league/123/users`]: [owner],
    [`${base}/league/123/rosters`]: [{
      roster_id: 7,
      owner_id: owner.user_id,
      players: ['p1'],
      reserve: ['p2'],
      taxi: ['p3'],
    }],
    [`${base}/players/nfl`]: {
      p1: { player_id: 'p1', position: 'QB' },
      p2: { player_id: 'p2', position: 'RB' },
      p3: { player_id: 'p3', position: 'WR' },
      p4: { player_id: 'p4', position: 'TE' },
    },
  })

  const { players, playerDirectory } = await fetchLeagueData('123', season, { fetchImpl })

  expect(players).toEqual({
    p1: {
      player_id: 'p1',
      position: 'QB',
      rosterStatus: 'rostered',
      roster: { rosterId: 7, ownerId: 'owner-1', owner },
    },
    p2: {
      player_id: 'p2',
      position: 'RB',
      rosterStatus: 'rostered',
      roster: { rosterId: 7, ownerId: 'owner-1', owner },
    },
    p3: {
      player_id: 'p3',
      position: 'WR',
      rosterStatus: 'rostered',
      roster: { rosterId: 7, ownerId: 'owner-1', owner },
    },
    p4: {
      player_id: 'p4',
      position: 'TE',
      rosterStatus: 'free_agent',
      roster: null,
    },
  })
  expect(playerDirectory).toBe(players)
})

test('loads available historical league data but rejects the global player pool', async () => {
  const fetchImpl = mockApi({ [`${base}/state/nfl`]: { season: '2026' } })
  await expect(fetchLeagueData('123', season, { fetchImpl })).rejects.toThrow('unsupported_season')
  expect(fetchImpl).toHaveBeenCalledWith(`${base}/league/123/users`, expect.anything())
  expect(fetchImpl).toHaveBeenCalledWith(`${base}/league/123/rosters`, expect.anything())
  expect(fetchImpl.mock.calls.some(([url]) => url.endsWith('/players/nfl'))).toBe(false)
})

test('a missing or mismatched league never starts dependent requests', async () => {
  const missing = jest.fn().mockResolvedValue(response(null, 404))
  await expect(fetchLeagueData('123', season, { fetchImpl: missing })).rejects.toThrow('league_not_found')
  expect(missing).toHaveBeenCalledTimes(1)
  const mismatch = mockApi()
  await expect(fetchLeagueData('123', '2024', { fetchImpl: mismatch })).rejects.toThrow('request_failed')
  expect(mismatch).toHaveBeenCalledTimes(1)
})

test('does not start dependent requests after a base request is abandoned', async () => {
  const pending = deferred()
  const fetchImpl = jest.fn(() => pending.promise)
  const controller = new AbortController()
  const result = fetchLeagueData('123', season, { fetchImpl, signal: controller.signal })
  controller.abort()
  pending.resolve(response(league))
  await expect(result).rejects.toThrow('request_cancelled')
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})

test('normalizes network, HTTP and timeout failures', async () => {
  await expect(fetchLeagueData('123', season, { fetchImpl: jest.fn().mockRejectedValue(new TypeError()) }))
    .rejects.toThrow('network_error')
  await expect(fetchLeagueData('123', season, { fetchImpl: jest.fn().mockResolvedValue(response(null, 503)) }))
    .rejects.toThrow('request_failed')
  jest.useFakeTimers()
  try {
    const result = fetchLeagueData('123', season, { fetchImpl: jest.fn(() => new Promise(() => {})) })
    const assertion = expect(result).rejects.toThrow('network_error')
    jest.advanceTimersByTime(15000)
    await assertion
  } finally {
    jest.useRealTimers()
  }
})

test('shares in-flight and completed player downloads across leagues and retries', async () => {
  const pending = deferred()
  let failUsers = false
  const fetchImpl = jest.fn((url) => {
    if (url.endsWith('/players/nfl')) return pending.promise
    if (url.endsWith('/state/nfl')) return Promise.resolve(response({ season }))
    if (url.endsWith('/users')) return Promise.resolve(response([], failUsers ? 503 : 200))
    if (url.endsWith('/rosters')) return Promise.resolve(response([]))
    return Promise.resolve(response({ ...league, league_id: url.split('/').pop() }))
  })
  const first = fetchLeagueData('123', season, { fetchImpl })
  const second = fetchLeagueData('456', season, { fetchImpl })
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  pending.resolve(response({ p1: { name: 'x'.repeat(2 * 1024 * 1024) } }))
  await Promise.all([first, second])
  failUsers = true
  await expect(fetchLeagueData('123', season, { fetchImpl })).rejects.toThrow('request_failed')
  failUsers = false
  await fetchLeagueData('123', season, { fetchImpl })
  expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/players/nfl'))).toHaveLength(1)
})

test('refreshes the directory after a season transition and shares the new download', async () => {
  let currentSeason = season
  const pending = deferred()
  const started = deferred()
  const fetchImpl = jest.fn((url) => {
    if (url.endsWith('/players/nfl')) {
      if (currentSeason === season) return Promise.resolve(response({ old: {} }))
      started.resolve()
      return pending.promise
    }
    if (url.endsWith('/state/nfl')) return Promise.resolve(response({ season: currentSeason }))
    if (url.endsWith('/users') || url.endsWith('/rosters')) return Promise.resolve(response([]))
    return Promise.resolve(response({ ...league, season: currentSeason }))
  })

  await expect(fetchLeagueData('123', season, { fetchImpl })).resolves.toHaveProperty('players.old')
  currentSeason = '2026'
  const first = fetchLeagueData('123', currentSeason, { fetchImpl })
  await started.promise
  const second = fetchLeagueData('123', 2026, { fetchImpl })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/players/nfl'))).toHaveLength(2)
  pending.resolve(response({ new: {} }))
  const results = await Promise.all([first, second])
  expect(results[0].players).toEqual({
    new: { rosterStatus: 'free_agent', roster: null },
  })
  expect(results[1].players).toEqual(results[0].players)
  await expect(fetchLeagueData('123', '2026', { fetchImpl })).resolves.toHaveProperty('players.new')
  expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/players/nfl'))).toHaveLength(2)
})

test('a failed directory request does not evict another season', async () => {
  let currentSeason = season
  const pending = deferred()
  const started = deferred()
  const fetchImpl = jest.fn((url) => {
    if (url.endsWith('/players/nfl')) {
      if (currentSeason === season) {
        started.resolve()
        return pending.promise
      }
      return Promise.resolve(response({ new: {} }))
    }
    if (url.endsWith('/state/nfl')) return Promise.resolve(response({ season: currentSeason }))
    if (url.endsWith('/users') || url.endsWith('/rosters')) return Promise.resolve(response([]))
    return Promise.resolve(response({ ...league, season: currentSeason }))
  })

  const old = fetchLeagueData('123', season, { fetchImpl })
  await started.promise
  currentSeason = '2026'
  await expect(fetchLeagueData('123', currentSeason, { fetchImpl })).resolves.toHaveProperty('players.new')
  pending.resolve(response({}, 503))
  await expect(old).rejects.toThrow('request_failed')
  await expect(fetchLeagueData('123', currentSeason, { fetchImpl })).resolves.toHaveProperty('players.new')
  expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/players/nfl'))).toHaveLength(2)
})

test('does not cache an empty or failed player directory', async () => {
  let playerRequests = 0
  const fetchImpl = mockApi()
  const normal = fetchImpl.getMockImplementation()
  fetchImpl.mockImplementation((url, options) => {
    if (url.endsWith('/players/nfl')) {
      playerRequests += 1
      return Promise.resolve(response(playerRequests === 1 ? {} : { p1: {} }))
    }
    return normal(url, options)
  })
  await expect(fetchLeagueData('123', season, { fetchImpl })).rejects.toThrow('request_failed')
  await expect(fetchLeagueData('123', season, { fetchImpl })).resolves.toHaveProperty('players.p1')
  expect(playerRequests).toBe(2)
})

test('cancels a directory waiter promptly without aborting the shared download', async () => {
  const pending = deferred()
  const started = deferred()
  const fetchImpl = mockApi()
  const normal = fetchImpl.getMockImplementation()
  fetchImpl.mockImplementation((url, options) => {
    if (url.endsWith('/players/nfl')) {
      started.resolve(options.signal)
      return pending.promise
    }
    return normal(url, options)
  })
  const controller = new AbortController()
  const first = fetchLeagueData('123', season, { fetchImpl, signal: controller.signal })
  const downloadSignal = await started.promise
  const second = fetchLeagueData('123', season, { fetchImpl })
  controller.abort()
  await expect(first).rejects.toThrow('request_cancelled')
  expect(downloadSignal.aborted).toBe(false)
  pending.resolve(response({ p1: {} }))
  await expect(second).resolves.toHaveProperty('players.p1')
  expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/players/nfl'))).toHaveLength(1)
})
