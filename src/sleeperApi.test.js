import { fetchLeagueData } from './sleeperApi.js'

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }
}

test('fetches league settings, owners, rosters, and player pool', async () => {
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
  expect(result.players).toEqual(players)
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
