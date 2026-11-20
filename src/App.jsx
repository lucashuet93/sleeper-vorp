import { useState } from 'react'
import { fetchLeaguesForUsername } from './sleeperApi.js'

function App() {
  const [username, setUsername] = useState('')
  const [leagues, setLeagues] = useState([])
  const [selectedLeagueId, setSelectedLeagueId] = useState('')
  const [selectedSeason, setSelectedSeason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const selectedLeague = leagues.find(
    (league) => league.league_id === selectedLeagueId,
  )

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setLeagues([])
    setSelectedLeagueId('')
    setSelectedSeason('')
    setConfirmed(false)
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

      {leagues.length > 0 && (
        <section aria-label="League and season selection">
          <label htmlFor="league">League</label>
          <select
            id="league"
            value={selectedLeagueId}
            onChange={(event) => {
              setSelectedLeagueId(event.target.value)
              setSelectedSeason('')
              setConfirmed(false)
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
                  setConfirmed(false)
                }}
              >
                <option value="">Select a season</option>
                {selectedLeague.seasons.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
            </>
          )}

          <button
            type="button"
            disabled={!selectedLeague || !selectedSeason}
            onClick={() => setConfirmed(true)}
          >
            Continue
          </button>
        </section>
      )}

      {confirmed && selectedLeague && (
        <p role="status">
          Selection confirmed: {selectedLeague.name}, {selectedSeason} season.
          Ready for the next step.
        </p>
      )}
    </>
  )
}

export default App
