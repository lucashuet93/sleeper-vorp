const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K']
const METRICS = ['vorp', 'vors']
const PLAYER_METRICS = [...METRICS, 'vorpPerGame', 'vorsPerGame']
const TOP_COUNT = 3

function rank(entries, metric) {
  return entries
    .filter((entry) => Number.isFinite(entry[metric]))
    .sort((left, right) => right[metric] - left[metric])
    .slice(0, TOP_COUNT)
}

function sum(entries, metric) {
  const values = entries.map((entry) => entry[metric]).filter(Number.isFinite)
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

export function calculateSummaryInsights(players, rosters = [], users = []) {
  const usersById = new Map(
    users.filter((user) => user?.user_id != null)
      .map((user) => [String(user.user_id), user]),
  )
  const teamsByRosterId = new Map()
  const teamsByOwnerId = new Map()
  const teams = []

  rosters.forEach((roster, index) => {
    const ownerId = roster.owner_id ?? null
    const owner = ownerId == null ? null : usersById.get(String(ownerId))
    const id = roster.roster_id ?? ownerId ?? index
    const team = {
      id: String(id),
      name: owner?.display_name || owner?.username || (ownerId == null ? null : String(ownerId)) ||
        `Team ${roster.roster_id ?? index + 1}`,
      ownerId,
      rosterId: roster.roster_id ?? null,
      members: [],
    }
    teams.push(team)
    if (team.rosterId != null) teamsByRosterId.set(String(team.rosterId), team)
    if (ownerId != null) teamsByOwnerId.set(String(ownerId), team)
  })

  players.forEach((player) => {
    if (player.teamId == null) return
    const team = teamsByRosterId.get(String(player.teamId)) ??
      teamsByOwnerId.get(String(player.teamId))
    if (team) team.members.push(player)
  })

  const teamAggregates = teams.map((team) => {
    const positionalTotals = Object.fromEntries(
      POSITIONS.map((position) => [
        position,
        Object.fromEntries(
          METRICS.map((metric) => [
            metric,
            sum(team.members.filter((player) => player.position === position), metric),
          ]),
        ),
      ]),
    )
    return {
      id: team.id,
      name: team.name,
      vorp: sum(team.members, 'vorp'),
      vors: sum(team.members, 'vors'),
      positionalTotals,
    }
  })

  const positionalAdvantages = Object.fromEntries(
    METRICS.map((metric) => {
      let largest = null
      POSITIONS.forEach((position) => {
        const positionTotals = teamAggregates.map((team, index) => {
          const value = team.positionalTotals[position][metric]
          const empty = !teams[index].members.some((player) => player.position === position)
          return { team, value: empty ? 0 : value, measured: Number.isFinite(value) }
        })
        if (!positionTotals.some(({ measured }) => measured)) return
        const totals = positionTotals
          .filter(({ value }) => Number.isFinite(value))
        const average = totals.reduce((total, entry) => total + entry.value, 0) / totals.length
        totals.forEach(({ team, value }) => {
          const advantage = value - average
          if (!largest || advantage > largest.value) {
            largest = { team, position, value: advantage }
          }
        })
      })
      return [metric, largest]
    }),
  )

  return {
    topPlayers: Object.fromEntries(
      PLAYER_METRICS.map((metric) => [metric, rank(players, metric)]),
    ),
    positionPlayers: Object.fromEntries(
      POSITIONS.map((position) => [
        position,
        Object.fromEntries(
          PLAYER_METRICS.map((metric) => [
            metric,
            rank(players.filter((player) => player.position === position), metric),
          ]),
        ),
      ]),
    ),
    topTeams: Object.fromEntries(
      METRICS.map((metric) => [metric, rank(teamAggregates, metric)]),
    ),
    positionalAdvantages,
  }
}
