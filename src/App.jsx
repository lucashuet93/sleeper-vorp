import { createContext, useEffect, useRef, useState } from 'react'
import { fetchLeagueData, fetchLeaguesForUsername } from './sleeperApi.js'
import Dashboard from './Dashboard.jsx'

export const LeagueDataContext = createContext(null)

const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-2 focus:outline-offset-2 focus:outline-blue-600'
const buttonClass = 'rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50'

function App() {
  const [username, setUsername] = useState('')
  const [leagues, setLeagues] = useState([])
  const [selectedLeagueId, setSelectedLeagueId] = useState('')
  const [selectedSeason, setSelectedSeason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmedSelection, setConfirmedSelection] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [leagueData, setLeagueData] = useState(null)
  const [loadingLeague, setLoadingLeague] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const request = useRef({ nonce: 0, controller: null })

  function invalidateRequests() {
    request.current.nonce += 1
    request.current.controller?.abort()
    request.current.controller = null
    setLoading(false)
    setLoadingLeague(false)
    setLeagueData(null)
    setLastUpdated(null)
    setConfirmedSelection(null)
    setError('')
  }

  useEffect(() => () => {
    request.current.nonce += 1
    request.current.controller?.abort()
  }, [])

  const selectedLeague = leagues.find(
    (league) => league.league_id === selectedLeagueId,
  )
  const selectedSeasonRecord = selectedLeague?.seasons.find(
    (season) => season.season === selectedSeason,
  )

  async function handleSubmit(event) {
    event.preventDefault()
    invalidateRequests()
    const nonce = request.current.nonce
    setLoading(true)
    setError('')
    setLeagues([])
    setSelectedLeagueId('')
    setSelectedSeason('')
    setConfirmedSelection(null)
    setHasSearched(false)

    try {
      const results = await fetchLeaguesForUsername(username.trim())
      if (nonce !== request.current.nonce) return
      setLeagues(results)
      setHasSearched(true)
    } catch (requestError) {
      if (nonce !== request.current.nonce) return
      setError(
        requestError.message === 'user_not_found'
          ? 'No Sleeper account found for that username. Check the spelling and try again.'
          : 'Unable to load leagues right now. Please try again.',
      )
    } finally {
      if (nonce === request.current.nonce) setLoading(false)
    }
  }

  async function handleContinue() {
    if (!selectedLeague || !selectedSeasonRecord) {
      return
    }

    invalidateRequests()
    const selection = {
      leagueId: selectedSeasonRecord.league_id,
      leagueName: selectedLeague.name,
      season: selectedSeasonRecord.season,
    }
    await loadLeague(selection)
  }

  async function loadLeague(selection) {
    const nonce = request.current.nonce
    const controller = new AbortController()
    request.current.controller = controller
    setLoadingLeague(true)
    setError('')
    try {
      const data = await fetchLeagueData(selection.leagueId, selection.season, {
        signal: controller.signal,
        fresh: true,
      })
      if (nonce !== request.current.nonce) return
      setLeagueData(data)
      setConfirmedSelection(selection)
      setLastUpdated(new Date())
    } catch (requestError) {
      if (nonce !== request.current.nonce) return
      const messages = {
        league_not_found: 'This league could not be found. Please select another league.',
        unsupported_season: 'Player data is not available for this season. Select the current NFL season.',
        network_error: 'Unable to reach Sleeper. Please try again.',
        request_failed: 'Unable to load league data right now. Please try again.',
      }
      setError(messages[requestError.message] || messages.request_failed)
    } finally {
      if (nonce === request.current.nonce) {
        request.current.controller = null
        setLoadingLeague(false)
      }
    }
  }

  return (
    <LeagueDataContext.Provider value={leagueData}>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Fantasy football analytics</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Sleeper VORP</h1>
      </header>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-sm">
        <label htmlFor="sleeper-username" className="mb-1 block text-sm font-semibold text-slate-700">Sleeper username</label>
        <input
          id="sleeper-username"
          className={fieldClass}
          value={username}
          onChange={(event) => {
            invalidateRequests()
            setUsername(event.target.value)
            setLeagues([])
            setSelectedLeagueId('')
            setSelectedSeason('')
            setHasSearched(false)
          }}
          required
        />
        </div>
        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? 'Loading leagues…' : 'Find leagues'}
        </button>
      </form>

      {loading && <p role="status" className="text-sm text-slate-600">Loading your leagues…</p>}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {!loading && !error && hasSearched && leagues.length === 0 && (
        <p role="status" className="text-sm text-slate-600">No leagues found for this Sleeper username.</p>
      )}

      {leagues.length > 0 && !confirmedSelection && (
        <section aria-label="League and season selection" className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:flex-wrap">
          <div className="w-full sm:w-64">
          <label htmlFor="league" className="mb-1 block text-sm font-semibold text-slate-700">League</label>
          <select
            id="league"
            className={fieldClass}
            value={selectedLeagueId}
            onChange={(event) => {
              invalidateRequests()
              setSelectedLeagueId(event.target.value)
              setSelectedSeason('')
              setConfirmedSelection(null)
            }}
          >
            <option value="">Select a league</option>
            {leagues.map((league) => (
              <option key={league.league_id} value={league.league_id}>
                {league.name}
              </option>
            ))}
          </select>
          </div>

          {selectedLeague && (
            <div className="w-full sm:w-40">
              <label htmlFor="season" className="mb-1 block text-sm font-semibold text-slate-700">Season</label>
              <select
                id="season"
                className={fieldClass}
                value={selectedSeason}
                onChange={(event) => {
                  invalidateRequests()
                  setSelectedSeason(event.target.value)
                  setConfirmedSelection(null)
                }}
              >
                <option value="">Select a season</option>
                {selectedLeague.seasons.map((season) => (
                  <option
                    key={`${season.season}-${season.league_id}`}
                    value={season.season}
                  >
                    {season.season}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            disabled={!selectedLeague || !selectedSeasonRecord || loadingLeague}
            onClick={handleContinue}
            className={buttonClass}
          >
            Continue
          </button>
          {loadingLeague && <p role="status" className="text-sm text-slate-600">Loading league data…</p>}
        </section>
      )}

      {confirmedSelection && leagueData && (
        <>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-4">
            <p className="text-xl font-bold text-slate-900">League: {confirmedSelection.leagueName}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              <p>Season: {confirmedSelection.season}</p>
              <p>League ID: {confirmedSelection.leagueId}</p>
            </div>
          </div>
          <Dashboard
            leagueData={leagueData}
            onRefresh={() => loadLeague(confirmedSelection)}
            loading={loadingLeague}
            lastUpdated={lastUpdated}
          />
        </>
      )}
      </main>
    </LeagueDataContext.Provider>
  )
}

export default App
