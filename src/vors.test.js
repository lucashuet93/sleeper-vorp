import { calculateVors } from './vors.js'

function playersAt(position, scores) {
  return Object.fromEntries(
    scores.map((projectedPoints, index) => [
      `${position}${index + 1}`,
      { position, projectedPoints },
    ]),
  )
}

test('calculates VORS against the player immediately outside the starter pool', () => {
  const players = {
    ...playersAt('QB', [30, 25, 20, 15, 10]),
    ...playersAt('RB', [20, 18, 16, 14, 12, 10]),
    ...playersAt('WR', [20, 18, 16, 14, 12, 10]),
    ...playersAt('TE', [12, 10, 8, 6]),
    ...playersAt('K', [10, 8, 6]),
  }
  const rosterSettings = ['QB', 'RB', 'WR', 'TE', 'K', 'BN']

  const result = calculateVors(players, rosterSettings, 2)

  expect(result.replacementBaselines).toEqual({
    QB: { startersPerTeam: 1, starterCount: 2, replacementRank: 3, score: 20 },
    RB: { startersPerTeam: 1, starterCount: 2, replacementRank: 3, score: 16 },
    WR: { startersPerTeam: 1, starterCount: 2, replacementRank: 3, score: 16 },
    TE: { startersPerTeam: 1, starterCount: 2, replacementRank: 3, score: 8 },
    K: { startersPerTeam: 1, starterCount: 2, replacementRank: 3, score: 6 },
  })
  expect(result.players.QB1.vors).toBe(10)
  expect(result.players.QB3.vors).toBe(0)
  expect(result.players.QB5.vors).toBe(-10)
  expect(result.players.RB6.vors).toBe(-6)
})

test.each([
  ['two QB starters', ['QB', 'QB'], 2],
])('includes %s spots in the QB replacement baseline', (_name, rosterSettings, starterCount) => {
  const players = playersAt('QB', [40, 35, 30, 25, 20, 15])

  const result = calculateVors(players, rosterSettings, 2)

  expect(result.replacementBaselines.QB).toEqual({
    startersPerTeam: starterCount,
    starterCount: starterCount * 2,
    replacementRank: starterCount * 2 + 1,
    score: 20,
  })
  expect(result.players.QB5.vors).toBe(0)
})

test('allocates superflex to the highest-scoring eligible position', () => {
  const players = {
    ...playersAt('RB', [100, 90, 80]),
    ...playersAt('QB', [30, 20]),
  }

  const result = calculateVors(players, ['RB', 'SUPER_FLEX'], 1)

  expect(result.replacementBaselines.RB).toEqual({
    startersPerTeam: 2,
    starterCount: 2,
    replacementRank: 3,
    score: 80,
  })
  expect(result.replacementBaselines.QB).toEqual({
    startersPerTeam: 0,
    starterCount: 0,
    replacementRank: 1,
    score: 30,
  })
  expect(result.players.QB1.vors).toBe(0)
  expect(result.players.QB2.vors).toBe(-10)
})

test('allocates superflex to quarterbacks across multiple rosters', () => {
  const players = {
    ...playersAt('QB', [50, 40, 30, 20]),
    ...playersAt('RB', [35, 25, 15]),
  }

  const result = calculateVors(players, ['QB', 'SUPER_FLEX'], 2)

  expect(result.replacementBaselines.QB).toEqual({
    startersPerTeam: 1.5,
    starterCount: 3,
    replacementRank: 4,
    score: 20,
  })
  expect(result.replacementBaselines.RB).toEqual({
    startersPerTeam: 0.5,
    starterCount: 1,
    replacementRank: 2,
    score: 25,
  })
  expect(result.players.QB3.vors).toBe(10)
  expect(result.players.QB4.vors).toBe(0)
  expect(result.players.RB1.vors).toBe(10)
})

test('reassigns an earlier running back to free an overlapping flex slot', () => {
  const players = {
    ...playersAt('RB', [100, 1]),
    ...playersAt('TE', [90, 0]),
  }

  const result = calculateVors(players, ['FLEX', 'WRRB_FLEX'], 1)

  expect(result.replacementBaselines.RB).toEqual({
    startersPerTeam: 1,
    starterCount: 1,
    replacementRank: 2,
    score: 1,
  })
  expect(result.replacementBaselines.TE).toEqual({
    startersPerTeam: 1,
    starterCount: 1,
    replacementRank: 2,
    score: 0,
  })
  expect(result.players.RB1.vors).toBe(99)
  expect(result.players.RB2.vors).toBe(0)
  expect(result.players.TE1.vors).toBe(90)
})

test('keeps shared-slot allocation independent of roster setting order', () => {
  const players = {
    ...playersAt('QB', [3, 2, 0]),
    ...playersAt('RB', [4, 3, 0]),
    ...playersAt('WR', [3, 2, 2]),
    ...playersAt('TE', [4, 2, 1]),
  }
  const rosterSettings = ['REC_FLEX', 'WRRB_FLEX', 'SUPER_FLEX']

  const result = calculateVors(players, rosterSettings, 1)
  const reversedResult = calculateVors(players, [...rosterSettings].reverse(), 1)

  expect(reversedResult.replacementBaselines).toEqual(result.replacementBaselines)
  expect(reversedResult.players).toEqual(result.players)
})

