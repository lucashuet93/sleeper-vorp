const SUPPORTED_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K']

const STARTER_SLOT_POSITIONS = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB'],
}

function getStarterCounts(rosterSettings) {
  const counts = Object.fromEntries(
    SUPPORTED_POSITIONS.map((position) => [position, 0]),
  )

  rosterSettings.forEach((slot) => {
    const positions = STARTER_SLOT_POSITIONS[slot] ?? []
    positions.forEach((position) => {
      counts[position] += 1
    })
  })

  return counts
}

export function calculateVors(
  players,
  rosterSettings,
  totalRosters,
  scoreField = 'projectedPoints',
) {
  if (!players || typeof players !== 'object' || Array.isArray(players)) {
    throw new TypeError('players must be a player directory object')
  }
  if (!Array.isArray(rosterSettings)) {
    throw new TypeError('rosterSettings must be an array')
  }
  if (!Number.isInteger(totalRosters) || totalRosters < 1) {
    throw new RangeError('totalRosters must be a positive integer')
  }

  const starterCounts = getStarterCounts(rosterSettings)
  const replacementBaselines = {}
  const vorsByPlayerId = {}

  SUPPORTED_POSITIONS.forEach((position) => {
    const starterCount = starterCounts[position] * totalRosters
    const replacementRank = starterCount + 1
    const rankedPlayers = Object.entries(players)
      .filter(([, player]) =>
        player?.position === position &&
        Number.isFinite(player[scoreField]),
      )
      .sort(([, left], [, right]) => right[scoreField] - left[scoreField])
    const replacementScore = starterCount > 0 &&
      replacementRank <= rankedPlayers.length
      ? rankedPlayers[replacementRank - 1][1][scoreField]
      : null

    replacementBaselines[position] = {
      startersPerTeam: starterCounts[position],
      starterCount,
      replacementRank: starterCount > 0 ? replacementRank : null,
      score: replacementScore,
    }

    rankedPlayers.forEach(([playerId, player]) => {
      vorsByPlayerId[playerId] = replacementScore == null
        ? null
        : player[scoreField] - replacementScore
    })
  })

  return {
    players: Object.fromEntries(
      Object.entries(players).map(([playerId, player]) => [
        playerId,
        { ...player, vors: vorsByPlayerId[playerId] ?? null },
      ]),
    ),
    replacementBaselines,
  }
}
