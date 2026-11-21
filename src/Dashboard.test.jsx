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
  return within(within(screen.getByRole('table', { name: 'Player values' }))
    .getByRole('row', { name: new RegExp(name) }))
}

function playerOrder() {
  return within(screen.getByRole('table', { name: 'Player values' }))
    .getAllByRole('row').slice(1).map((item) => within(item).getByRole('rowheader').textContent)
}

test('displays calculated values and filters positions without recalculating baselines', () => {
  render(<Dashboard leagueData={leagueData} />)

  expect(row('Quarterback One').getByText('100.00')).toBeTruthy()
  expect(row('Quarterback One').getAllByText('30.00')).toHaveLength(2)
  expect(row('Unknown Player').getAllByText('—')).toHaveLength(6)
  expect(screen.getByText(/unavailable without player performance data/)).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'QB' }))
  expect(screen.getByRole('button', { name: 'QB' }).getAttribute('aria-pressed')).toBe('true')
  expect(within(screen.getByRole('table', { name: 'Player values' }))
    .queryByRole('row', { name: /Running Back One/ })).toBeNull()
  expect(row('Quarterback One').getAllByText('30.00')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'TE' }))
  expect(screen.getByText('No players found for this position.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'All' }))
  expect(row('Running Back One').getByRole('rowheader')).toBeTruthy()
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
  expect(row('Quarterback One').getAllByText('—')).toHaveLength(6)
  expect(screen.getByText(/unavailable without player performance data/)).toBeTruthy()
})

test.each([[], undefined])('does not display fabricated scores without roster settings (%s)', (rosterSettings) => {
  render(<Dashboard leagueData={{ ...leagueData, rosterSettings }} />)
  expect(row('Quarterback One').getAllByText('—')).toHaveLength(6)
  expect(screen.getByText(/unavailable without player performance data/)).toBeTruthy()

  fireEvent.change(screen.getByLabelText('Replacement-level method'), { target: { value: 'free-agent' } })
  expect(row('Quarterback One').getAllByText('—')).toHaveLength(6)
})

test('displays and sorts per-game values and ranks players without changing season totals', () => {
  const data = {
    ...leagueData,
    players: {
      q1: { full_name: 'Quarterback One', position: 'QB', stats: { pass_yd: 100, gp: 10 }, rosterStatus: 'rostered' },
      q2: { full_name: 'Quarterback Two', position: 'QB', stats: { pass_yd: 70, gp: 5 }, rosterStatus: 'rostered' },
      q3: { full_name: 'Quarterback Three', position: 'QB', stats: { pass_yd: 40, gp: 2 }, rosterStatus: 'free_agent' },
      partial: { full_name: 'Partial', position: 'QB', stats: { pass_yd: 20 }, rosterStatus: 'free_agent' },
      gamesOnly: { full_name: 'Games Only', position: 'QB', stats: { gp: 4 } },
    },
  }
  render(<Dashboard leagueData={data} />)

  expect(row('Quarterback One').getByText('100.00')).toBeTruthy()
  expect(row('Quarterback One').getByText('10.00')).toBeTruthy()
  expect(row('Quarterback One').getAllByText('-4.00')).toHaveLength(2)
  expect(row('Partial').getAllByText('—')).toHaveLength(3)
  expect(row('Games Only').getAllByText('—')).toHaveLength(6)
  const summary = within(screen.getByRole('region', { name: 'Summary insights' }))
  for (const label of ['VORP/G', 'VORS/G']) {
    expect(within(summary.getByRole('table', { name: `Top players overall by ${label}` }))
      .getAllByRole('rowheader')[0].textContent).toBe('Quarterback Three')
    expect(within(summary.getByRole('table', { name: `Top QB players by ${label}` }))
      .getAllByRole('rowheader')[0].textContent).toBe('Quarterback Three')
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(playerOrder()[0]).toBe('Quarterback Three')
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(playerOrder()[0]).toBe('Quarterback One')
    expect(playerOrder().at(-1)).toBe('Games Only')
  }
  fireEvent.click(screen.getByRole('button', { name: 'Fantasy points/G' }))
  expect(playerOrder()[0]).toBe('Quarterback Three')
  fireEvent.change(screen.getByLabelText('Replacement-level method'), { target: { value: 'free-agent' } })
  expect(row('Quarterback One').getByText('-10.00')).toBeTruthy()
  expect(row('Quarterback One').getByText('-4.00')).toBeTruthy()
})

test('displays overall and positional player rankings, team totals, and positional advantage', () => {
  const data = {
    ...leagueData,
    league: { total_rosters: 2 },
    rosterSettings: ['QB', 'RB', 'WR'],
    users: [
      { user_id: 'a', display_name: 'Team A' },
      { user_id: 'b', display_name: 'Team B' },
    ],
    rosters: [
      { roster_id: 1, owner_id: 'a' },
      { roster_id: 2, owner_id: 'b' },
    ],
    players: {
      a1: { full_name: 'A Quarterback', position: 'QB', stats: { pass_yd: 100 }, roster: { rosterId: 1, ownerId: 'a' } },
      a2: { full_name: 'A Running Back', position: 'RB', stats: { rush_yd: 30 }, roster: { rosterId: 1, ownerId: 'a' } },
      a3: { full_name: 'A Receiver', position: 'WR', stats: { rush_yd: 10 }, roster: { rosterId: 1, ownerId: 'a' } },
      b1: { full_name: 'B Quarterback', position: 'QB', stats: { pass_yd: 20 }, roster: { rosterId: 2, ownerId: 'b' } },
      b2: { full_name: 'B Running Back', position: 'RB', stats: { rush_yd: 90 }, roster: { rosterId: 2, ownerId: 'b' } },
      b3: { full_name: 'B Receiver', position: 'WR', stats: { rush_yd: 60 }, roster: { rosterId: 2, ownerId: 'b' } },
      q3: { full_name: 'Free Agent QB', position: 'QB', stats: { pass_yd: 10 }, roster: { rosterId: null } },
      r3: { full_name: 'Free Agent RB', position: 'RB', stats: { rush_yd: 10 }, roster: { rosterId: null } },
      w3: { full_name: 'Free Agent WR', position: 'WR', stats: { rush_yd: 5 }, roster: { rosterId: null } },
    },
  }

  render(<Dashboard leagueData={data} />)

  const summary = within(screen.getByRole('region', { name: 'Summary insights' }))
  expect(within(summary.getByRole('table', { name: 'Top players overall by VORP' }))
    .getAllByRole('rowheader').map((header) => header.textContent)).toEqual([
    'A Quarterback', 'B Running Back', 'B Receiver',
  ])
  expect(within(summary.getByRole('table', { name: 'Top QB players by VORP' }))
    .getAllByRole('rowheader').map((header) => header.textContent)[0]).toBe('A Quarterback')
  expect(within(summary.getByRole('table', { name: 'Top teams by VORP' }))
    .getAllByRole('rowheader').map((header) => header.textContent)[0]).toBe('Team B')
  expect(summary.getByLabelText('Largest positional advantage by VORP').textContent)
    .toContain('Team A at QB')
})
