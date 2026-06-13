import { useEffect, useMemo, useRef, useState } from 'react'
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import { Info, Plus, Trash2, Trophy, Users, UserPlus, X, LogOut } from 'lucide-react'
import './App.css'
import { getToken, onMessage } from 'firebase/messaging'
import { messaging } from './firebase'

const SESSION_KEY = 'bestemmiometro_user'

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    return saved ? JSON.parse(saved) : null
  })

  const [loginTeamKey, setLoginTeamKey] = useState('')
  const [loginFirstName, setLoginFirstName] = useState('')
  const [loginLastName, setLoginLastName] = useState('')
  const [loginError, setLoginError] = useState('')

  const [users, setUsers] = useState([])
  const [events, setEvents] = useState([])

  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newAccessRole, setNewAccessRole] = useState('player')

  const [selectedTargetId, setSelectedTargetId] = useState('')
  const [selectedEventType, setSelectedEventType] = useState('bestemmia')
  const [eventDescription, setEventDescription] = useState('')

  const [showInfo, setShowInfo] = useState(false)
  const [toast, setToast] = useState(null)
  const [historyModal, setHistoryModal] = useState(null)

  const toastTimeoutRef = useRef(null)

  const isMaintainer = currentUser?.accessRole === 'maintainer'
  const [showNotificationModal, setShowNotificationModal] = useState(false)

  async function enableNotifications() {
    try {
      if (!('Notification' in window)) {
        showToast('Notifiche non supportate su questo dispositivo.', 'danger')
        return
      }

      const permission = await Notification.requestPermission()

      if (permission !== 'granted') {
        showToast('Permesso notifiche non concesso.', 'danger')
        return
      }

      const registration = await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}firebase-messaging-sw.js`
      )

      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration,
      })

      if (!token) {
        showToast('Token notifiche non generato.', 'danger')
        return
      }

      await updateDoc(doc(db, 'users', currentUser.id), {
        notificationToken: token,
        notificationsEnabled: true,
        updatedAt: serverTimestamp(),
      })

      showToast('Notifiche abilitate.', 'success')
    } catch (error) {
      console.error('Errore notifiche:', error)
      showToast('Errore attivazione notifiche.', 'danger')
    }
  }

  useEffect(() => {
    if (!currentUser?.teamKey) return

    const usersQuery = query(
      collection(db, 'users'),
      where('teamKey', '==', currentUser.teamKey)
    )

    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const data = snapshot.docs
        .map((document) => ({ id: document.id, ...document.data() }))
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))

      setUsers(data)
    })

    const eventsQuery = query(
      collection(db, 'events'),
      where('teamKey', '==', currentUser.teamKey)
    )

    const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
      const data = snapshot.docs
        .map((document) => ({ id: document.id, ...document.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))

      setEvents(data)
    })

    return () => {
      unsubscribeUsers()
      unsubscribeEvents()
    }
    }, [currentUser])

  useEffect(() => {
    if (!currentUser) return

    const unsubscribe = onMessage(messaging, (payload) => {
      showToast(
        `${payload.notification?.title || 'Bestemmiometro'} - ${
          payload.notification?.body || 'Nuovo evento'
        }`,
        'danger'
      )
    })

    return () => unsubscribe()
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return

    if (
      Notification.permission !== 'granted' ||
      !currentUser.notificationsEnabled
    ) {
      setShowNotificationModal(true)
    }
  }, [currentUser])

  const ranking = useMemo(() => {
    return users
      .map((user) => ({
        ...user,
        score: getUserScore(user.id),
        blessings: getAvailableBlessings(user.id),
      }))
      .sort((a, b) => b.score - a.score)
  }, [users, events])

  async function login(event) {
    event.preventDefault()
    setLoginError('')

    const teamKey = loginTeamKey.trim()
    const firstName = loginFirstName.trim().toLowerCase()
    const lastName = loginLastName.trim().toLowerCase()

    if (!teamKey || !firstName || !lastName) return

    const q = query(collection(db, 'users'), where('teamKey', '==', teamKey))
    const snapshot = await getDocs(q)

    const matchedUser = snapshot.docs
      .map((document) => ({ id: document.id, ...document.data() }))
      .find((user) => {
        return (
          user.firstName?.toLowerCase() === firstName &&
          user.lastName?.toLowerCase() === lastName
        )
      })

    if (!matchedUser) {
      setLoginError('Utente non trovato per questo team.')
      return
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify(matchedUser))
    setCurrentUser(matchedUser)
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY)
    setCurrentUser(null)
    setUsers([])
    setEvents([])
  }

  async function addUser(event) {
    event.preventDefault()

    if (!isMaintainer) return

    const firstName = newFirstName.trim()
    const lastName = newLastName.trim()
    const username = newUsername.trim() || firstName

    if (!firstName || !lastName || !username) return

    await addDoc(collection(db, 'users'), {
      teamKey: currentUser.teamKey,
      firstName,
      lastName,
      username,
      role: 'default',
      accessRole: newAccessRole,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    setNewFirstName('')
    setNewLastName('')
    setNewUsername('')
    setNewAccessRole('player')
  }

  async function addEvent(event) {
    event.preventDefault()

    const description = eventDescription.trim()
    const target = users.find((user) => user.id === selectedTargetId)

    if (!target || !description) return

    if (selectedEventType === 'superbestemmia' && getAvailableBlessings(currentUser.id) < 2) {
      showToast('Ti servono 2 tue benedizioni disponibili per una superbestemmia.', 'danger')
      return
    }

    const eventConfig = {
      bestemmia: {
        points: 1,
        icon: '🔥',
        label: 'Bestemmia',
      },
      benedizione: {
        points: -1,
        icon: '🙏',
        label: 'Benedizione',
      },
      superbestemmia: {
        points: 2,
        icon: '💀',
        label: 'Superbestemmia',
      },
    }

    const config = eventConfig[selectedEventType]

    const createdEvent = await addDoc(collection(db, 'events'), {
      teamKey: currentUser.teamKey,

      targetId: target.id,
      targetName: target.username,
      targetRole: target.role,

      type: selectedEventType,
      points: config.points,
      description,

      createdById: currentUser.id,
      createdByName: currentUser.username,

      paidById: selectedEventType === 'superbestemmia' ? currentUser.id : null,
      paidByName: selectedEventType === 'superbestemmia' ? currentUser.username : null,

      consumed: false,
      consumedByEventId: null,

      createdAt: serverTimestamp(),
    })

    if (selectedEventType === 'superbestemmia') {
      const availableBlessings = events
        .filter((item) => item.targetId === currentUser.id)
        .filter((item) => item.type === 'benedizione')
        .filter((item) => !item.consumed)
        .slice(0, 2)

      await Promise.all(
        availableBlessings.map((blessing) =>
          updateDoc(doc(db, 'events', blessing.id), {
            consumed: true,
            consumedByEventId: createdEvent.id,
            consumedByUserId: currentUser.id,
            consumedByUserName: currentUser.username,
          })
        )
      )
    }

    if (selectedEventType === 'bestemmia' || selectedEventType === 'superbestemmia') {
      triggerBestemmiaEffect()
    } else {
      triggerRedemptionEffect()
    }

    showToast(`${config.icon} ${target.username}: ${description}`, selectedEventType === 'benedizione' ? 'success' : 'danger')

    setSelectedTargetId('')
    setSelectedEventType('bestemmia')
    setEventDescription('')
  }

  async function deleteEvent(item) {
    if (!isMaintainer) return

    const confirmed = window.confirm('Vuoi davvero eliminare questo evento?')
    if (!confirmed) return

    if (item.type === 'superbestemmia') {
      const consumedBlessings = events.filter(
        (event) => event.consumedByEventId === item.id
      )

      await Promise.all(
        consumedBlessings.map((blessing) =>
          updateDoc(doc(db, 'events', blessing.id), {
            consumed: false,
            consumedByEventId: null,
          })
        )
      )
    }

    await deleteDoc(doc(db, 'events', item.id))

    showToast('Evento rimosso.', 'success')
  }

  async function deleteUserFromHistory(user) {
    if (!isMaintainer) return

    const confirmed = window.confirm(
      `Vuoi davvero rimuovere ${user.username}? Verranno eliminati anche tutti i suoi eventi.`
    )

    if (!confirmed) return

    const userEvents = events.filter((event) => event.targetId === user.id)

    await Promise.all(
      userEvents.map((event) => deleteDoc(doc(db, 'events', event.id)))
    )

    await deleteDoc(doc(db, 'users', user.id))

    setHistoryModal(null)
    showToast(`${user.username} rimosso.`, 'success')
  }

  function getUserScore(userId) {
    return events
      .filter((event) => event.targetId === userId)
      .filter((event) => !event.consumed)
      .reduce((total, event) => total + (event.points || 0), 0)
  }

  function getAvailableBlessings(userId) {
    return events
      .filter((event) => event.targetId === userId)
      .filter((event) => event.type === 'benedizione')
      .filter((event) => !event.consumed).length
  }

  function getUserEvents(userId) {
    return events.filter((event) => event.targetId === userId)
  }

  // function getRoleLabel(role) {
  //   const labels = {
  //     dev: 'Sviluppo',
  //     pm: 'Management',
  //     qa: 'Quality Assurance',
  //     analyst: 'Analista funzionale',
  //   }

  //   return labels[role] || 'Team'
  // }
  
  function getRoleLabel(role) {
    const labels = {
      default: 'User',
    }

    return labels[role] || 'User'
  }

  function getEventIcon(type) {
    const icons = {
      bestemmia: '🔥',
      benedizione: '🙏',
      superbestemmia: '💀',
    }

    return icons[type] || '🔥'
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

  if (!currentUser) {
    return (
      <main className="app login-app">
        <section className="login-card">
          <img
            className="login-logo"
            src={`${import.meta.env.BASE_URL}images/bestemmiometro-header.PNG`}
            alt="Bestemmiometro"
          />

          <form onSubmit={login} className="login-form">
            <input
              type="text"
              placeholder="Team key"
              value={loginTeamKey}
              onChange={(event) => setLoginTeamKey(event.target.value)}
            />

            <input
              type="text"
              placeholder="Nome"
              value={loginFirstName}
              onChange={(event) => setLoginFirstName(event.target.value)}
            />

            <input
              type="text"
              placeholder="Cognome"
              value={loginLastName}
              onChange={(event) => setLoginLastName(event.target.value)}
            />

            {loginError && <p className="error-message">{loginError}</p>}

            <button type="submit">Entra</button>
          </form>
        </section>
      </main>
    )
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
        <section className="panel ranking-panel">
          <div className="panel-title">
            <Trophy />
            <div>
              <h2>Classifica</h2>
              <p className="panel-subtitle">
                Clicca su un giocatore per vedere lo storico
              </p>
            </div>
          </div>

          <div className="ranking-list">
            {ranking.map((user, index) => (
              <button
                key={user.id}
                className="ranking-row"
                onClick={() => setHistoryModal(user)}
              >
                <span className={`rank-position rank-${index + 1}`}>
                  {index + 1}
                </span>

                <div>
                  <span className="rank-name">{user.username}</span>

                  <span className="rank-blessings">
                    {user.blessings} 🙏
                  </span>
                </div>

                <strong className="rank-total">
                  {user.score}
                </strong>
              </button>
            ))}
          </div>
        </section>

        <section className="panel add-event-panel">
          <div className="panel-title">
            <Plus />
            <h2>Aggiungi evento</h2>
          </div>

          <form onSubmit={addEvent} className="add-event-form">
            <select
              value={selectedTargetId}
              onChange={(event) => setSelectedTargetId(event.target.value)}
            >
              <option value="">Seleziona giocatore</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username}
                </option>
              ))}
            </select>

            <div className="event-type-grid">
              <button
                type="button"
                className={selectedEventType === 'bestemmia' ? 'event-type active danger' : 'event-type danger'}
                onClick={() => setSelectedEventType('bestemmia')}
              >
                🔥 Bestemmia
              </button>

              <button
                type="button"
                className={selectedEventType === 'benedizione' ? 'event-type active success' : 'event-type success'}
                onClick={() => setSelectedEventType('benedizione')}
              >
                🙏 Benedizione
              </button>

              <button
                type="button"
                className={selectedEventType === 'superbestemmia' ? 'event-type active super' : 'event-type super'}
                onClick={() => setSelectedEventType('superbestemmia')}
                disabled={!selectedTargetId || getAvailableBlessings(currentUser.id) < 2}
              >
                💀 Superbestemmia - costa 2 tue benedizioni
              </button>
            </div>

            <textarea
              placeholder="Descrizione evento"
              value={eventDescription}
              onChange={(event) => setEventDescription(event.target.value)}
            />

            <button
              type="submit"
              disabled={!selectedTargetId || !eventDescription.trim()}
            >
              Conferma evento
            </button>
          </form>
        </section>

        {isMaintainer && (
          <section className="panel add-user-panel">
            <div className="panel-title">
              <Users />
              <h2>Aggiungi giocatore</h2>
            </div>

            <form onSubmit={addUser} className="add-user-form">
              <input
                type="text"
                placeholder="Nome"
                value={newFirstName}
                onChange={(event) => setNewFirstName(event.target.value)}
              />

              <input
                type="text"
                placeholder="Cognome"
                value={newLastName}
                onChange={(event) => setNewLastName(event.target.value)}
              />

              <input
                type="text"
                placeholder="Username in classifica"
                value={newUsername}
                onChange={(event) => setNewUsername(event.target.value)}
              />

              {/* <select value={newRole} onChange={(event) => setNewRole(event.target.value)}>
                <option value="dev">Sviluppo</option>
                <option value="pm">Management</option>
                <option value="qa">Quality Assurance</option>
                <option value="analyst">Analista funzionale</option>
              </select> */}

              <select
                value={newAccessRole}
                onChange={(event) => setNewAccessRole(event.target.value)}
              >
                <option value="player">Player</option>
                <option value="maintainer">Maintainer</option>
              </select>

              <button type="submit">
                <UserPlus size={18} />
                Aggiungi
              </button>
            </form>
          </section>
        )}
      </section>

      {/* <section className="donation-panel">
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
      </section> */}

      <section className="account-panel">
        <div className="account-content">
          <div>
            <p className="account-label">
              Sessione attiva
            </p>

            <strong>
              {currentUser.username}
            </strong>

            <p>
              {getRoleLabel(currentUser.role)} · {currentUser.accessRole}
            </p>
          </div>

          <div className="account-actions">
            <button
              className="notification-button"
              onClick={enableNotifications}
            >
              🔔 Notifiche
            </button>

            <button
              className="logout-button"
              onClick={logout}
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </div>
      </section>

      {historyModal && (
        <div className="modal-backdrop" onClick={() => setHistoryModal(null)}>
          <div className="modal history-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setHistoryModal(null)}>
              <X />
            </button>

            <h2>Storico di {historyModal.username}</h2>

            <div className="penalty-history-list">
              {getUserEvents(historyModal.id).length === 0 ? (
                <p>Nessun evento registrato.</p>
              ) : (
                getUserEvents(historyModal.id).map((item) => (
                  <div
                    className={`penalty-history-item event-${item.type} ${
                      item.consumed ? 'event-consumed' : ''
                    }`}
                    key={item.id}
                  >
                    <div>
                      <p>
                        {getEventIcon(item.type)} {item.description}
                      </p>

                      <span>
                        {item.createdByName && `Assegnata da ${item.createdByName} · `}
                        {item.createdAt?.toDate
                          ? item.createdAt.toDate().toLocaleDateString('it-IT')
                          : 'Data non disponibile'}
                        {item.consumed && ` · consumata da ${item.consumedByUserName || 'superbestemmia'}`}
                      </span>
                    </div>

                    {isMaintainer && historyModal.id !== currentUser.id && (
                      <button
                        className="history-delete-button"
                        onClick={() => deleteEvent(item)}
                      >
                        <Trash2 />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {isMaintainer && (
              <div className="history-footer">
                <button
                  className="delete-player-button"
                  onClick={() => deleteUserFromHistory(historyModal)}
                >
                  <Trash2 />
                  Rimuovi giocatore
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showNotificationModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowNotificationModal(false)}
        >
          <div
            className="modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>🔔 Attiva le notifiche</h2>

            <p>
              Riceverai notifiche quando vengono assegnate
              bestemmie, benedizioni e superbestemmie.
            </p>

            <div className="modal-actions">
              <button
                onClick={() => setShowNotificationModal(false)}
              >
                Più tardi
              </button>

              <button
                onClick={async () => {
                  await enableNotifications()
                  setShowNotificationModal(false)
                }}
              >
                Attiva notifiche
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
              causare una bestemmia certificata. Nessuno è immune.
            </p>
            <p>Bestemmia: +1 punto.</p>
            <p>Benedizione: -1 punto e crea 1 credito benedizione.</p>
            <p>Superbestemmia: +2 punti e consuma 2 benedizioni disponibili.</p>
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