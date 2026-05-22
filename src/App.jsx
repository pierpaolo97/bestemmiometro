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
import { Info, Plus, Minus, Trash2, Trophy, Users } from 'lucide-react'
import './App.css'

export default function App() {
  const [players, setPlayers] = useState([])
  const [newPlayerName, setNewPlayerName] = useState('')
  const [showInfo, setShowInfo] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'players'), orderBy('createdAt', 'asc'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }))

      setPlayers(data)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const ranking = useMemo(() => {
    return [...players].sort((a, b) => {
      const scoreA = a.score || 0
      const scoreB = b.score || 0
      return scoreB - scoreA
    })
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
    const currentScore = player.score || 0

    if (currentScore <= 0) return

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

  return (
    <main className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Team game tracker</p>
          <h1>Bestemmiometro</h1>
          <p className="subtitle">
            Conta le penitenze, tieni la classifica e scopri chi sta facendo
            perdere più pazienza al Project Manager.
          </p>
        </div>

        <button className="info-button" onClick={() => setShowInfo(true)}>
          <Info size={18} />
          Info
        </button>
      </header>

      <section className="menu">
        <a href="#classifica">
          <Trophy size={18} />
          Classifica
        </a>
        <a href="#giocatori">
          <Users size={18} />
          Giocatori
        </a>
        <a href="#aggiungi">
          <Plus size={18} />
          Aggiungi
        </a>
      </section>

      <section id="classifica" className="panel">
        <div className="panel-title">
          <Trophy />
          <h2>Classifica</h2>
        </div>

        {loading ? (
          <p>Caricamento dati...</p>
        ) : ranking.length === 0 ? (
          <p>Nessun giocatore ancora presente.</p>
        ) : (
          <div className="ranking-list">
            {ranking.map((player, index) => (
              <div className="ranking-row" key={player.id}>
                <span className="rank-position">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                </span>
                <span className="rank-name">{player.name}</span>
                <strong>{player.score || 0}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="giocatori" className="panel">
        <div className="panel-title">
          <Users />
          <h2>Giocatori</h2>
        </div>

        <div className="players-grid">
          {players.map((player) => (
            <article className="player-card" key={player.id}>
              <div>
                <h3>{player.name}</h3>
                <p>{player.score || 0} penitenze</p>
              </div>

              <div className="actions">
                <button onClick={() => removePenalty(player)} className="round-button">
                  <Minus size={18} />
                </button>

                <button onClick={() => addPenalty(player.id)} className="round-button primary">
                  <Plus size={18} />
                </button>

                <button onClick={() => removePlayer(player)} className="round-button danger">
                  <Trash2 size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="aggiungi" className="panel">
        <h2>Aggiungi giocatore</h2>

        <form onSubmit={addPlayer} className="add-form">
          <input
            type="text"
            placeholder="Nome partecipante"
            value={newPlayerName}
            onChange={(event) => setNewPlayerName(event.target.value)}
          />
          <button type="submit">
            <Plus size={18} />
            Aggiungi
          </button>
        </form>
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
              Il punteggio può essere aumentato o diminuito dai pulsanti sulla
              scheda del giocatore.
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