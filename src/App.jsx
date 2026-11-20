import { useEffect, useRef, useState } from 'react'
import { fetchLeagueData, fetchLeaguesForUsername } from './sleeperApi.js'

function App() {
  const [username, setUsername] = useState('')
  const [leagues, setLeagues] = useState([])
  const [selectedLeagueId, setSelectedLeagueId] = useState('')
  const [selectedSeason, setSelectedSeason] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingLeagueData, setLoadingLeagueData] = useState(false)
  const [error, setError] = useState('')
  const [confirmedSelection, setConfirmedSelection] = useState(null)
  const [leagueData, setLeagueData] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)
  const leagueRequest = useRef(0)

  useEffect(() => () => {
    leagueRequest.current += 1
  }, [])

  function invalidateLeagueRequest() {
    leagueRequest.current += 1
    setLoadingLeagueData(false)
  }

  const selectedLeague = leagues.find(
    (league) => league.league_id === selectedLeagueId,
  )
  const selectedSeasonRecord = selectedLeague?.seasons.find(
    (season) => season.season === selectedSeason,
  )

  async function handleSubmit(event) {
    event.preventDefault()
    invalidateLeagueRequest()
    setLoading(true)
    setError('')
    setLeagues([])
    setSelectedLeagueId('')
    setSelectedSeason('')
    setConfirmedSelection(null)
    setLeagueData(null)
    setHasSearched(false)

    try {
      const results = await fetchLeaguesForUsername(username.trim())
      setLeagues(results)
      setHasSearched(true)
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, 'leagues'),
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleContinue() {
    if (!selectedLeague || !selectedSeasonRecord) {
      return
    }

    const requestId = ++leagueRequest.current
    setLoadingLeagueData(true)
    setError('')
    setLeagueData(null)
    setConfirmedSelection(null)
    try {
      const data = await fetchLeagueData(selectedSeasonRecord.league_id)
      if (requestId !== leagueRequest.current) return
      setLeagueData(data)
      setConfirmedSelection({
        leagueId: selectedSeasonRecord.league_id,
        leagueName: selectedLeague.name,
        season: selectedSeasonRecord.season,
      })
    } catch (requestError) {
      if (requestId === leagueRequest.current) {
        setError(getErrorMessage(requestError, 'league data'))
      }
    } finally {
      if (requestId === leagueRequest.current) {
        setLoadingLeagueData(false)
      }
    }
  }

  return (
    <>
      <h1>Sleeper VORP</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="sleeper-username">Sleeper username</label>
        <input
          id="sleeper-username"
          value={username}
          onChange={(event) => {
            invalidateLeagueRequest()
            setUsername(event.target.value)
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
              invalidateLeagueRequest()
              setSelectedLeagueId(event.target.value)
              setSelectedSeason('')
              setConfirmedSelection(null)
              setLeagueData(null)
              setError('')
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
                  invalidateLeagueRequest()
                  setSelectedSeason(event.target.value)
                  setConfirmedSelection(null)
                  setLeagueData(null)
                  setError('')
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
            disabled={!selectedLeague || !selectedSeasonRecord || loadingLeagueData}
            onClick={handleContinue}
          >
            {loadingLeagueData ? 'Loading league data…' : 'Continue'}
          </button>
        </section>
      )}

      {loadingLeagueData && <p role="status">Loading league data from Sleeper…</p>}

      {confirmedSelection && (
        <section aria-label="Next step">
          <h2>Next step</h2>
          <p>League: {confirmedSelection.leagueName}</p>
          <p>Season: {confirmedSelection.season}</p>
          <p>League ID: {confirmedSelection.leagueId}</p>
          <p>Teams: {leagueData.teams.length}</p>
          <p>Player directory entries: {Object.keys(leagueData.playerDirectory).length}</p>
        </section>
      )}
    </>
  )
}

function getErrorMessage(error, resource) {
  if (error.message === 'user_not_found') {
    return 'No Sleeper account found for that username. Check the spelling and try again.'
  }
  if (error.message === 'league_not_found') {
    return 'That Sleeper league could not be found. Select another league and try again.'
  }
  if (error.message === 'rate_limited') {
    return 'Sleeper is rate-limiting requests. Please wait a moment and try again.'
  }
  return `Unable to load ${resource} right now. Please try again.`
}

export default App
