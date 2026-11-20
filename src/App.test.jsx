import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App.jsx'

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

test('finds leagues, lets the user choose a season, and confirms the selection', async () => {
  const currentSeason = new Date().getFullYear()
  global.fetch.mockImplementation((url) => {
    if (url.endsWith('/state/nfl')) {
      return Promise.resolve(response({ season: String(currentSeason) }))
    }
    if (url.endsWith('/user/football-fan')) {
      return Promise.resolve(response({ user_id: 'user-123' }))
    }

    if (url.includes('/league/')) {
      if (url.endsWith('/users')) {
        return Promise.resolve(response([{ user_id: 'user-123' }]))
      }
      if (url.endsWith('/rosters')) {
        return Promise.resolve(response([{ roster_id: 1, owner_id: 'user-123' }]))
      }
      return Promise.resolve(response({ league_id: 'league-current', season: String(currentSeason) }))
    }
    if (url.endsWith('/players/nfl')) {
      return Promise.resolve(response({}))
    }

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

  expect(await screen.findByRole('region', { name: 'Next step' })).toBeTruthy()
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

test('loads selected league data and reports a rate-limit error', async () => {
  const currentSeason = String(new Date().getFullYear())
  global.fetch.mockImplementation((url) => {
    if (url.endsWith('/state/nfl')) return Promise.resolve(response({ season: currentSeason }))
    if (url.endsWith('/user/fan')) {
      return Promise.resolve(response({ user_id: 'user-123' }))
    }
    if (url.endsWith(`/user/user-123/leagues/nfl/${currentSeason}`)) {
      return Promise.resolve(
        response([{ league_id: 'league-123', name: 'Friends League', season: currentSeason }]),
      )
    }
    if (url.endsWith('/league/league-123')) {
      return Promise.resolve(
        response({ league_id: 'league-123', season: currentSeason }),
      )
    }
    if (url.endsWith('/league/league-123/users')) {
      return Promise.resolve(response([{ user_id: 'user-123' }]))
    }
    if (url.endsWith('/league/league-123/rosters')) {
      return Promise.resolve(response([{ roster_id: 1, owner_id: 'user-123' }]))
    }
    if (url.endsWith('/players/nfl')) {
      return Promise.resolve(response({ player: { full_name: 'A Player' } }))
    }
    return Promise.resolve(response([]))
  })

  render(<App />)
  fireEvent.change(screen.getByLabelText('Sleeper username'), {
    target: { value: 'fan' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Find leagues' }))

  fireEvent.change(await screen.findByRole('combobox', { name: 'League' }), {
    target: { value: 'league-123' },
  })
  fireEvent.change(screen.getByRole('combobox', { name: 'Season' }), {
    target: { value: currentSeason },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

  expect(await screen.findByText('Teams: 1')).toBeTruthy()
  expect(screen.getByText('Player directory entries: 1')).toBeTruthy()
  expect(global.fetch).toHaveBeenCalledWith(
    'https://api.sleeper.app/v1/league/league-123/rosters',
  )
})

test('explains why a historical league cannot be loaded', async () => {
  const currentSeason = new Date().getFullYear()
  const historicalSeason = String(currentSeason - 1)
  global.fetch.mockImplementation((url) => {
    if (url.endsWith('/user/fan')) return Promise.resolve(response({ user_id: 'user-123' }))
    if (url.endsWith(`/user/user-123/leagues/nfl/${historicalSeason}`)) {
      return Promise.resolve(response([{ league_id: 'old', name: 'League', season: historicalSeason }]))
    }
    if (url.endsWith('/league/old')) return Promise.resolve(response({ league_id: 'old', season: historicalSeason }))
    if (url.endsWith('/state/nfl')) return Promise.resolve(response({ season: String(currentSeason) }))
    return Promise.resolve(response([]))
  })

  render(<App />)
  fireEvent.change(screen.getByLabelText('Sleeper username'), { target: { value: 'fan' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find leagues' }))
  fireEvent.change(await screen.findByLabelText('League'), { target: { value: 'old' } })
  fireEvent.change(screen.getByLabelText('Season'), { target: { value: historicalSeason } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

  expect((await screen.findByRole('alert')).textContent).toMatch(/Player eligibility is unavailable/)
  expect(screen.queryByRole('region', { name: 'Next step' })).toBeNull()
  expect(global.fetch.mock.calls.some(([url]) => url.endsWith('/players/nfl'))).toBe(false)
})

test('shows a friendly message when selected league data is rate limited', async () => {
  const currentSeason = String(new Date().getFullYear())
  global.fetch.mockImplementation((url) => {
    if (url.endsWith('/user/fan')) {
      return Promise.resolve(response({ user_id: 'user-123' }))
    }
    if (url.endsWith(`/user/user-123/leagues/nfl/${currentSeason}`)) {
      return Promise.resolve(
        response([{ league_id: 'league-123', name: 'Friends League', season: currentSeason }]),
      )
    }
    if (url.endsWith('/league/league-123')) {
      return Promise.resolve(response(null, 429))
    }
    return Promise.resolve(response([]))
  })

  render(<App />)
  fireEvent.change(screen.getByLabelText('Sleeper username'), {
    target: { value: 'fan' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Find leagues' }))

  fireEvent.change(await screen.findByRole('combobox', { name: 'League' }), {
    target: { value: 'league-123' },
  })
  fireEvent.change(screen.getByRole('combobox', { name: 'Season' }), {
    target: { value: currentSeason },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

  expect((await screen.findByRole('alert')).textContent).toMatch(
    /Sleeper is rate-limiting requests/,
  )
})

test.each(['success', 'failure'])('ignores a stale league load after changing season (%s)', async (outcome) => {
  const currentSeason = new Date().getFullYear()
  let finishOld
  let finishNew
  global.fetch.mockImplementation((url) => {
    if (url.endsWith('/state/nfl')) return Promise.resolve(response({ season: String(currentSeason - 1) }))
    if (url.endsWith('/user/fan')) return Promise.resolve(response({ user_id: 'user-123' }))
    if (url.includes('/user/user-123/leagues/nfl/')) {
      const season = Number(url.split('/').pop())
      return Promise.resolve(response(
        season === currentSeason || season === currentSeason - 1
          ? [{ league_id: `league-${season}`, name: 'League', season: String(season),
              ...(season === currentSeason && { previous_league_id: `league-${season - 1}` }) }]
          : [],
      ))
    }
    if (url.endsWith(`/league/league-${currentSeason}`)) {
      return new Promise((resolve) => { finishOld = resolve })
    }
    if (url.endsWith(`/league/league-${currentSeason - 1}`)) {
      return new Promise((resolve) => { finishNew = resolve })
    }
    if (url.endsWith('/players/nfl')) return Promise.resolve(response({}))
    return Promise.resolve(response([]))
  })

  render(<App />)
  fireEvent.change(screen.getByLabelText('Sleeper username'), { target: { value: 'fan' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find leagues' }))
  fireEvent.change(await screen.findByLabelText('League'), { target: { value: `league-${currentSeason - 1}` } })
  fireEvent.change(screen.getByLabelText('Season'), { target: { value: String(currentSeason) } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.change(screen.getByLabelText('Season'), { target: { value: String(currentSeason - 1) } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

  await act(async () => {
    finishOld(outcome === 'success'
      ? response({ league_id: `league-${currentSeason}`, season: String(currentSeason) })
      : response(null, 429))
  })
  expect(screen.getByRole('button', { name: 'Loading league data…' }).disabled).toBe(true)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('region', { name: 'Next step' })).toBeNull()

  finishNew(response({ league_id: `league-${currentSeason - 1}`, season: String(currentSeason - 1) }))
  expect(await screen.findByText(`Season: ${currentSeason - 1}`)).toBeTruthy()
})

test('ignores a pending league load when starting a new search', async () => {
  const season = String(new Date().getFullYear())
  let finishOld
  global.fetch.mockImplementation((url) => {
    if (url.endsWith('/user/fan')) return Promise.resolve(response({ user_id: 'user-123' }))
    if (url.endsWith('/user/other')) return Promise.resolve(response({ user_id: 'user-456' }))
    if (url.endsWith(`/user/user-123/leagues/nfl/${season}`)) {
      return Promise.resolve(response([{ league_id: 'league-123', name: 'League', season }]))
    }
    if (url.endsWith('/league/league-123')) {
      return new Promise((resolve) => { finishOld = resolve })
    }
    return Promise.resolve(response([]))
  })
  render(<App />)
  fireEvent.change(screen.getByLabelText('Sleeper username'), { target: { value: 'fan' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find leagues' }))
  fireEvent.change(await screen.findByLabelText('League'), { target: { value: 'league-123' } })
  fireEvent.change(screen.getByLabelText('Season'), { target: { value: season } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.change(screen.getByLabelText('Sleeper username'), { target: { value: 'other' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find leagues' }))
  expect(await screen.findByText('No leagues found for this Sleeper username.')).toBeTruthy()

  await act(async () => { finishOld(response(null, 429)) })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('region', { name: 'Next step' })).toBeNull()
})
