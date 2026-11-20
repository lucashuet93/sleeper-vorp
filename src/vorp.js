const SUPPORTED_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K']
const POSITION_SLOTS = {
  QB: new Set(['QB', 'SUPER_FLEX']),
  RB: new Set(['RB', 'FLEX', 'WRRB_FLEX', 'SUPER_FLEX']),
  WR: new Set(['WR', 'FLEX', 'WRRB_FLEX', 'REC_FLEX', 'SUPER_FLEX']),
  TE: new Set(['TE', 'FLEX', 'REC_FLEX', 'SUPER_FLEX']),
  K: new Set(['K']),
}
const REPLACEMENT_METHODS = new Set(['free-agent', 'rank-based'])

function getPlayerEntries(players) {
  if (Array.isArray(players)) {
    return players.map((player, index) => [
      String(player?.player_id ?? player?.id ?? index),
      player,
    ])
  }
  return Object.entries(players ?? {})
}

function scorePlayer(player, scoringSettings) {
  const stats = player.stats ?? player.projections ?? {}
  return Object.entries(scoringSettings).reduce((total, [stat, points]) => {
    const value = stats[stat]
    return Number.isFinite(points) && Number.isFinite(value)
      ? total + points * value
      : total
  }, 0)
}

function getReplacementRank(position, rosterSettings, totalRosters) {
  if (!Number.isFinite(totalRosters) || totalRosters <= 0) return null
  const starters = rosterSettings.filter((slot) =>
    POSITION_SLOTS[position].has(slot),
  ).length
  return starters > 0 ? starters * totalRosters + 1 : null
}

export function calculateVorp({
  players = {},
  scoringSettings = {},
  rosterSettings = [],
  totalRosters,
  replacementMethod = 'rank-based',
} = {}) {
  if (!REPLACEMENT_METHODS.has(replacementMethod)) {
    throw new RangeError(
      'replacementMethod must be "free-agent" or "rank-based"',
    )
  }

  const settings = scoringSettings && typeof scoringSettings === 'object'
    ? scoringSettings
    : {}
  const slots = Array.isArray(rosterSettings) ? rosterSettings : []
  const byPosition = Object.fromEntries(
    SUPPORTED_POSITIONS.map((position) => [position, []]),
  )

  getPlayerEntries(players).forEach(([playerId, player], index) => {
    if (!player || typeof player !== 'object') return
    const position = typeof player.position === 'string'
      ? player.position.toUpperCase()
      : ''
    if (!byPosition[position]) return
    byPosition[position].push({
      playerId,
      player,
      index,
      fantasyPoints: scorePlayer(player, settings),
    })
  })

  const results = {}
  SUPPORTED_POSITIONS.forEach((position) => {
    const rankedPlayers = byPosition[position].sort(
      (left, right) =>
        right.fantasyPoints - left.fantasyPoints || left.index - right.index,
    )
    const replacementRank = getReplacementRank(position, slots, totalRosters)
    const replacementPoints = replacementMethod === 'free-agent'
      ? rankedPlayers.reduce((best, entry) => {
          if (entry.player.rosterStatus !== 'free_agent') return best
          return best === null || entry.fantasyPoints > best
            ? entry.fantasyPoints
            : best
        }, null) ?? 0
      : replacementRank == null
        ? 0
        : rankedPlayers[replacementRank - 1]?.fantasyPoints ?? 0

    rankedPlayers.forEach((entry, index) => {
      results[entry.playerId] = {
        ...entry.player,
        fantasyPoints: entry.fantasyPoints,
        positionRank: index + 1,
        replacementPoints,
        vorp: entry.fantasyPoints - replacementPoints,
      }
    })
  })
  return results
}
