import { calculateSummaryInsights } from './summaryInsights.js'

const players = [
  { id: 'a-qb', name: 'A QB', position: 'QB', teamId: '1', vorp: 10, vors: 8 },
  { id: 'a-rb', name: 'A RB', position: 'RB', teamId: '1', vorp: 3, vors: 4 },
  { id: 'a-wr', name: 'A WR', position: 'WR', teamId: '1', vorp: 1, vors: 1 },
  { id: 'b-qb', name: 'B QB', position: 'QB', teamId: '2', vorp: 2, vors: 1 },
  { id: 'b-rb', name: 'B RB', position: 'RB', teamId: '2', vorp: 9, vors: 3 },
  { id: 'b-wr', name: 'B WR', position: 'WR', teamId: '2', vorp: 6, vors: 5 },
  { id: 'no-score', name: 'Unknown', position: 'QB', teamId: '1', vorp: null, vors: null },
]

test('ranks available player values overall and separately by position', () => {
  const result = calculateSummaryInsights(players)

  expect(result.topPlayers.vorp.map(({ id }) => id)).toEqual(['a-qb', 'b-rb', 'b-wr'])
  expect(result.topPlayers.vors.map(({ id }) => id)).toEqual(['a-qb', 'b-wr', 'a-rb'])
  expect(result.positionPlayers.QB.vorp.map(({ id }) => id)).toEqual(['a-qb', 'b-qb'])
  expect(result.positionPlayers.TE.vors).toEqual([])
})

test('sums team aggregates and finds the strongest positional surplus over league average', () => {
  const result = calculateSummaryInsights(players, [
    { roster_id: 1, owner_id: 'a' },
    { roster_id: 2, owner_id: 'b' },
  ], [
    { user_id: 'a', display_name: 'Team A' },
    { user_id: 'b', username: 'team-b' },
  ])

  expect(result.topTeams.vorp).toMatchObject([
    { name: 'team-b', vorp: 17 },
    { name: 'Team A', vorp: 14 },
  ])
  expect(result.topTeams.vors.map(({ name }) => name)).toEqual(['Team A', 'team-b'])
  expect(result.positionalAdvantages.vorp).toMatchObject({
    position: 'QB',
    value: 4,
    team: { name: 'Team A' },
  })
  expect(result.positionalAdvantages.vors).toMatchObject({
    position: 'QB',
    value: 3.5,
    team: { name: 'Team A' },
  })
})
