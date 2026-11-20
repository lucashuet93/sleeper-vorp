import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    if (url.endsWith('/user/football-fan')) {
      return Promise.resolve(response({ user_id: 'user-123' }))
    }

    const season = Number(url.split('/').pop())
    return Promise.resolve(
      response(
        season === currentSeason || season === currentSeason - 1
          ? [
              {
                league_id: 'league-123',
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

  fireEvent.change(leagueSelect, { target: { value: 'league-123' } })
  const seasonSelect = screen.getByRole('combobox', { name: 'Season' })
  expect(seasonSelect.options).toHaveLength(3)

  const continueButton = screen.getByRole('button', { name: 'Continue' })
  expect(continueButton.disabled).toBe(true)
  fireEvent.change(seasonSelect, {
    target: { value: String(currentSeason) },
  })
  expect(continueButton.disabled).toBe(false)
  fireEvent.click(continueButton)

  expect(
    screen.getByText(/Selection confirmed: Friends League,/).textContent,
  ).toContain(`${currentSeason} season. Ready for the next step.`)
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
