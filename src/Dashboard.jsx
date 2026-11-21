import { useMemo, useState } from 'react'
import { calculateVorp } from './vorp.js'
import { calculateVors } from './vors.js'

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K']

function Dashboard({ leagueData }) {
  const [position, setPosition] = useState('All')
  const [method, setMethod] = useState('rank-based')
  const [sort, setSort] = useState({ field: 'vorp', direction: 'desc' })

  const players = useMemo(() => {
    const directory = leagueData.players ?? {}
    const rosterSettings = leagueData.rosterSettings
    const scoringSettings = leagueData.scoringSettings
    const totalRosters = leagueData.league?.total_rosters
    const canCalculate = Array.isArray(rosterSettings) && rosterSettings.length > 0 &&
      scoringSettings && typeof scoringSettings === 'object' &&
      Object.keys(scoringSettings).length > 0 &&
      Number.isInteger(totalRosters) && totalRosters > 0
    const withPerformance = Object.fromEntries(
      Object.entries(directory).filter(([, player]) => {
        const stats = player?.stats ?? player?.projections
        return stats && typeof stats === 'object' &&
          Object.values(stats).some(Number.isFinite)
      }),
    )
    const vorp = canCalculate ? calculateVorp({
      players: withPerformance,
      scoringSettings,
      rosterSettings,
      totalRosters,
      replacementMethod: method,
    }) : {}
    const values = canCalculate
      ? calculateVors(vorp, rosterSettings, totalRosters, 'fantasyPoints').players
      : {}

    return Object.entries(directory)
      .filter(([, player]) => typeof player?.position === 'string' &&
        POSITIONS.includes(player.position.toUpperCase()))
      .map(([id, player]) => ({
        id,
        name: player.full_name || [player.first_name, player.last_name].filter(Boolean).join(' ') || id,
        position: player.position.toUpperCase(),
        fantasyPoints: values[id]?.fantasyPoints ?? null,
        vorp: values[id]?.vorp ?? null,
        vors: values[id]?.vors ?? null,
      }))
  }, [leagueData, method])

  const visiblePlayers = players
    .filter((player) => position === 'All' || player.position === position)
    .sort((left, right) => {
      const a = left[sort.field]
      const b = right[sort.field]
      if (a == null) return b == null ? 0 : 1
      if (b == null) return -1
      return sort.direction === 'desc' ? b - a : a - b
    })

  function changeSort(field) {
    setSort((current) => ({
      field,
      direction: current.field === field && current.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  return (
    <section aria-label="VORP and VORS dashboard">
      <h2>Player dashboard</h2>
      <label htmlFor="replacement-method">Replacement-level method</label>
      <select id="replacement-method" value={method} onChange={(event) => setMethod(event.target.value)}>
        <option value="rank-based">Rank-based</option>
        <option value="free-agent">Free agent</option>
      </select>

      <div aria-label="Filter by position">
        {['All', ...POSITIONS].map((item) => (
          <button key={item} type="button" aria-pressed={position === item} onClick={() => setPosition(item)}>
            {item}
          </button>
        ))}
      </div>

      {players.some((player) => player.fantasyPoints == null) && (
        <p>Fantasy points, VORP, and VORS are unavailable without player performance data and league settings.</p>
      )}
      <table>
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Position</th>
            {[['fantasyPoints', 'Fantasy points'], ['vorp', 'VORP'], ['vors', 'VORS']].map(([field, label]) => (
              <th key={field} scope="col" aria-sort={sort.field === field ? (sort.direction === 'desc' ? 'descending' : 'ascending') : 'none'}>
                <button type="button" onClick={() => changeSort(field)}>{label}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visiblePlayers.map((player) => (
            <tr key={player.id}>
              <th scope="row">{player.name}</th>
              <td>{player.position}</td>
              <td>{player.fantasyPoints == null ? '—' : player.fantasyPoints.toFixed(2)}</td>
              <td>{player.vorp == null ? '—' : player.vorp.toFixed(2)}</td>
              <td>{player.vors == null ? '—' : player.vors.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {visiblePlayers.length === 0 && <p>No players found for this position.</p>}
    </section>
  )
}

export default Dashboard
