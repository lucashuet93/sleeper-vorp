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

test('ranks per-game player metrics independently of total and team values', () => {
  const result = calculateSummaryInsights([
    { ...players[0], vorpPerGame: 1, vorsPerGame: 2 },
    { ...players[1], vorpPerGame: 4, vorsPerGame: 3 },
    { ...players[2], vorpPerGame: null, vorsPerGame: null },
  ], [{ roster_id: 1 }])
  expect(result.topPlayers.vorpPerGame.map(({ id }) => id)).toEqual(['a-rb', 'a-qb'])
  expect(result.positionPlayers.QB.vorsPerGame.map(({ id }) => id)).toEqual(['a-qb'])
  expect(result.topPlayers.vorp[0].id).toBe('a-qb')
  expect(result.topTeams.vorp[0].vorp).toBe(14)
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

test('counts empty positions as zero when finding positional advantages', () => {
  const result = calculateSummaryInsights([
    { position: 'QB', teamId: '1', vorp: 10, vors: 10 },
    { position: 'RB', teamId: '1', vorp: 20, vors: 20 },
    { position: 'RB', teamId: '2', vorp: 18, vors: 18 },
  ], [{ roster_id: 1 }, { roster_id: 2 }])

  for (const metric of ['vorp', 'vors']) {
    expect(result.positionalAdvantages[metric]).toMatchObject({
      position: 'QB',
      value: 5,
      team: { id: '1' },
    })
  }
})

test('excludes unavailable position scores while counting empty positions', () => {
  const result = calculateSummaryInsights([
    { position: 'QB', teamId: '1', vorp: 12, vors: null },
    { position: 'QB', teamId: '2', vorp: null, vors: 6 },
    { position: 'RB', teamId: '1', vorp: null, vors: null },
  ], [{ roster_id: 1 }, { roster_id: 2 }, { roster_id: 3 }])

  expect(result.positionalAdvantages.vorp).toMatchObject({
    position: 'QB', value: 6, team: { id: '1' },
  })
  expect(result.positionalAdvantages.vors).toMatchObject({
    position: 'QB', value: 3, team: { id: '2' },
  })
})

test('skips positions without measured scores and allows empty positions to lead', () => {
  const rosters = [{ roster_id: 1 }, { roster_id: 2 }]
  const unavailable = calculateSummaryInsights([
    { position: 'QB', teamId: '1', vorp: null, vors: null },
  ], rosters)
  expect(unavailable.positionalAdvantages).toEqual({ vorp: null, vors: null })

  const negative = calculateSummaryInsights([
    { position: 'QB', teamId: '1', vorp: -10, vors: -4 },
  ], rosters)
  expect(negative.positionalAdvantages.vorp).toMatchObject({
    position: 'QB', value: 5, team: { id: '2' },
  })
  expect(negative.positionalAdvantages.vors).toMatchObject({
    position: 'QB', value: 2, team: { id: '2' },
  })
})
