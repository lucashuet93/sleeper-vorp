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
    startersPerTeam: 2,
    starterCount: 2,
    replacementRank: 3,
    score: 20,
  })
  expect(result.replacementBaselines.WR).toEqual({
    startersPerTeam: 3,
    starterCount: 3,
    replacementRank: 4,
    score: 15,
  })
  expect(result.replacementBaselines.TE).toEqual({
    startersPerTeam: 1,
    starterCount: 1,
    replacementRank: 2,
    score: 15,
  })
  expect(result.replacementBaselines.QB.score).toBeNull()
  expect(result.players.RB1.vors).toBe(10)
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