test('normalizes lowercase player positions', () => {
  const players = {
    qb1: { position: 'qb', fantasyPoints: 30 },
    qb2: { position: 'qb', fantasyPoints: 20 },
    qb3: { position: 'qb', fantasyPoints: 10 },
  }

  const result = calculateVors(players, ['QB'], 1, 'fantasyPoints')

  expect(result.replacementBaselines.QB).toEqual({
    startersPerTeam: 1,
    starterCount: 1,
    replacementRank: 2,
    score: 20,
  })
  expect(result.players.qb1.vors).toBe(10)
  expect(result.players.qb2.vors).toBe(0)
  expect(result.players.qb3.vors).toBe(-10)
})

test('terminates shared-slot allocation with decimal projections', () => {
  const players = {
    ...playersAt('RB', [76.7, 76.7]),
    ...playersAt('TE', [30.2, 29.2]),
  }

  const result = calculateVors(
    players,
    ['WRRB_FLEX', 'REC_FLEX'],
    1,
  )

  expect(result.replacementBaselines.RB).toEqual({
    startersPerTeam: 1,
    starterCount: 1,
    replacementRank: 2,
    score: 76.7,
  })
  expect(result.replacementBaselines.TE).toEqual({
    startersPerTeam: 1,
    starterCount: 1,
    replacementRank: 2,
    score: 29.2,
  })
})

test('allocates each shared flex slot once using projected scores', () => {
  const players = {
    ...playersAt('RB', [30, 20, 10]),
    ...playersAt('WR', [29, 19, 9]),
  }

  const result = calculateVors(players, ['RB', 'WR', 'FLEX'], 1)

  expect(result.replacementBaselines.RB).toEqual({
    startersPerTeam: 2,
    starterCount: 2,
    replacementRank: 3,
    score: 10,
  })
  expect(result.replacementBaselines.WR).toEqual({
    startersPerTeam: 1,
    starterCount: 1,
    replacementRank: 2,
    score: 19,
  })
})

test('counts eligible flex slots, excludes bench slots, and leaves unsupported baselines empty', () => {
  const players = {
    ...playersAt('RB', [30, 25, 20, 15, 10]),
    ...playersAt('WR', [30, 25, 20, 15, 10]),
    ...playersAt('TE', [20, 15, 10, 5]),
  }

  const result = calculateVors(
    players,
    ['QB', 'RB', 'WR', 'TE', 'FLEX', 'WRRB_FLEX', 'REC_FLEX', 'BN'],
    1,
  )

  expect(result.replacementBaselines.RB).toEqual({
    startersPerTeam: 3,
    starterCount: 3,
    replacementRank: 4,
    score: 15,
  })
  expect(result.replacementBaselines.WR).toEqual({
    startersPerTeam: 2,
    starterCount: 2,
    replacementRank: 3,
    score: 20,
  })
  expect(result.replacementBaselines.TE).toEqual({
    startersPerTeam: 1,
    starterCount: 1,
    replacementRank: 2,
    score: 15,
  })
  expect(result.replacementBaselines.QB.score).toBeNull()
  expect(result.players.RB1.vors).toBe(15)
})

test('leaves VORS null when no replacement player is available', () => {
  const result = calculateVors(
    playersAt('K', [10, 8]),
    ['K'],
    2,
  )

  expect(result.replacementBaselines.K.score).toBeNull()
  expect(result.players.K1.vors).toBeNull()
  expect(result.players.K2.vors).toBeNull()
})

test('calculates per-game VORS from the season-total starter baseline', () => {
  const players = {
    first: { position: 'RB', fantasyPoints: 100, fantasyPointsPerGame: 10 },
    baseline: { position: 'RB', fantasyPoints: 80, fantasyPointsPerGame: 20 },
    other: { position: 'RB', fantasyPoints: 60, fantasyPointsPerGame: 30 },
    missing: { position: 'RB', fantasyPoints: 40, fantasyPointsPerGame: null },
  }
  const result = calculateVors(players, ['RB'], 1, 'fantasyPoints')
  expect(result.players.first).toMatchObject({ vors: 20, vorsPerGame: -10 })
  expect(result.players.baseline.vorsPerGame).toBe(0)
  expect(result.players.other.vorsPerGame).toBe(10)
  expect(result.players.missing.vorsPerGame).toBeNull()

  players.baseline.fantasyPointsPerGame = null
  expect(calculateVors(players, ['RB'], 1, 'fantasyPoints').players.first)
    .toMatchObject({ vors: 20, vorsPerGame: null })
  expect(calculateVors(players, ['RB'], 4, 'fantasyPoints').players.first.vorsPerGame).toBeNull()
})
