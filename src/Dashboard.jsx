import { useMemo, useState } from 'react'
import { calculateVorp } from './vorp.js'
import { calculateVors } from './vors.js'
import { calculateSummaryInsights } from './summaryInsights.js'

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K']
const METRICS = [['vorp', 'VORP'], ['vors', 'VORS']]

function RankedTable({ entries, metric, title }) {
  return (
    <table aria-label={title}>
      <thead>
        <tr><th scope="col">Rank</th><th scope="col">Name</th><th scope="col">{metric.toUpperCase()}</th></tr>
      </thead>
      <tbody>
        {entries.map((entry, index) => (
          <tr key={entry.id}>
            <td>{index + 1}</td>
            <th scope="row">{entry.name}</th>
            <td>{entry[metric].toFixed(2)}</td>
          </tr>
        ))}
        {entries.length === 0 && <tr><td colSpan="3">No {metric.toUpperCase()} values available.</td></tr>}
      </tbody>
    </table>
  )
}

function Dashboard({ leagueData, onRefresh, loading, lastUpdated }) {
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
        teamId: player.roster?.rosterId ?? player.roster?.ownerId ?? null,
      }))
  }, [leagueData, method])
  const insights = useMemo(
    () => calculateSummaryInsights(players, leagueData.rosters, leagueData.users),
    [players, leagueData.rosters, leagueData.users],
  )

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
      {onRefresh && (
        <>
          <button type="button" onClick={onRefresh} disabled={loading}>Refresh</button>
          {loading && <p role="status">Refreshing league data…</p>}
          {lastUpdated && <p>Last updated: <time dateTime={lastUpdated.toISOString()}>{lastUpdated.toLocaleString()}</time></p>}
        </>
      )}
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
      <section aria-label="Summary insights">
        <h3>Top players overall</h3>
        {METRICS.map(([metric, label]) => (
          <RankedTable key={metric} title={`Top players overall by ${label}`} entries={insights.topPlayers[metric]} metric={metric} />
        ))}
        <h3>Top players by position</h3>
        {POSITIONS.map((item) => (
          <section key={item} aria-label={`Top ${item} players`}>
            <h4>{item}</h4>
            {METRICS.map(([metric, label]) => (
              <RankedTable key={metric} title={`Top ${item} players by ${label}`} entries={insights.positionPlayers[item][metric]} metric={metric} />
            ))}
          </section>
        ))}
        <h3>Top teams</h3>
        {METRICS.map(([metric, label]) => (
          <RankedTable key={metric} title={`Top teams by ${label}`} entries={insights.topTeams[metric]} metric={metric} />
        ))}
        <h3>Largest positional advantage</h3>
        {METRICS.map(([metric, label]) => {
          const advantage = insights.positionalAdvantages[metric]
          return (
            <p key={metric} aria-label={`Largest positional advantage by ${label}`}>
              {label}: {advantage
                ? `${advantage.team.name} at ${advantage.position} (${advantage.value.toFixed(2)} above league average)`
                : 'No team data available.'}
            </p>
          )
        })}
      </section>
      <table aria-label="Player values">
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
