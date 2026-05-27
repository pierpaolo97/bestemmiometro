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
  where,
  getDocs,
} from 'firebase/firestore'
import { db } from './firebase'
import { Info, Plus, Trash2, Trophy, Users, UserPlus, X } from 'lucide-react'
import './App.css'

export default function App() {
  const [players, setPlayers] = useState([])
  const [newPlayerName, setNewPlayerName] = useState('')
  const [newPlayerRole, setNewPlayerRole] = useState('dev')
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [newPenaltyDescription, setNewPenaltyDescription] = useState('')
  const [showInfo, setShowInfo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const [historyModal, setHistoryModal] = useState(null)
  const [selectedPenalties, setSelectedPenalties] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

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

  const ranking = useMemo(() => {
    return [...players].sort((a, b) => (b.score || 0) - (a.score || 0))
  }, [players])

  async function addPlayer(event) {
    event.preventDefault()

    const cleanName = newPlayerName.trim()
    if (!cleanName) return

    await addDoc(collection(db, 'players'), {
      name: cleanName,
      role: newPlayerRole,
      score: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    setNewPlayerName('')
    setNewPlayerRole('dev')
  }

  async function assignPenalty(event) {
    event.preventDefault()

    const description = newPenaltyDescription.trim()
    if (!selectedPlayerId || !description) return

    const selectedPlayer = players.find((player) => player.id === selectedPlayerId)
    if (!selectedPlayer) return

    await addDoc(collection(db, 'penalties'), {
      targetId: selectedPlayer.id,
      targetName: selectedPlayer.name,
      targetRole: selectedPlayer.role || 'team',
      targetType: 'player',
      description,
      createdAt: serverTimestamp(),
    })

    await updateDoc(doc(db, 'players', selectedPlayer.id), {
      score: increment(1),
      updatedAt: serverTimestamp(),
    })

    triggerBestemmiaEffect()
    showToast(`🔥 ${selectedPlayer.name}: ${description}`, 'danger')

    setSelectedPlayerId('')
    setNewPenaltyDescription('')
  }

  async function openHistoryModal(target) {
    setHistoryModal(target)
    setHistoryLoading(true)
    setSelectedPenalties([])

    try {
      const q = query(
        collection(db, 'penalties'),
        where('targetId', '==', target.id),
        where('targetType', '==', 'player'),
        orderBy('createdAt', 'desc')
      )

      const snapshot = await getDocs(q)

      const data = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }))

      setSelectedPenalties(data)
    } catch (error) {
      console.error('Errore caricamento storico:', error)
      showToast(`Errore storico: ${error.message}`, 'danger')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function deletePenalty(penalty) {
    const confirmed = window.confirm('Vuoi davvero eliminare questa bestemmia?')
    if (!confirmed) return

    await deleteDoc(doc(db, 'penalties', penalty.id))

    await updateDoc(doc(db, 'players', penalty.targetId), {
      score: increment(-1),
      updatedAt: serverTimestamp(),
    })

    triggerRedemptionEffect()
    showToast(`🙏 Bestemmia rimossa: ${penalty.description}`, 'success')

    setSelectedPenalties((current) =>
      current.filter((item) => item.id !== penalty.id)
    )
  }
  
async function deletePlayerFromHistory(player) {
  const confirmed = window.confirm(
    `Vuoi davvero rimuovere ${player.name}?\n\nVerranno eliminate anche tutte le bestemmie associate.`
  )

  if (!confirmed) return

  try {
    const q = query(
      collection(db, 'penalties'),
      where('targetId', '==', player.id)
    )

    const snapshot = await getDocs(q)

    const deletions = snapshot.docs.map((document) =>
      deleteDoc(doc(db, 'penalties', document.id))
    )

    await Promise.all(deletions)

    await deleteDoc(doc(db, 'players', player.id))

    showToast(
      `🗑️ ${player.name} è stato rimosso`,
      'success'
    )

    setHistoryModal(null)
  } catch (error) {
    console.error(error)

    showToast(
      'Errore durante la rimozione',
      'danger'
    )
  }
}

  function getRoleLabel(role) {
    const labels = {
      dev: 'Sviluppo',
      pm: 'Project Manager',
      qa: 'Quality Assurance',
      analyst: 'Analista funzionale',
    }

    return labels[role] || 'Team'
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
      emoji.style.animationDelay = '0s'

      container.appendChild(emoji)
    }

    setTimeout(() => {
      container.remove()
    }, 2500)
  }

  function triggerBestemmiaEffect() {
    triggerEmojiExplosion(['✝️', '🔥'])
  }

  function triggerRedemptionEffect() {
    triggerEmojiExplosion(['🙏', '🕊️'])
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
        <section id="classifica" className="panel ranking-panel">
          <div className="panel-title">
            <Trophy />

            <div>
              <h2>Classifica</h2>
              <p className="panel-subtitle">
                Clicca su un giocatore per vedere le bestemmie
              </p>
            </div>
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
                <button
                  className={`ranking-row ${player.role || 'team'}`}
                  key={player.id}
                  onClick={() =>
                    openHistoryModal({
                      id: player.id,
                      name: player.name,
                      role: player.role || 'team',
                    })
                  }
                >
                  <span className={`rank-position rank-${index + 1}`}>
                    {index + 1}
                  </span>

                  <div>
                    <span className="rank-name">{player.name}</span>
                    <span className={`role-badge role-${player.role}`}></span>
                  </div>

                  <strong>{player.score || 0}</strong>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="panel add-player-panel">
          <div className="panel-title">
            <Users />
            <h2>Aggiungi giocatore</h2>
          </div>

          <form onSubmit={addPlayer} className="add-player-form">
            <input
              type="text"
              placeholder="Nome partecipante"
              value={newPlayerName}
              onChange={(event) => setNewPlayerName(event.target.value)}
            />

            <select
              value={newPlayerRole}
              onChange={(event) => setNewPlayerRole(event.target.value)}
            >
              <option value="dev">Sviluppo</option>
              <option value="pm">Project Manager</option>
              <option value="qa">Quality Assurance</option>
              <option value="analyst">Analista funzionale</option>
            </select>

            <button type="submit">
              <UserPlus size={18} />
              Aggiungi
            </button>
          </form>
        </section>

        <section className="panel add-penalty-panel">
          <div className="panel-title">
            <Plus />
            <h2>Aggiungi bestemmia</h2>
          </div>

          <form onSubmit={assignPenalty} className="add-penalty-form">
            <select
              value={selectedPlayerId}
              onChange={(event) => setSelectedPlayerId(event.target.value)}
            >
              <option value="">Seleziona giocatore</option>

              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name} - {getRoleLabel(player.role)}
                </option>
              ))}
            </select>

            <textarea
              placeholder="Es. Non ha letto l'analisi"
              value={newPenaltyDescription}
              onChange={(event) => setNewPenaltyDescription(event.target.value)}
            />

            <button
              type="submit"
              disabled={!selectedPlayerId || !newPenaltyDescription.trim()}
            >
              🔥 Assegna bestemmia
            </button>
          </form>
        </section>
      </section>

      <section className="donation-panel">
        <div className="donation-content">
          <div>
            <p className="donation-label">Ogni bestemmia ha un costo.</p>
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

      {historyModal && (
        <div className="modal-backdrop" onClick={() => setHistoryModal(null)}>
          <div className="modal history-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setHistoryModal(null)}>
              <X />
            </button>

            <h2>Bestemmie di {historyModal.name}</h2>

            {historyLoading ? (
              <p>Caricamento storico...</p>
            ) : selectedPenalties.length === 0 ? (
              <p>Nessuna bestemmia registrata.</p>
            ) : (
              <div className="penalty-history-list">
                {selectedPenalties.map((penalty) => (
                  <div className="penalty-history-item" key={penalty.id}>
                    <div>
                      <p>{penalty.description}</p>
                      <span>
                        {penalty.createdAt?.toDate
                          ? penalty.createdAt.toDate().toLocaleDateString('it-IT')
                          : 'Data non disponibile'}
                      </span>
                    </div>

                    <button
                      className="history-delete-button"
                      onClick={() => deletePenalty(penalty)}
                    >
                      <Trash2 />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="history-footer">
              <button
                className="delete-player-button"
                onClick={() => deletePlayerFromHistory(historyModal)}
              >
                <Trash2 />
                Rimuovi giocatore
              </button>
            </div>
          </div>
        </div>
      )}

      {showInfo && (
        <div className="modal-backdrop" onClick={() => setShowInfo(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>Regole del gioco</h2>

            <p>
              Ogni bug in produzione, requisito ambiguo o call infinita può
              causare una bestemmia certificata.
            </p>

            <p>
             Sviluppatori, Project manager, analisti, tester sono tutti eleggibili. Nessuno è immune.
            </p>

            <p>
              Clicca su un giocatore in classifica per vedere lo storico e
              rimuovere eventuali bestemmie non valide.
            </p>

            <button onClick={() => setShowInfo(false)}>Chiudi</button>
          </div>
        </div>
      )}
    </main>
  )
}