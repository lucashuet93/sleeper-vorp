import { fireEvent, render, screen, within } from '@testing-library/react'
import Dashboard from './Dashboard.jsx'

const leagueData = {
  league: { total_rosters: 1 },
  scoringSettings: { pass_yd: 1, rush_yd: 1 },
  rosterSettings: ['QB', 'RB'],
  players: {
    q1: { full_name: 'Quarterback One', position: 'QB', stats: { pass_yd: 100 }, rosterStatus: 'rostered' },
    q2: { full_name: 'Quarterback Two', position: 'QB', stats: { pass_yd: 70 }, rosterStatus: 'rostered' },
    q3: { full_name: 'Quarterback Three', position: 'QB', stats: { pass_yd: 40 }, rosterStatus: 'free_agent' },
    r1: { full_name: 'Running Back One', position: 'RB', projections: { rush_yd: 90 }, rosterStatus: 'rostered' },
    r2: { full_name: 'Running Back Two', position: 'RB', stats: { rush_yd: 40 }, rosterStatus: 'free_agent' },
    unknown: { full_name: 'Unknown Player', position: 'QB', rosterStatus: 'free_agent' },
  },
}

function row(name) {
  return within(screen.getByRole('row', { name: new RegExp(name) }))
}

function playerOrder() {
  return screen.getAllByRole('row').slice(1).map((item) => within(item).getByRole('rowheader').textContent)
}

test('displays calculated values and filters positions without recalculating baselines', () => {
  render(<Dashboard leagueData={leagueData} />)

  expect(row('Quarterback One').getByText('100.00')).toBeTruthy()
  expect(row('Quarterback One').getAllByText('30.00')).toHaveLength(2)
  expect(row('Unknown Player').getAllByText('—')).toHaveLength(3)
  expect(screen.getByText(/unavailable without player performance data/)).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'QB' }))
  expect(screen.getByRole('button', { name: 'QB' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByRole('row', { name: /Running Back One/ })).toBeNull()
  expect(row('Quarterback One').getAllByText('30.00')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'TE' }))
  expect(screen.getByText('No players found for this position.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'All' }))
  expect(screen.getByRole('row', { name: /Running Back One/ })).toBeTruthy()
})

test('switches VORP replacement methods while retaining the VORS starter baseline', () => {
  render(<Dashboard leagueData={leagueData} />)
  fireEvent.change(screen.getByLabelText('Replacement-level method'), { target: { value: 'free-agent' } })
  expect(row('Quarterback One').getByText('60.00')).toBeTruthy()
  expect(row('Quarterback One').getByText('30.00')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Replacement-level method'), { target: { value: 'rank-based' } })
  expect(row('Quarterback One').getAllByText('30.00')).toHaveLength(2)
})

test('sorts each value in both directions and keeps unavailable values last', () => {
  render(<Dashboard leagueData={leagueData} />)
  expect(playerOrder()[0]).toBe('Running Back One')
  fireEvent.click(screen.getByRole('button', { name: 'VORP' }))
  expect(playerOrder()[0]).toBe('Quarterback Three')
  expect(playerOrder().at(-1)).toBe('Unknown Player')

  fireEvent.click(screen.getByRole('button', { name: 'Fantasy points' }))
  expect(playerOrder()[0]).toBe('Quarterback One')
  expect(screen.getByRole('columnheader', { name: 'Fantasy points' }).getAttribute('aria-sort')).toBe('descending')
  fireEvent.click(screen.getByRole('button', { name: 'Fantasy points' }))
  expect(playerOrder()[0]).toBe('Quarterback Three')
  expect(playerOrder().at(-1)).toBe('Unknown Player')

  fireEvent.click(screen.getByRole('button', { name: 'VORS' }))
  expect(playerOrder()[0]).toBe('Running Back One')
  fireEvent.click(screen.getByRole('button', { name: 'VORS' }))
  expect(playerOrder()[0]).toBe('Quarterback Three')
  expect(playerOrder().at(-1)).toBe('Unknown Player')
})

test('does not display fabricated scores when league settings are unavailable', () => {
  render(<Dashboard leagueData={{ ...leagueData, scoringSettings: {} }} />)
  expect(row('Quarterback One').getAllByText('—')).toHaveLength(3)
  expect(screen.getByText(/unavailable without player performance data/)).toBeTruthy()
})

test.each([[], undefined])('does not display fabricated scores without roster settings (%s)', (rosterSettings) => {
  render(<Dashboard leagueData={{ ...leagueData, rosterSettings }} />)
  expect(row('Quarterback One').getAllByText('—')).toHaveLength(3)
  expect(screen.getByText(/unavailable without player performance data/)).toBeTruthy()

  fireEvent.change(screen.getByLabelText('Replacement-level method'), { target: { value: 'free-agent' } })
  expect(row('Quarterback One').getAllByText('—')).toHaveLength(3)
})
