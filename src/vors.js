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
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
}

function getStarterConfiguration(rosterSettings) {
  const counts = Object.fromEntries(
    SUPPORTED_POSITIONS.map((position) => [position, 0]),
  )
  const sharedSlots = {}

  rosterSettings.forEach((slot) => {
    const positions = STARTER_SLOT_POSITIONS[slot] ?? []
    if (SUPPORTED_POSITIONS.includes(slot)) counts[slot] += 1
    else if (positions.length) sharedSlots[slot] = (sharedSlots[slot] ?? 0) + 1
  })

  return { counts, sharedSlots }
}

function addEdge(graph, from, to, capacity, cost) {
  const forward = {
    to,
    reverse: graph[to].length,
    capacity,
    initialCapacity: capacity,
    cost,
  }
  const backward = {
    to: from,
    reverse: graph[from].length,
    capacity: 0,
    initialCapacity: 0,
    cost: -cost,
  }
  graph[from].push(forward)
  graph[to].push(backward)
  return forward
}

function allocateSharedStarters(
  rankedPlayers,
  starterConfiguration,
  totalRosters,
  scoreField,
) {
  const sharedSlots = Object.entries(starterConfiguration.sharedSlots)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([slot, count]) => ({
      positions: STARTER_SLOT_POSITIONS[slot],
      count: count * totalRosters,
    }))
  const positionOffset = 1 + sharedSlots.length
  const sink = positionOffset + SUPPORTED_POSITIONS.length
  const graph = Array.from({ length: sink + 1 }, () => [])
  const source = 0
  const positionNodes = Object.fromEntries(
    SUPPORTED_POSITIONS.map((position, index) => [
      position,
      positionOffset + index,
    ]),
  )
  const allocationEdges = []

  sharedSlots.forEach(({ positions, count }, index) => {
    const slotNode = index + 1
    addEdge(graph, source, slotNode, count, 0)
    positions.forEach((position) => {
      const edge = addEdge(
        graph,
        slotNode,
        positionNodes[position],
        count,
        0,
      )
      allocationEdges.push({ edge, position })
    })
  })

  SUPPORTED_POSITIONS.forEach((position) => {
    const firstFlexibleRank =
      starterConfiguration.counts[position] * totalRosters
    rankedPlayers[position]
      .slice(firstFlexibleRank)
      .forEach(([, player]) => {
        addEdge(
          graph,
          positionNodes[position],
          sink,
          1,
          -player[scoreField],
        )
      })
  })

  while (true) {
    const distances = Array(graph.length).fill(Infinity)
    const previousNodes = Array(graph.length).fill(null)
    const previousEdges = Array(graph.length).fill(null)
    distances[source] = 0

    for (let pass = 0; pass < graph.length - 1; pass += 1) {
      let changed = false
      graph.forEach((edges, node) => {
        if (node === sink || !Number.isFinite(distances[node])) return
        edges.forEach((edge, edgeIndex) => {
          const distance = distances[node] + edge.cost
          if (edge.capacity > 0 && distance < distances[edge.to]) {
            distances[edge.to] = distance
            previousNodes[edge.to] = node
            previousEdges[edge.to] = edgeIndex
            changed = true
          }
        })
      })
      if (!changed) break
    }

    if (previousNodes[sink] == null) break

    for (let node = sink; node !== source; node = previousNodes[node]) {
      const from = previousNodes[node]
      const edge = graph[from][previousEdges[node]]
      edge.capacity -= 1
      graph[node][edge.reverse].capacity += 1
    }
  }

  return Object.fromEntries(
    SUPPORTED_POSITIONS.map((position) => [
      position,
      allocationEdges
        .filter((allocation) => allocation.position === position)
        .reduce(
          (allocated, { edge }) =>
            allocated + edge.initialCapacity - edge.capacity,
          0,
        ),
    ]),
  )
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

  const starterConfiguration = getStarterConfiguration(rosterSettings)
  const rankedPlayersByPosition = Object.fromEntries(
    SUPPORTED_POSITIONS.map((position) => [
      position,
      Object.entries(players)
        .filter(([, player]) => {
          const playerPosition = typeof player?.position === 'string'
            ? player.position.toUpperCase()
            : ''
          return playerPosition === position &&
            Number.isFinite(player[scoreField])
        })
        .sort(([, left], [, right]) => right[scoreField] - left[scoreField]),
    ]),
  )
  const flexStarterCounts = allocateSharedStarters(
    rankedPlayersByPosition,
    starterConfiguration,
    totalRosters,
    scoreField,
  )
  const replacementBaselines = {}
  const vorsByPlayerId = {}

  SUPPORTED_POSITIONS.forEach((position) => {
    const starterCount =
      starterConfiguration.counts[position] * totalRosters +
      flexStarterCounts[position]
    const hasStartingSlot = starterConfiguration.counts[position] > 0 ||
      Object.entries(starterConfiguration.sharedSlots).some(
        ([slot, count]) =>
          count > 0 && STARTER_SLOT_POSITIONS[slot].includes(position),
      )
    const replacementRank = hasStartingSlot ? starterCount + 1 : null
    const rankedPlayers = rankedPlayersByPosition[position]
    const replacementScore = replacementRank != null &&
      replacementRank <= rankedPlayers.length
      ? rankedPlayers[replacementRank - 1][1][scoreField]
      : null

    replacementBaselines[position] = {
      startersPerTeam:
        starterConfiguration.counts[position] +
        flexStarterCounts[position] / totalRosters,
      starterCount,
      replacementRank,
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
