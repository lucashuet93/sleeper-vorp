import { calculateVorp } from './vorp.js'

const players = {
  qb1: { position: 'QB', stats: { pass_td: 4, pass_yd: 200 }, rosterStatus: 'rostered' },
  qb2: { position: 'QB', stats: { pass_td: 2, pass_yd: 100 }, rosterStatus: 'free_agent' },
  rb1: { position: 'RB', stats: { rush_yd: 100 }, rosterStatus: 'rostered' },
  rb2: { position: 'RB', stats: { rush_yd: 60 }, rosterStatus: 'free_agent' },
  wr1: { position: 'WR', stats: { rec: 5 }, rosterStatus: 'rostered' },
  wr2: { position: 'WR', stats: { rec: 3 }, rosterStatus: 'free_agent' },
  te1: { position: 'TE', stats: { rec: 4 }, rosterStatus: 'rostered' },
  te2: { position: 'TE', stats: { rec: 2 }, rosterStatus: 'free_agent' },
  k1: { position: 'K', stats: { fg: 3 }, rosterStatus: 'rostered' },
  k2: { position: 'K', stats: { fg: 1 }, rosterStatus: 'free_agent' },
}

const scoringSettings = {
  pass_td: 4,
  pass_yd: 0.04,
  rush_yd: 0.1,
  rec: 1,
  fg: 3,
}

test('scores supported positions and uses rank-based replacement levels', () => {
  const result = calculateVorp({
    players,
    scoringSettings,
    rosterSettings: ['QB', 'RB', 'WR', 'TE', 'K', 'BN', 'IR'],
    totalRosters: 1,
  })

  expect(result.qb1).toMatchObject({
    fantasyPoints: 24,
    positionRank: 1,
    replacementPoints: 12,
    vorp: 12,
  })
  expect(result.rb1).toMatchObject({
    fantasyPoints: 10,
    replacementPoints: 6,
    vorp: 4,
  })
  expect(result.wr1.vorp).toBe(2)
  expect(result.te1.vorp).toBe(2)
  expect(result.k1.vorp).toBe(6)
  expect(result.qb2.vorp).toBe(0)
  expect(result.k2.vorp).toBe(0)
})

test('applies reception bonuses only to the matching position', () => {
  const result = calculateVorp({
    players: {
      rb1: { position: 'RB', stats: { rec: 5 } },
      rb2: { position: 'RB', stats: { rec: 3 } },
      wr1: { position: 'WR', stats: { rec: 5 } },
      wr2: { position: 'WR', stats: { rec: 3 } },
      te1: { position: 'TE', stats: { rec: 5 } },
      te2: { position: 'TE', stats: { rec: 3 } },
    },
    scoringSettings: {
      rec: 1,
      bonus_rec_rb: 0.1,
      bonus_rec_wr: 0.25,
      bonus_rec_te: 0.5,
    },
    rosterSettings: ['RB', 'WR', 'TE'],
    totalRosters: 1,
  })

  expect(result.rb1).toMatchObject({ fantasyPoints: 5.5, vorp: 2.2 })
  expect(result.wr1).toMatchObject({ fantasyPoints: 6.25, vorp: 2.5 })
  expect(result.te1).toMatchObject({ fantasyPoints: 7.5, vorp: 3 })
})

test('uses the best free agent at each position as the free-agent baseline', () => {
  const result = calculateVorp({
    players,
    scoringSettings,
    rosterSettings: ['QB', 'RB', 'WR', 'TE', 'K'],
    totalRosters: 1,
    replacementMethod: 'free-agent',
  })

  expect(result.qb1.replacementPoints).toBe(12)
  expect(result.rb1.replacementPoints).toBe(6)
  expect(result.wr1.replacementPoints).toBe(3)
  expect(result.te1.replacementPoints).toBe(2)
  expect(result.k1.replacementPoints).toBe(3)
  expect(result.qb2.vorp).toBe(0)
})

test('counts eligible starter and flex slots but excludes bench slots', () => {
  const result = calculateVorp({
    players: {
      ...players,
      qb3: { position: 'QB', stats: { pass_td: 1 }, rosterStatus: 'rostered' },
      rb3: { position: 'RB', stats: { rush_yd: 50 }, rosterStatus: 'rostered' },
      rb4: { position: 'RB', stats: { rush_yd: 40 }, rosterStatus: 'rostered' },
      wr3: { position: 'WR', stats: { rec: 1 }, rosterStatus: 'rostered' },
    },
    scoringSettings,
    rosterSettings: ['QB', 'SUPER_FLEX', 'RB', 'FLEX', 'BN', 'IR'],
    totalRosters: 1,
  })

  expect(result.qb3.replacementPoints).toBe(4)
  expect(result.rb2.replacementPoints).toBe(4)
  expect(result.wr1.replacementPoints).toBe(1)
})

