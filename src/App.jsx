import { useEffect, useMemo, useRef, useState } from 'react'
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
  setDoc,
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
  const [projectManager, setProjectManager] = useState(null)
  const [pmName, setPmName] = useState('')
  const [toast, setToast] = useState(null)
  const toastTimeoutRef = useRef(null)

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

  useEffect(() => {
    const pmRef = doc(db, 'projectManager', 'main')

    const unsubscribe = onSnapshot(
      pmRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data()

          setProjectManager({
            id: snapshot.id,
            ...data,
          })

          setPmName(data.name || '')
        } else {
          setProjectManager(null)
        }
      },
      (error) => {
        console.error('Errore Project Manager:', error)
        setError(error.message)
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

  async function addPenalty(player) {
    triggerBestemmiaEffect()

    const randomMessages = [
      `${player.name} non ha letto l’analisi.`,
      `${player.name} ha saltato i regression test.`,
      `${player.name} ha deployato senza verifiche.`,
      `${player.name} ha detto “funziona in locale”.`,
      `${player.name} ha aperto un bug in produzione.`,
      `${player.name} ha sottovalutato il task.`,
      `${player.name} ha fatto merge direttamente su main.`,
      `${player.name} ha rotto la cassa.`,
      `${player.name} ha chiuso il ticket senza fix.`,
    ]

    const randomMessage =
      randomMessages[Math.floor(Math.random() * randomMessages.length)]

    showToast(`🔥 ${randomMessage}`, 'danger')

    await updateDoc(doc(db, 'players', player.id), {
      score: increment(1),
      updatedAt: serverTimestamp(),
    })
  }

  async function removePenalty(player) {
    if ((player.score || 0) <= 0) return

    triggerRedemptionEffect()

    const redemptionMessages = [
      `${player.name} ha finalmente letto il log.`,
      `${player.name} ha finalmente letto l'analisi.`,
      `${player.name} ha fixato il bug.`,
      `${player.name} ha fatto i test.`,
      `${player.name} ha trovato la root cause.`,
      `${player.name} ha evitato un hotfix.`,
    ]

    const randomMessage =
      redemptionMessages[Math.floor(Math.random() * redemptionMessages.length)]

    showToast(`🙏 ${randomMessage}`, 'success')

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

  function triggerEmojiExplosion(items) {
    const container = document.createElement('div')
    container.className = 'emoji-fireworks'
    document.body.appendChild(container)

    for (let i = 0; i < 35; i++) {
      const emoji = document.createElement('span')
      emoji.className = 'emoji-particle'
      emoji.textContent = items[Math.floor(Math.random() * items.length)]

      emoji.style.left = `${Math.random() * 100}vw`
      emoji.style.top = `${Math.random() * 100}vh`
      emoji.style.setProperty('--x', `${(Math.random() - 0.5) * 260}px`)
      emoji.style.setProperty('--y', `${(Math.random() - 0.5) * 260}px`)
      emoji.style.setProperty('--r', `${Math.random() * 720 - 360}deg`)
      emoji.style.animationDelay = `0s`

      container.appendChild(emoji)
    }

    setTimeout(() => {
      container.remove()
    }, 2200)
  }

  function showToast(message, type = 'danger') {
    setToast({ message, type })

    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }

    toastTimeoutRef.current = setTimeout(() => {
      setToast(null)
    }, 2700)
  }

  function triggerBestemmiaEffect() {
    triggerEmojiExplosion(['✝️', '🔥'])
  }

  function triggerRedemptionEffect() {
    triggerEmojiExplosion(['🙏', '🕊️'])
  }
  
  async function saveProjectManager(event) {
    event.preventDefault()

    const cleanName = pmName.trim()
    if (!cleanName) return

    await setDoc(
      doc(db, 'projectManager', 'main'),
      {
        name: cleanName,
        score: projectManager?.score || 0,
        updatedAt: serverTimestamp(),
        createdAt: projectManager?.createdAt || serverTimestamp(),
      },
      { merge: true }
    )
  }

  async function addProjectManagerPenalty() {
    triggerBestemmiaEffect()

    const phrases = [
      'Planning troppo ottimistico.',
      'Analisi funzionale poco chiara.',
      'Retrospettiva inevitabile.',
      'Il PM ha sottovalutato la complessità.',
      'Stakeholder management da rivedere.',
      '"In 10 minuti finisci" non ha funzionato.',
      'Rilascio pianificato di venerdì.',
      'Hanno aperto un problem.',
      'Il PM non ha letto le analisi.',
    ]

    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)]

    showToast(`🔥 ${randomPhrase}`, 'danger')

    if (!projectManager) {
      await setDoc(doc(db, 'projectManager', 'main'), {
        name: pmName.trim() || 'Project Manager',
        score: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } else {
      await updateDoc(doc(db, 'projectManager', 'main'), {
        score: increment(1),
        updatedAt: serverTimestamp(),
      })
    }
  }

  async function redeemProjectManagerPenalty() {
    if (!projectManager) return

    const currentScore = projectManager.score || 0

    if (currentScore <= 0) return

    triggerRedemptionEffect()

    await updateDoc(doc(db, 'projectManager', 'main'), {
      score: increment(-1),
      updatedAt: serverTimestamp(),
    })

    showToast('🙏 Il PM ha ottenuto una redenzione.', 'success')
  }

  return (
    <main className="app">
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
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
                      <p>{player.score || 0} bestemmie</p>
                    </div>
                  </div>

                  <strong className="score">{player.score || 0}</strong>

                  <div className="actions">
                    <button onClick={() => removePenalty(player)} className="round-button minus">
                      <Minus size={18} />
                    </button>

                    <button onClick={() => addPenalty(player)} className="round-button primary">
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

        <section className="panel pm-panel">
          <div className="panel-title pm-title">
            <span className="pm-crown">👑</span>
            <h2>Project Manager</h2>
          </div>

          <form onSubmit={saveProjectManager} className="pm-form">
            <input
              type="text"
              placeholder="Nome Project Manager"
              value={pmName}
              onChange={(event) => setPmName(event.target.value)}
            />

            <button type="submit">Salva PM</button>
          </form>

          <div className="pm-card">
            <div>
              <p className="pm-label">Responsabilità manageriali</p>
              <h3>{projectManager?.name || 'Project Manager'}</h3>
              <p>{projectManager?.score || 0} bestemmie PM</p>
            </div>

            <strong className="pm-score">{projectManager?.score || 0}</strong>
          </div>

          <div className="pm-actions">
            <button
              className="pm-penalty-button"
              onClick={addProjectManagerPenalty}
            >
              🔥 Colpa del PM
            </button>

            <button
              className="pm-redeem-button"
              onClick={redeemProjectManagerPenalty}
            >
              🙏 Redenzione PM
            </button>
          </div>

        </section>
      </section>
        <section className="donation-panel">
          <div className="donation-content">
            <div>
              <p className="donation-label">
                Ogni bestemmia ha un costo.
              </p>
              <p className="donation-text">
                Ogni penitenza contribuisce alla cassa comune.
              </p>
            </div>

            <a
              className="paypal-button"
              href="https://paypal.me/TUO_LINK"
              target="_blank"
              rel="noreferrer"
            >
              💸 Dona su PayPal
            </a>
          </div>
        </section>
        
      {showInfo && (
        <div className="modal-backdrop" onClick={() => setShowInfo(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>Regole del gioco</h2>
            <p>
              Ogni bug in produzione, requisito ambiguo o call infinita
              può causare una bestemmia certificata.
            </p>
            <p>
              Il Project Manager non è immune:
              planning troppo ottimistici e stime di 5 minuti
              possono ritorcersi contro.            
            </p>
            <p>
              La classifica determina chi è più vicino
              al burnout tecnico settimanale.            </p>
            <button onClick={() => setShowInfo(false)}>Chiudi</button>
          </div>
        </div>
      )}
    </main>
  )
}