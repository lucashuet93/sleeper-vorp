import { useMemo, useState } from 'react'
import { calculateVorp } from './vorp.js'
import { calculateVors } from './vors.js'
import { calculateSummaryInsights } from './summaryInsights.js'

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K']
const METRICS = [['vorp', 'VORP'], ['vors', 'VORS']]
const PLAYER_METRICS = [...METRICS, ['vorpPerGame', 'VORP/G'], ['vorsPerGame', 'VORS/G']]
const VALUE_COLUMNS = [
  ['fantasyPoints', 'Fantasy points'],
  ['fantasyPointsPerGame', 'Fantasy points/G'],
  ...PLAYER_METRICS,
]

function RankedTable({ entries, metric, label, title }) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table aria-label={title} className="w-full text-left text-sm">
        <caption className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-900">{label}</caption>
        <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
          <tr><th scope="col" className="px-4 py-2">Rank</th><th scope="col" className="px-4 py-2">Name</th><th scope="col" className="px-4 py-2 text-right">{label}</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((entry, index) => (
            <tr key={entry.id} className="even:bg-slate-50 hover:bg-blue-50">
              <td className="px-4 py-2 text-slate-600">{index + 1}</td>
              <th scope="row" className="px-4 py-2 font-medium">{entry.name}</th>
              <td className="px-4 py-2 text-right tabular-nums">{entry[metric].toFixed(2)}</td>
            </tr>
          ))}
          {entries.length === 0 && <tr><td colSpan="3" className="px-4 py-3 text-slate-600">No {label} values available.</td></tr>}
        </tbody>
      </table>
    </div>
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
          Object.entries(stats).some(([stat, value]) => stat !== 'gp' && Number.isFinite(value))
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
        fantasyPointsPerGame: values[id]?.fantasyPointsPerGame ?? null,
        vorp: values[id]?.vorp ?? null,
        vors: values[id]?.vors ?? null,
        vorpPerGame: values[id]?.vorpPerGame ?? null,
        vorsPerGame: values[id]?.vorsPerGame ?? null,
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
    <section aria-label="VORP and VORS dashboard" className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
      <div>
      <h2 className="text-2xl font-bold tracking-tight">Player dashboard</h2>
      {lastUpdated && <p className="mt-1 text-sm text-slate-600">Last updated: <time dateTime={lastUpdated.toISOString()}>{lastUpdated.toLocaleString()}</time></p>}
      {loading && onRefresh && <p role="status" className="mt-1 text-sm text-slate-600">Refreshing league data…</p>}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div>
      <label htmlFor="replacement-method" className="mb-1 block text-sm font-semibold text-slate-700">Replacement-level method</label>
      <select id="replacement-method" value={method} onChange={(event) => setMethod(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-2 focus:outline-offset-2 focus:outline-blue-600">
        <option value="rank-based">Rank-based</option>
        <option value="free-agent">Free agent</option>
      </select>
      </div>
      {onRefresh && (
        <button type="button" onClick={onRefresh} disabled={loading} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Refresh</button>
      )}
      </div>
      </div>

      <div aria-label="Filter by position" className="flex flex-wrap gap-2">
        {['All', ...POSITIONS].map((item) => (
          <button key={item} type="button" aria-pressed={position === item} onClick={() => setPosition(item)} className={`rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${position === item ? 'bg-blue-700 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-blue-50'}`}>
            {item}
          </button>
        ))}
      </div>

      {players.some((player) => player.fantasyPoints == null) && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Fantasy points, VORP, and VORS are unavailable without player performance data and league settings.</p>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm" tabIndex="0" role="region" aria-label="Scrollable player values">
      <table aria-label="Player values" className="w-full min-w-max text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-700">
          <tr>
            <th scope="col" className="px-4 py-3">Player</th>
            <th scope="col" className="px-4 py-3">Position</th>
            {VALUE_COLUMNS.map(([field, label]) => (
              <th key={field} scope="col" aria-sort={sort.field === field ? (sort.direction === 'desc' ? 'descending' : 'ascending') : 'none'} className="px-4 py-3 text-right">
                <button type="button" onClick={() => changeSort(field)} className="rounded text-blue-800 hover:text-blue-950 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
                  {label}{sort.field === field && <span aria-hidden="true"> {sort.direction === 'desc' ? '↓' : '↑'}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {visiblePlayers.map((player) => (
            <tr key={player.id} className="even:bg-slate-50 hover:bg-blue-50">
              <th scope="row" className="px-4 py-3 font-semibold">{player.name}</th>
              <td className="px-4 py-3 text-slate-600">{player.position}</td>
              {VALUE_COLUMNS.map(([field]) => (
                <td key={field} className="px-4 py-3 text-right tabular-nums">{player[field] == null ? '—' : player[field].toFixed(2)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {visiblePlayers.length === 0 && <p className="text-sm text-slate-600">No players found for this position.</p>}

      <section aria-label="Summary insights" className="space-y-6">
        <h3 className="text-xl font-bold tracking-tight">Top players overall</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLAYER_METRICS.map(([metric, label]) => (
          <RankedTable key={metric} title={`Top players overall by ${label}`} entries={insights.topPlayers[metric]} metric={metric} label={label} />
        ))}
        </div>
        <h3 className="text-xl font-bold tracking-tight">Top players by position</h3>
        {POSITIONS.map((item) => (
          <section key={item} aria-label={`Top ${item} players`} className="space-y-3">
            <h4 className="text-base font-bold text-blue-800">{item}</h4>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {PLAYER_METRICS.map(([metric, label]) => (
              <RankedTable key={metric} title={`Top ${item} players by ${label}`} entries={insights.positionPlayers[item][metric]} metric={metric} label={label} />
            ))}
            </div>
          </section>
        ))}
        <h3 className="text-xl font-bold tracking-tight">Top teams</h3>
        <div className="grid gap-4 md:grid-cols-2">
        {METRICS.map(([metric, label]) => (
          <RankedTable key={metric} title={`Top teams by ${label}`} entries={insights.topTeams[metric]} metric={metric} label={label} />
        ))}
        </div>
        <h3 className="text-xl font-bold tracking-tight">Largest positional advantage</h3>
        <div className="grid gap-4 md:grid-cols-2">
        {METRICS.map(([metric, label]) => {
          const advantage = insights.positionalAdvantages[metric]
          return (
            <p key={metric} aria-label={`Largest positional advantage by ${label}`} className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm font-medium text-blue-950">
              {label}: {advantage
                ? `${advantage.team.name} at ${advantage.position} (${advantage.value.toFixed(2)} above league average)`
                : 'No team data available.'}
            </p>
          )
        })}
        </div>
      </section>
    </section>
  )
}

export default Dashboard
