import { useState } from 'react'
import { fetchLeaguesForUsername } from './sleeperApi.js'

function App() {
  const [username, setUsername] = useState('')
  const [leagues, setLeagues] = useState([])
  const [selectedLeagueId, setSelectedLeagueId] = useState('')
  const [selectedSeason, setSelectedSeason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmedSelection, setConfirmedSelection] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)

  const selectedLeague = leagues.find(
    (league) => league.league_id === selectedLeagueId,
  )
  const selectedSeasonRecord = selectedLeague?.seasons.find(
    (season) => season.season === selectedSeason,
  )

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setLeagues([])
    setSelectedLeagueId('')
    setSelectedSeason('')
    setConfirmedSelection(null)
    setHasSearched(false)

    try {
      const results = await fetchLeaguesForUsername(username.trim())
      setLeagues(results)
      setHasSearched(true)
    } catch (requestError) {
      setError(
        requestError.message === 'user_not_found'
          ? 'No Sleeper account found for that username. Check the spelling and try again.'
          : 'Unable to load leagues right now. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  function handleContinue() {
    if (!selectedLeague || !selectedSeasonRecord) {
      return
    }

    setConfirmedSelection({
      leagueId: selectedSeasonRecord.league_id,
      leagueName: selectedLeague.name,
      season: selectedSeasonRecord.season,
    })
  }

  return (
    <>
      <h1>Sleeper VORP</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="sleeper-username">Sleeper username</label>
        <input
          id="sleeper-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
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
            disabled={!selectedLeague || !selectedSeasonRecord}
            onClick={handleContinue}
          >
            Continue
          </button>
        </section>
      )}

      {confirmedSelection && (
        <section aria-label="Next step">
          <h2>Next step</h2>
          <p>League: {confirmedSelection.leagueName}</p>
          <p>Season: {confirmedSelection.season}</p>
          <p>League ID: {confirmedSelection.leagueId}</p>
        </section>
      )}
    </>
  )
}

export default App
