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
      positionRank: 1,
      replacementPoints: 0,
      vorp: 1,
    },
    p3: {
      player_id: 'p3',
      position: 'RB',
      fantasyPoints: 0,
      positionRank: 2,
      replacementPoints: 0,
      vorp: 0,
    },
  })
})

test('rejects unknown replacement methods', () => {
  expect(() => calculateVorp({ replacementMethod: 'average' })).toThrow(
    'replacementMethod must be "free-agent" or "rank-based"',
  )
})
