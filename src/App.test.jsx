import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App.jsx'
import * as sleeperApi from './sleeperApi.js'

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }
}

beforeEach(() => {
  global.fetch = jest.fn()
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('finds leagues, lets the user choose a season, and confirms the selection', async () => {
  const currentSeason = new Date().getFullYear()
  global.fetch.mockImplementation((url) => {
    if (url.endsWith('/user/football-fan')) {
      return Promise.resolve(response({ user_id: 'user-123' }))
    }
    if (url.endsWith('/league/league-current')) {
      return Promise.resolve(response({ league_id: 'league-current', season: String(currentSeason) }))
    }
    if (url.endsWith('/state/nfl')) return Promise.resolve(response({ season: String(currentSeason) }))
    if (url.endsWith('/players/nfl')) return Promise.resolve(response({ p1: { player_id: 'p1' } }))
    if (url.endsWith('/users') || url.endsWith('/rosters')) return Promise.resolve(response([]))

    const season = Number(url.split('/').pop())
    return Promise.resolve(
      response(
        season === currentSeason || season === currentSeason - 1
          ? [
              {
              league_id:
                season === currentSeason ? 'league-current' : 'league-previous',
              ...(season === currentSeason && {
                previous_league_id: 'league-previous',
              }),
              name: 'Friends League',
              season: String(season),
            },
            ]
          : [],
      ),
    )
  })

  render(<App />)
  fireEvent.change(screen.getByLabelText('Sleeper username'), {
    target: { value: 'football-fan' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Find leagues' }))

  const leagueSelect = await screen.findByRole('combobox', { name: 'League' })
  expect(global.fetch).toHaveBeenCalledWith(
    'https://api.sleeper.app/v1/user/football-fan',
  )
  expect(global.fetch).toHaveBeenCalledWith(
    `https://api.sleeper.app/v1/user/user-123/leagues/nfl/${currentSeason}`,
  )

  fireEvent.change(leagueSelect, { target: { value: 'league-previous' } })
  expect(leagueSelect.options).toHaveLength(2)
  const seasonSelect = screen.getByRole('combobox', { name: 'Season' })
  expect(seasonSelect.options).toHaveLength(3)

  const continueButton = screen.getByRole('button', { name: 'Continue' })
  expect(continueButton.disabled).toBe(true)
  fireEvent.change(seasonSelect, {
    target: { value: String(currentSeason) },
  })
  expect(continueButton.disabled).toBe(false)
  fireEvent.click(continueButton)

  expect(await screen.findByRole('region', { name: 'VORP and VORS dashboard' })).toBeTruthy()
  expect(screen.getByText('Season: ' + currentSeason)).toBeTruthy()
  expect(screen.getByText('League ID: league-current')).toBeTruthy()
})

test('shows a helpful message when the username has no leagues', async () => {
  global.fetch.mockImplementation((url) =>
    Promise.resolve(
      url.endsWith('/user/empty-user')
        ? response({ user_id: 'user-456' })
        : response([]),
    ),
  )

  render(<App />)
  fireEvent.change(screen.getByLabelText('Sleeper username'), {
    target: { value: 'empty-user' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Find leagues' }))

  expect(
    await screen.findByText('No leagues found for this Sleeper username.'),
  ).toBeTruthy()
})

test('shows an error when the username is not found', async () => {
  global.fetch.mockResolvedValue(response(null, 404))

  render(<App />)
  fireEvent.change(screen.getByLabelText('Sleeper username'), {
    target: { value: 'unknown-user' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Find leagues' }))

  await waitFor(() => {
    expect(screen.getByRole('alert').textContent).toMatch(
      /No Sleeper account found/,
    )
  })
})

  test('shows a clear error for a historical season', async () => {
    const currentSeason = String(new Date().getFullYear())
    const previous = String(Number(currentSeason) - 1)
    global.fetch.mockImplementation((url) => {
      if (url.endsWith('/user/fan')) return Promise.resolve(response({ user_id: 'u' }))
      if (url.includes('/leagues/nfl/')) {
        return Promise.resolve(response(url.endsWith(previous)
          ? [{ league_id: 'old', name: 'Old league', season: previous }]
          : []))
      }
      if (url.endsWith('/league/old')) return Promise.resolve(response({ league_id: 'old', season: previous }))
      if (url.endsWith('/state/nfl')) return Promise.resolve(response({ season: currentSeason }))
      return Promise.resolve(response([]))
    })
    render(<App />)
    fireEvent.change(screen.getByLabelText('Sleeper username'), { target: { value: 'fan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find leagues' }))
    fireEvent.change(await screen.findByLabelText('League'), { target: { value: 'old' } })
    fireEvent.change(screen.getByLabelText('Season'), { target: { value: previous } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Player data is not available for this season/)
    expect(screen.queryByRole('region', { name: 'VORP and VORS dashboard' })).toBeNull()
  })

  test.each(['success', 'error'])('ignores a stale %s after changing league and completing a new load', async (outcome) => {
    const current = String(new Date().getFullYear())
    let settleOld
    const old = new Promise((resolve, reject) => {
      settleOld = outcome === 'success' ? () => resolve({ league: { season: current } }) : () => reject(new Error('network_error'))
    })
    const load = jest.spyOn(sleeperApi, 'fetchLeagueData')
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce({ league: { season: current } })
    global.fetch.mockImplementation((url) => {
      if (url.endsWith('/user/fan')) return Promise.resolve(response({ user_id: 'u' }))
      const season = url.split('/').pop()
      return Promise.resolve(response(
        season === current
          ? [{ league_id: 'new', name: 'League A', season },
            { league_id: 'old', name: 'League B', season }]
          : [],
      ))
    })
    render(<App />)
    fireEvent.change(screen.getByLabelText('Sleeper username'), { target: { value: 'fan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find leagues' }))
    fireEvent.change(await screen.findByLabelText('League'), { target: { value: 'new' } })
    fireEvent.change(screen.getByLabelText('Season'), { target: { value: current } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Loading league data…')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('League'), { target: { value: 'old' } })
    fireEvent.change(screen.getByLabelText('Season'), { target: { value: current } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText('League ID: old')
    expect(load.mock.calls.map(([id, season]) => [id, season])).toEqual([['new', current], ['old', current]])
    await act(async () => { settleOld(); await old.catch(() => {}) })
    expect(screen.getByText('League ID: old')).toBeTruthy()
    expect(screen.getByText(`Season: ${current}`)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test.each([
    ['league_not_found', /league could not be found/],
    ['network_error', /Unable to reach Sleeper/],
    ['request_failed', /Unable to load league data/],
  ])('displays the message for %s', async (code, message) => {
    const current = String(new Date().getFullYear())
    jest.spyOn(sleeperApi, 'fetchLeagueData').mockRejectedValue(new Error(code))
    global.fetch.mockImplementation((url) => {
      if (url.endsWith('/user/fan')) return Promise.resolve(response({ user_id: 'u' }))
      return Promise.resolve(response(url.endsWith(current)
        ? [{ league_id: 'new', name: 'League', season: current }]
        : []))
    })
    render(<App />)
    fireEvent.change(screen.getByLabelText('Sleeper username'), { target: { value: 'fan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find leagues' }))
    fireEvent.change(await screen.findByLabelText('League'), { target: { value: 'new' } })
    fireEvent.change(screen.getByLabelText('Season'), { target: { value: current } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(message)
  })

test.each(['username', 'season'])('invalidates an in-flight load when %s changes', async (field) => {
  const current = String(new Date().getFullYear())
  const previous = String(Number(current) - 1)
  let resolveLoad
  const load = new Promise((resolve) => { resolveLoad = resolve })
  const fetchData = jest.spyOn(sleeperApi, 'fetchLeagueData').mockReturnValue(load)
  global.fetch.mockImplementation((url) => {
    if (url.endsWith('/user/fan')) return Promise.resolve(response({ user_id: 'u' }))
    const season = url.split('/').pop()
    return Promise.resolve(response(
      season === current || season === previous
        ? [{ league_id: season === current ? 'new' : 'old', name: 'League', season,
          ...(season === current ? { previous_league_id: 'old' } : {}) }]
        : [],
    ))
  })
  render(<App />)
  fireEvent.change(screen.getByLabelText('Sleeper username'), { target: { value: 'fan' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find leagues' }))
  fireEvent.change(await screen.findByLabelText('League'), { target: { value: 'old' } })
  fireEvent.change(screen.getByLabelText('Season'), { target: { value: current } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  if (field === 'username') {
    fireEvent.change(screen.getByLabelText('Sleeper username'), { target: { value: 'other' } })
  } else {
    fireEvent.change(screen.getByLabelText('Season'), { target: { value: previous } })
  }
  expect(fetchData.mock.calls[0][2].signal.aborted).toBe(true)
  await act(async () => { resolveLoad({ league: { season: current } }); await load })
  expect(screen.queryByRole('region', { name: 'VORP and VORS dashboard' })).toBeNull()
  expect(screen.queryByText('Loading league data…')).toBeNull()
})
