import { fetchLeagueData } from './sleeperApi.js'

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }
}

test('fetches league settings, owners, rosters, and player directory', async () => {
  const league = {
    league_id: 'league-123',
    season: '2025',
    scoring_settings: { rec: 1 },
    roster_positions: ['QB', 'RB'],
  }
  const users = [{ user_id: 'user-123', display_name: 'Team owner' }]
  const rosters = [{ roster_id: 1, owner_id: 'user-123', players: ['player-1'] }]
  const players = { 'player-1': { full_name: 'Player One' } }
  const fetchImpl = jest.fn((url) => {
    if (url.endsWith('/league/league-123')) {
      return Promise.resolve(response(league))
    }
    if (url.endsWith('/league/league-123/users')) {
      return Promise.resolve(response(users))
    }
    if (url.endsWith('/league/league-123/rosters')) {
      return Promise.resolve(response(rosters))
    }
    return Promise.resolve(response(players))
  })

  const result = await fetchLeagueData('league-123', fetchImpl)

  expect(fetchImpl).toHaveBeenCalledTimes(4)
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://api.sleeper.app/v1/league/league-123',
  )
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://api.sleeper.app/v1/league/league-123/users',
  )
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://api.sleeper.app/v1/league/league-123/rosters',
  )
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://api.sleeper.app/v1/players/nfl',
  )
  expect(result.league.scoring_settings).toEqual({ rec: 1 })
  expect(result.league.roster_positions).toEqual(['QB', 'RB'])
  expect(result.users).toEqual(users)
  expect(result.rosters).toEqual(rosters)
  expect(result.teams[0]).toEqual({ ...rosters[0], owner: users[0] })
  expect(result.playerDirectory).toEqual(players)
})

test('reports rate limits from any Sleeper endpoint', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(null, 429))

  await expect(fetchLeagueData('league-123', fetchImpl)).rejects.toThrow(
    'rate_limited',
  )
})

test('reports a missing league separately', async () => {
  const fetchImpl = jest.fn((url) =>
    Promise.resolve(
      response(null, url.endsWith('/league/league-123') ? 404 : 200),
    ),
  )

  await expect(fetchLeagueData('league-123', fetchImpl)).rejects.toThrow(
    'league_not_found',
  )
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})

test('reports a null league as missing before requesting dependent data', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(null))

  await expect(fetchLeagueData('league-123', fetchImpl)).rejects.toThrow(
    'league_not_found',
  )
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})

test('normalizes network errors for a user-friendly message', async () => {
  const fetchImpl = jest.fn().mockRejectedValue(new Error('offline'))

  await expect(fetchLeagueData('league-123', fetchImpl)).rejects.toThrow(
    'request_failed',
  )
})

test('reuses an in-flight directory request and caches it across leagues and retries', async () => {
  let finishPlayers
  let failUsers = true
  const players = { p1: { full_name: 'Player One' } }
  const fetchImpl = jest.fn((url) => {
    if (url.endsWith('/players/nfl')) {
      return new Promise((resolve) => { finishPlayers = resolve })
    }
    if (url.endsWith('/users')) {
      return Promise.resolve(response(failUsers ? null : [], failUsers ? 500 : 200))
    }
    if (url.endsWith('/rosters')) return Promise.resolve(response([]))
    return Promise.resolve(response({ league_id: 'league', season: '2025' }))
  })

  const first = fetchLeagueData('one', fetchImpl)
  const second = fetchLeagueData('two', fetchImpl)
  const failed = Promise.allSettled([first, second])
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/players/nfl'))).toHaveLength(1)
  finishPlayers(response(players))
  expect((await failed).map((result) => result.status)).toEqual(['rejected', 'rejected'])
  failUsers = false
  expect((await fetchLeagueData('three', fetchImpl)).playerDirectory).toEqual(players)
  expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/players/nfl'))).toHaveLength(1)
})

test('expires the player cache after one day and retries failed downloads', async () => {
  let now = 1000000
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => now)
  let playerCalls = 0
  const fetchImpl = jest.fn((url) => {
    if (url.endsWith('/players/nfl')) {
      playerCalls += 1
      return Promise.resolve(response(playerCalls === 2 ? null : { p1: {} }))
    }
    if (url.endsWith('/users') || url.endsWith('/rosters')) return Promise.resolve(response([]))
    return Promise.resolve(response({ league_id: 'league', season: '2025' }))
  })
  try {
    await fetchLeagueData('one', fetchImpl)
    now += 24 * 60 * 60 * 1000 - 1
    await fetchLeagueData('two', fetchImpl)
    expect(playerCalls).toBe(1)
    now += 1
    await expect(fetchLeagueData('three', fetchImpl)).rejects.toThrow('request_failed')
    await fetchLeagueData('four', fetchImpl)
    expect(playerCalls).toBe(3)
  } finally {
    clock.mockRestore()
  }
})

test('persists the player directory across fetch instances when browser cache is available', async () => {
  const originalFetch = globalThis.fetch
  const originalCaches = globalThis.caches
  const originalResponse = globalThis.Response
  let saved
  const cache = {
    match: jest.fn(async () => saved),
    put: jest.fn(async (_url, value) => { saved = value }),
  }
  globalThis.caches = { open: jest.fn(async () => cache) }
  globalThis.Response = class {
    constructor(body, options) {
      this.body = body
      this.headers = { get: (name) => options.headers[name] }
    }
    async json() { return JSON.parse(this.body) }
  }
  const makeFetch = () => jest.fn((url) => {
    if (url.endsWith('/players/nfl')) return Promise.resolve(response({ p1: {} }))
    if (url.endsWith('/users') || url.endsWith('/rosters')) return Promise.resolve(response([]))
    return Promise.resolve(response({ league_id: 'league', season: '2025' }))
  })
  try {
    globalThis.fetch = makeFetch()
    await fetchLeagueData('one')
    expect(cache.put).toHaveBeenCalledTimes(1)
    globalThis.fetch = makeFetch()
    expect((await fetchLeagueData('two')).playerDirectory).toEqual({ p1: {} })
    expect(globalThis.fetch.mock.calls.some(([url]) => url.endsWith('/players/nfl'))).toBe(false)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.caches = originalCaches
    globalThis.Response = originalResponse
  }
})
