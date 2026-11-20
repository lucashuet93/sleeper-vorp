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

test('returns selected league settings, owners, rosters and the player directory', async () => {
  const fetchImpl = mockApi()
  const data = await fetchLeagueData('123', season, { fetchImpl })
  expect(data).toEqual({
    league,
    scoringSettings: { pass_td: 4 },
    rosterSettings: ['QB', 'SUPER_FLEX', 'BN'],
    users: [{ user_id: 'owner' }],
    rosters: [{ owner_id: 'owner', players: ['p1'] }],
    players: { p1: { player_id: 'p1', position: 'QB' } },
    playerDirectory: { p1: { player_id: 'p1', position: 'QB' } },
  })
  expect(data.players).toBe(data.playerDirectory)
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
