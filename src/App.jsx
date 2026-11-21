import { createContext, useEffect, useRef, useState } from 'react'
import { fetchLeagueData, fetchLeaguesForUsername } from './sleeperApi.js'
import Dashboard from './Dashboard.jsx'

export const LeagueDataContext = createContext(null)

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
      <h1>Sleeper VORP</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="sleeper-username">Sleeper username</label>
        <input
          id="sleeper-username"
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
        <button type="submit" disabled={loading}>
          {loading ? 'Loading leagues…' : 'Find leagues'}
        </button>
      </form>

      {loading && <p role="status">Loading your leagues…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && hasSearched && leagues.length === 0 && (
        <p role="status">No leagues found for this Sleeper username.</p>
      )}

      {leagues.length > 0 && !confirmedSelection && (
        <section aria-label="League and season selection">
          <label htmlFor="league">League</label>
          <select
            id="league"
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

          {selectedLeague && (
            <>
              <label htmlFor="season">Season</label>
              <select
                id="season"
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
            </>
          )}

          <button
            type="button"
            disabled={!selectedLeague || !selectedSeasonRecord || loadingLeague}
            onClick={handleContinue}
          >
            Continue
          </button>
          {loadingLeague && <p role="status">Loading league data…</p>}
        </section>
      )}

      {confirmedSelection && leagueData && (
        <>
          <p>League: {confirmedSelection.leagueName}</p>
          <p>Season: {confirmedSelection.season}</p>
          <p>League ID: {confirmedSelection.leagueId}</p>
          <Dashboard
            leagueData={leagueData}
            onRefresh={() => loadLeague(confirmedSelection)}
            loading={loadingLeague}
            lastUpdated={lastUpdated}
          />
        </>
      )}
    </LeagueDataContext.Provider>
  )
}

export default App
