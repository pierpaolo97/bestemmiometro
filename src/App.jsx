import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  increment,
} from 'firebase/firestore'
import { db } from './firebase'
import { Info, Plus, Minus, Trash2, Trophy, Users, UserPlus } from 'lucide-react'
import './App.css'

export default function App() {
  const [players, setPlayers] = useState([])
  const [newPlayerName, setNewPlayerName] = useState('')
  const [showInfo, setShowInfo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'players'), orderBy('createdAt', 'asc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }))

        setPlayers(data)
        setLoading(false)
      },
      (error) => {
        console.error('Errore Firestore:', error)
        setError(error.message)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  const ranking = useMemo(() => {
    return [...players].sort((a, b) => (b.score || 0) - (a.score || 0))
  }, [players])

  async function addPlayer(event) {
    event.preventDefault()

    const cleanName = newPlayerName.trim()
    if (!cleanName) return

    await addDoc(collection(db, 'players'), {
      name: cleanName,
      score: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    setNewPlayerName('')
  }

  async function addPenalty(playerId) {
    await updateDoc(doc(db, 'players', playerId), {
      score: increment(1),
      updatedAt: serverTimestamp(),
    })
  }

  async function removePenalty(player) {
    if ((player.score || 0) <= 0) return

    await updateDoc(doc(db, 'players', player.id), {
      score: increment(-1),
      updatedAt: serverTimestamp(),
    })
  }

  async function removePlayer(player) {
    const confirmed = window.confirm(`Vuoi davvero rimuovere ${player.name}?`)
    if (!confirmed) return

    await deleteDoc(doc(db, 'players', player.id))
  }

  function getInitial(name) {
    return name?.charAt(0)?.toUpperCase() || '?'
  }

  return (
    <main className="app">
      <header className="hero">
        <img
          className="hero-logo"
          src={`${import.meta.env.BASE_URL}images/bestemmiometro-header.PNG`}
          alt="Bestemmiometro"
        />

        <button className="info-button" onClick={() => setShowInfo(true)}>
          <Info size={18} />
          Info
        </button>
      </header>

      <section className="dashboard">
        <section id="giocatori" className="panel players-panel">
          <div className="panel-title">
            <Users />
            <h2>Giocatori</h2>
          </div>

          <form onSubmit={addPlayer} className="add-form">
            <input
              type="text"
              placeholder="Nome partecipante"
              value={newPlayerName}
              onChange={(event) => setNewPlayerName(event.target.value)}
            />
            <button type="submit">
              <UserPlus size={18} />
              Aggiungi
            </button>
          </form>

          {loading ? (
            <p className="muted">Caricamento dati...</p>
          ) : error ? (
            <p className="error-message">Errore database: {error}</p>
          ) : players.length === 0 ? (
            <p className="muted">Nessun giocatore ancora presente.</p>
          ) : (
            <div className="players-list">
              {players.map((player) => (
                <article className="player-card" key={player.id}>
                  <div className="player-main">
                    <div className="avatar">{getInitial(player.name)}</div>

                    <div>
                      <h3>{player.name}</h3>
                      <p>{player.score || 0} penitenze</p>
                    </div>
                  </div>

                  <strong className="score">{player.score || 0}</strong>

                  <div className="actions">
                    <button onClick={() => removePenalty(player)} className="round-button minus">
                      <Minus size={18} />
                    </button>

                    <button onClick={() => addPenalty(player.id)} className="round-button primary">
                      <Plus size={18} />
                    </button>

                    <button onClick={() => removePlayer(player)} className="trash-button">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="classifica" className="panel ranking-panel">
          <div className="panel-title">
            <Trophy />
            <h2>Classifica</h2>
          </div>

          {loading ? (
            <p className="muted">Caricamento dati...</p>
          ) : error ? (
            <p className="error-message">Errore database: {error}</p>
          ) : ranking.length === 0 ? (
            <p className="muted">Nessun giocatore ancora presente.</p>
          ) : (
            <div className="ranking-list">
              {ranking.map((player, index) => (
                <div className="ranking-row" key={player.id}>
                  <span className={`rank-position rank-${index + 1}`}>
                    {index + 1}
                  </span>
                  <span className="rank-name">{player.name}</span>
                  <strong>{player.score || 0}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>

      {showInfo && (
        <div className="modal-backdrop" onClick={() => setShowInfo(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>Regole del gioco</h2>
            <p>
              Ogni volta che un partecipante fa arrabbiare il Project Manager,
              riceve una penitenza.
            </p>
            <p>
              I pulsanti + e - servono per aumentare o diminuire il punteggio.
            </p>
            <p>
              La classifica mostra in alto chi ha accumulato più penitenze.
            </p>
            <button onClick={() => setShowInfo(false)}>Chiudi</button>
          </div>
        </div>
      )}
    </main>
  )
}