test('accepts array input, ignores unsupported positions, and handles missing stats', () => {
  const result = calculateVorp({
    players: [
      { player_id: 'p1', position: 'RB', projections: { rush_yd: 10 } },
      { player_id: 'p2', position: 'DEF', stats: { rush_yd: 100 } },
      { player_id: 'p3', position: 'RB' },
    ],
    scoringSettings,
    rosterSettings: ['RB'],
    totalRosters: 1,
  })

  expect(result).toEqual({
    p1: {
      player_id: 'p1',
      position: 'RB',
      projections: { rush_yd: 10 },
      fantasyPoints: 1,
      fantasyPointsPerGame: null,
      positionRank: 1,
      replacementPoints: 0,
      vorp: 1,
      vorpPerGame: null,
    },
    p3: {
      player_id: 'p3',
      position: 'RB',
      fantasyPoints: 0,
      fantasyPointsPerGame: null,
      positionRank: 2,
      replacementPoints: 0,
      vorp: 0,
      vorpPerGame: null,
    },
  })
})

test.each(['QB', 'RB', 'WR', 'TE', 'K'])('uses the season-total %s replacement player for per-game values', (position) => {
    const result = calculateVorp({
      players: {
        first: { position, stats: { rec: 100, gp: 10 }, rosterStatus: 'rostered' },
        baseline: { position, stats: { rec: 80, gp: 4 }, rosterStatus: 'free_agent' },
        other: { position, stats: { rec: 60, gp: 2 }, rosterStatus: 'free_agent' },
      },
      scoringSettings: { rec: 1 },
      rosterSettings: [position],
      totalRosters: 1,
    })

    expect(result.first).toMatchObject({ fantasyPoints: 100, fantasyPointsPerGame: 10, vorp: 20, vorpPerGame: -10 })
    expect(result.baseline.vorpPerGame).toBe(0)
    expect(result.other.vorpPerGame).toBe(10)
  })

  test('uses the highest season-total free agent as the per-game baseline', () => {
    const result = calculateVorp({
      players: {
        starter: { position: 'QB', stats: { pass_yd: 100, gp: 10 }, rosterStatus: 'rostered' },
        first: { position: 'QB', stats: { pass_yd: 80, gp: 8 }, rosterStatus: 'free_agent' },
        second: { position: 'QB', stats: { pass_yd: 60, gp: 2 }, rosterStatus: 'free_agent' },
      },
      scoringSettings: { pass_yd: 1 },
      rosterSettings: ['QB'],
      totalRosters: 1,
      replacementMethod: 'free-agent',
    })
    expect(result.starter.vorpPerGame).toBe(0)
    expect(result.second.vorpPerGame).toBe(20)
  })

  test.each([undefined, null, 0, -1, 1.5, '4', Infinity])('does not estimate per-game values with invalid games played: %s', (gp) => {
    const result = calculateVorp({
      players: {
        first: { position: 'QB', stats: { pass_yd: 100, gp } },
        baseline: { position: 'QB', stats: { pass_yd: 50, gp: 5 } },
      },
      scoringSettings: { pass_yd: 1 },
      rosterSettings: ['QB'],
      totalRosters: 1,
    })
    expect(result.first).toMatchObject({ fantasyPoints: 100, fantasyPointsPerGame: null, vorpPerGame: null })
    expect(result.baseline.vorpPerGame).toBe(0)
  })

  test('leaves per-game VORP unavailable when the baseline has no games played or does not exist', () => {
    const options = {
      players: {
        first: { position: 'QB', stats: { pass_yd: 100, gp: 10 } },
        baseline: { position: 'QB', stats: { pass_yd: 50 } },
      },
      scoringSettings: { pass_yd: 1 },
      rosterSettings: ['QB'],
      totalRosters: 1,
    }
    expect(calculateVorp(options).first).toMatchObject({ fantasyPointsPerGame: 10, vorp: 50, vorpPerGame: null })
    expect(calculateVorp({ ...options, totalRosters: 3 }).first.vorpPerGame).toBeNull()
    expect(calculateVorp({ ...options, replacementMethod: 'free-agent' }).first.vorpPerGame).toBeNull()
  })

test('rejects unknown replacement methods', () => {
  expect(() => calculateVorp({ replacementMethod: 'average' })).toThrow(
    'replacementMethod must be "free-agent" or "rank-based"',
  )
})

test('does not derive per-game points from games played alone or projections', () => {
  const result = calculateVorp({
    players: {
      gamesOnly: { position: 'QB', stats: { gp: 4 } },
      projection: { position: 'QB', projections: { pass_yd: 100, gp: 4 } },
    },
    scoringSettings: { pass_yd: 1 },
  })
  expect(result.gamesOnly.fantasyPointsPerGame).toBeNull()
  expect(result.projection.fantasyPointsPerGame).toBeNull()
})
