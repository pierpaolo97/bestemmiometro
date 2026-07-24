import { useEffect, useMemo, useRef, useState } from 'react'
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db, getFirebaseMessaging } from './firebase'
import {
  Bell,
  BookOpen,
  Home,
  Info,
  LogOut,
  Plus,
  Scale,
  Trash2,
  Trophy,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import './App.css'
import { getToken, onMessage } from 'firebase/messaging'

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
  const [varCases, setVarCases] = useState([])
  const [isSubmittingVar, setIsSubmittingVar] = useState(false)
  const [varEventToChallenge, setVarEventToChallenge] = useState(null)
  const [varReason, setVarReason] = useState('')

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
  const [activeTab, setActiveTab] = useState('home')

  async function enableNotifications() {
    setShowNotificationModal(false)
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        showToast('Notifiche non supportate da questo browser.', 'danger')
        return
      }

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

      const messaging = await getFirebaseMessaging()
      if (!messaging) {
        showToast('Notifiche non supportate da questo browser.', 'danger')
        return
      }

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

      const updatedUser = { ...currentUser, notificationToken: token, notificationsEnabled: true }
      localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser))
      setCurrentUser(updatedUser)
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

    const varCasesQuery = query(
      collection(db, 'varCases'),
      where('teamKey', '==', currentUser.teamKey)
    )

    const unsubscribeVarCases = onSnapshot(varCasesQuery, (snapshot) => {
      const data = snapshot.docs
        .map((document) => ({
          id: document.id,
          ...document.data(),
        }))
        .sort(
          (a, b) =>
            (b.createdAt?.seconds || 0) -
            (a.createdAt?.seconds || 0)
        )

      setVarCases(data)
    })

    return () => {
      unsubscribeUsers()
      unsubscribeEvents()
      unsubscribeVarCases()
    }
    }, [currentUser])

  useEffect(() => {
    if (!currentUser) return

    let unsubscribeNotifications = null

    async function setupMessages() {
      const messaging = await getFirebaseMessaging()

      if (!messaging) return

      unsubscribeNotifications = onMessage(messaging, (payload) => {
        showToast(
          `${payload.notification?.title || 'Bestemmiometro'} - ${
            payload.notification?.body || 'Nuovo evento'
          }`,
          'danger'
        )
      })
    }

    setupMessages()

    return () => {
      if (unsubscribeNotifications) {
        unsubscribeNotifications()
      }
    }
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return

    // Se Firebase dice che le notifiche sono già attive,
    // non chiedere più nulla.
    if (currentUser.notificationsEnabled === true) {
      setShowNotificationModal(false)
      return
    }

    const notificationApiAvailable =
      typeof window !== 'undefined' &&
      typeof Notification !== 'undefined' &&
      'serviceWorker' in navigator

    if (!notificationApiAvailable) {
      setShowNotificationModal(false)
      return
    }

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true

    const isAndroid =
      /Android/i.test(navigator.userAgent)

    const canAskNotifications =
      isAndroid || (isIOS && isStandalone)

    if (!canAskNotifications) {
      setShowNotificationModal(false)
      return
    }

    if (Notification.permission !== 'granted') {
      setShowNotificationModal(true)
      return
    }

    setShowNotificationModal(false)
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

  const pendingVarVotes = useMemo(() => {
    if (!currentUser) return 0

    return varCases.filter((varCase) => {
      if (varCase.status !== 'open') return false
      if (!varCase.eligibleVoterIds?.includes(currentUser.id)) return false
      if (varCase.votes?.[currentUser.id]) return false

      return true
    }).length
  }, [varCases, currentUser])

  const openVarCases = useMemo(() => {
    return varCases.filter((varCase) => varCase.status === 'open')
  }, [varCases])

  const closedVarCases = useMemo(() => {
    return varCases.filter((varCase) => varCase.status !== 'open')
  }, [varCases])

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
    setVarCases([])
    setActiveTab('home')
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

    /* if (selectedEventType === 'superbestemmia' && getAvailableBlessings(currentUser.id) < 2) {
      showToast('Ti servono 2 tue benedizioni disponibili per una superbestemmia.', 'danger')
      return
    } */

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

    await addDoc(collection(db, 'events'), {
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
  
  function openVarRequestModal(item) {
    if (!canRequestVar(item)) {
      showToast(
        'Non puoi richiedere il VAR per questo evento.',
        'danger'
      )
      return
    }

    setVarEventToChallenge(item)
    setVarReason('')
  }

  function closeVarRequestModal() {
    if (isSubmittingVar) return

    setVarEventToChallenge(null)
    setVarReason('')
  }
  
  async function requestVar() {
    if (!currentUser || isSubmittingVar) return

    const item = varEventToChallenge
    const reason = varReason.trim()

    if (!item) {
      showToast('Evento non disponibile.', 'danger')
      return
    }

    if (!reason) {
      showToast(
        'Inserisci una motivazione per la contestazione.',
        'danger'
      )
      return
    }

    if (item.targetId !== currentUser.id) {
      showToast(
        'Puoi contestare solo un evento assegnato a te.',
        'danger'
      )
      return
    }

    if (item.type === 'benedizione') {
      showToast(
        'Le benedizioni non possono essere contestate.',
        'danger'
      )
      return
    }

    if (item.cancelledByVar) {
      showToast(
        'Questo evento è già stato annullato.',
        'danger'
      )
      return
    }

    const existingVarCase = getVarCaseForEvent(item.id)

    if (existingVarCase) {
      showToast(
        'Questo evento è già stato sottoposto al VAR.',
        'danger'
      )
      return
    }

    const quarterKey = getQuarterKey()

    if (hasUsedVarThisQuarter()) {
      showToast(
        'Hai già utilizzato il VAR in questo trimestre.',
        'danger'
      )
      return
    }

    const eligibleVoters = users.filter(
      (user) =>
        user.id !== item.targetId &&
        user.id !== item.createdById
    )

    if (eligibleVoters.length === 0) {
      showToast(
        'Non ci sono giocatori neutrali disponibili per votare.',
        'danger'
      )
      return
    }

    setIsSubmittingVar(true)

    try {
      const varCaseRef = doc(db, 'varCases', item.id)

      const usageId = [
        encodeURIComponent(currentUser.teamKey),
        currentUser.id,
        quarterKey,
      ].join('__')

      const usageRef = doc(db, 'varUsage', usageId)
      const eventRef = doc(db, 'events', item.id)

      const expiresAt = Timestamp.fromDate(
        new Date(Date.now() + 72 * 60 * 60 * 1000)
      )

      const eligibleVoterIds = eligibleVoters.map(
        (user) => user.id
      )

      const requiredApprovals =
        Math.floor(eligibleVoterIds.length / 2) + 1

      await runTransaction(db, async (transaction) => {
        const existingVarSnapshot =
          await transaction.get(varCaseRef)

        const usageSnapshot =
          await transaction.get(usageRef)

        const eventSnapshot =
          await transaction.get(eventRef)

        if (!eventSnapshot.exists()) {
          throw new Error('EVENT_NOT_FOUND')
        }

        if (existingVarSnapshot.exists()) {
          throw new Error('VAR_ALREADY_EXISTS')
        }

        if (usageSnapshot.exists()) {
          throw new Error('VAR_ALREADY_USED')
        }

        transaction.set(varCaseRef, {
          teamKey: currentUser.teamKey,

          eventId: item.id,
          eventType: item.type,
          eventDescription: item.description,

          // Nuovo campo con la motivazione
          challengeReason: reason,

          targetId: item.targetId,
          targetName: item.targetName,

          assignedById: item.createdById,
          assignedByName: item.createdByName,

          challengedById: currentUser.id,
          challengedByName: currentUser.username,

          quarterKey,

          status: 'open',
          result: null,

          eligibleVoterIds,
          requiredApprovals,
          votes: {},

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          expiresAt,
          resolvedAt: null,
        })

        transaction.set(usageRef, {
          teamKey: currentUser.teamKey,
          userId: currentUser.id,
          username: currentUser.username,
          quarterKey,
          varCaseId: item.id,
          eventId: item.id,
          createdAt: serverTimestamp(),
        })

        transaction.update(eventRef, {
          varCaseId: item.id,
          varStatus: 'open',
          updatedAt: serverTimestamp(),
        })
      })

      setVarEventToChallenge(null)
      setVarReason('')
      setHistoryModal(null)
      setActiveTab('var')

      showToast(
        '🎥 VAR richiesto. Il team ha 3 giorni per votare.',
        'success'
      )
    } catch (error) {
      console.error('Errore richiesta VAR:', error)

      const messages = {
        EVENT_NOT_FOUND: 'L’evento non esiste più.',
        VAR_ALREADY_EXISTS:
          'Questo evento è già stato sottoposto al VAR.',
        VAR_ALREADY_USED:
          'Hai già utilizzato il VAR in questo trimestre.',
      }

      const isPermissionError =
        error.code === 'permission-denied' ||
        error.message?.includes(
          'Missing or insufficient permissions'
        )

      showToast(
        isPermissionError
          ? 'Firestore non autorizza la creazione del VAR.'
          : messages[error.message] ||
              'Errore durante la richiesta del VAR.',
        'danger'
      )
    } finally {
      setIsSubmittingVar(false)
    }
  }

  async function voteVar(varCase, vote) {
    if (!currentUser) return

    if (!['approve', 'reject'].includes(vote)) return

    if (!canCurrentUserVote(varCase)) {
      showToast(
        'Non sei autorizzato a votare questa contestazione.',
        'danger'
      )
      return
    }

    try {
      const varCaseRef = doc(db, 'varCases', varCase.id)

      await runTransaction(db, async (transaction) => {
        const varCaseSnapshot = await transaction.get(varCaseRef)

        if (!varCaseSnapshot.exists()) {
          throw new Error('VAR_NOT_FOUND')
        }

        const currentData = varCaseSnapshot.data()

        if (currentData.status !== 'open') {
          throw new Error('VAR_CLOSED')
        }

        if (
          !currentData.eligibleVoterIds?.includes(currentUser.id)
        ) {
          throw new Error('NOT_ELIGIBLE')
        }

        transaction.update(varCaseRef, {
          [`votes.${currentUser.id}`]: vote,
          updatedAt: serverTimestamp(),
        })
      })

      showToast(
        vote === 'approve'
          ? 'Voto registrato: annulla la bestemmia.'
          : 'Voto registrato: mantieni la bestemmia.',
        'success'
      )
    } catch (error) {
      console.error('Errore voto VAR:', error)

      const messages = {
        VAR_NOT_FOUND: 'La contestazione non esiste più.',
        VAR_CLOSED: 'La votazione è già terminata.',
        NOT_ELIGIBLE: 'Non sei autorizzato a votare.',
      }

      showToast(
        messages[error.message] || 'Errore durante la votazione.',
        'danger'
      )
    }
  }

  async function deleteEvent(item) {
    if (!isMaintainer) return

    const confirmed = window.confirm('Vuoi davvero eliminare questo evento?')
    if (!confirmed) return

  //   if (item.type === 'superbestemmia') {
  //     const consumedBlessings = events.filter(
  //       (event) => event.consumedByEventId === item.id
  //     )

  //     await Promise.all(
  //       consumedBlessings.map((blessing) =>
  //         updateDoc(doc(db, 'events', blessing.id), {
  //           consumed: false,
  //           consumedByEventId: null,
  //         })
  //       )
  //     )
  //   }

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
    const score = events
      .filter((event) => event.targetId === userId)
      .filter((event) => !event.consumed)
      .filter((event) => !event.cancelledByVar)
      .reduce((total, event) => total + (event.points || 0), 0)

    return Math.max(score, 0)
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

  function getQuarterKey(date = new Date()) {
    const year = date.getFullYear()
    const quarter = Math.floor(date.getMonth() / 3) + 1

    return `${year}-Q${quarter}`
  }

  function getVarCaseForEvent(eventId) {
    return varCases.find((varCase) => varCase.eventId === eventId)
  }

  function hasUsedVarThisQuarter() {
    const currentQuarter = getQuarterKey()

    return varCases.some(
      (varCase) =>
        varCase.challengedById === currentUser.id &&
        varCase.quarterKey === currentQuarter
    )
  }

  function canRequestVar(item) {
    if (!item || !currentUser) return false

    const existingVarCase = getVarCaseForEvent(item.id)

    return (
      item.targetId === currentUser.id &&
      item.type !== 'benedizione' &&
      !item.cancelledByVar &&
      !existingVarCase &&
      !hasUsedVarThisQuarter()
    )
  }

  function getVarVoteCounts(varCase) {
    const votes = Object.values(varCase.votes || {})

    return {
      approvals: votes.filter((vote) => vote === 'approve').length,
      rejections: votes.filter((vote) => vote === 'reject').length,
      total: votes.length,
    }
  }

  function canCurrentUserVote(varCase) {
    if (!currentUser || varCase.status !== 'open') return false

    return varCase.eligibleVoterIds?.includes(currentUser.id)
  }

  function getCurrentUserVote(varCase) {
    return varCase.votes?.[currentUser.id] || null
  }

  function formatVarRemaining(expiresAt) {
    if (!expiresAt?.toDate) return 'Scadenza non disponibile'

    const difference = expiresAt.toDate().getTime() - Date.now()

    if (difference <= 0) {
      return 'In attesa di chiusura'
    }

    const totalHours = Math.ceil(difference / (1000 * 60 * 60))
    const days = Math.floor(totalHours / 24)
    const hours = totalHours % 24

    if (days > 0 && hours > 0) {
      return `${days}g ${hours}h rimanenti`
    }

    if (days > 0) {
      return `${days}g rimanenti`
    }

    return `${hours}h rimanenti`
  }

  function getVarStatusLabel(status) {
    const labels = {
      open: 'In votazione',
      approved: 'Contestazione approvata',
      rejected: 'Contestazione respinta',
      expired: 'Contestazione scaduta',
    }

    return labels[status] || status
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
    <main className="app app-shell">
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      <header className="app-header">
        <img
          className="hero-logo"
          src={`${import.meta.env.BASE_URL}images/bestemmiometro-header.PNG`}
          alt="Bestemmiometro"
        />
      </header>

      <nav className="app-navigation" aria-label="Navigazione principale">
        <button
          type="button"
          className={activeTab === 'home' ? 'nav-item active' : 'nav-item'}
          onClick={() => setActiveTab('home')}
        >
          <Home size={21} />
          <span>Home</span>
        </button>

        <button
          type="button"
          className={activeTab === 'events' ? 'nav-item active' : 'nav-item'}
          onClick={() => setActiveTab('events')}
        >
          <Plus size={21} />
          <span>Eventi</span>
        </button>

        <button
          type="button"
          className={activeTab === 'var' ? 'nav-item active' : 'nav-item'}
          onClick={() => setActiveTab('var')}
        >
          <span className="nav-icon-wrapper">
            <Scale size={21} />

            {pendingVarVotes > 0 && (
              <span className="nav-badge">
                {pendingVarVotes}
              </span>
            )}
          </span>

          <span>VAR</span>
        </button>

        <button
          type="button"
          className={activeTab === 'profile' ? 'nav-item active' : 'nav-item'}
          onClick={() => setActiveTab('profile')}
        >
          <UserRound size={21} />
          <span>Profilo</span>
        </button>
      </nav>

      <section className="app-content">
        {activeTab === 'home' && (
          <section className="page-view">
            <section className="panel ranking-panel">
              <div className="panel-title">
                <Trophy />
                <div>
                  <h2>Classifica</h2>
                  <p className="panel-subtitle">
                    Tocca un giocatore per vedere lo storico
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
          </section>
        )}

        {activeTab === 'events' && (
          <section className="page-view events-page">
            <section className="panel add-event-panel">
              <div className="panel-title">
                <Plus />
                <div>
                  <h2>Aggiungi evento</h2>
                  <p className="panel-subtitle">
                    Assegna una bestemmia, una benedizione o una superbestemmia
                  </p>
                </div>
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
                    className={
                      selectedEventType === 'bestemmia'
                        ? 'event-type active danger'
                        : 'event-type danger'
                    }
                    onClick={() => setSelectedEventType('bestemmia')}
                  >
                    🔥 Bestemmia
                  </button>

                  <button
                    type="button"
                    className={
                      selectedEventType === 'benedizione'
                        ? 'event-type active success'
                        : 'event-type success'
                    }
                    onClick={() => setSelectedEventType('benedizione')}
                  >
                    🙏 Benedizione
                  </button>

                  <button
                    type="button"
                    className={
                      selectedEventType === 'superbestemmia'
                        ? 'event-type active super'
                        : 'event-type super'
                    }
                    onClick={() => setSelectedEventType('superbestemmia')}
                  >
                    💀 Superbestemmia
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
                  <div>
                    <h2>Aggiungi giocatore</h2>
                    <p className="panel-subtitle">
                      Crea un nuovo membro del team
                    </p>
                  </div>
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
        )}

        {activeTab === 'var' && (
          <section className="page-view var-page">
            <section className="panel var-summary-panel">
              <div className="panel-title">
                <Scale />
                <div>
                  <h2>Modalità VAR</h2>
                  <p className="panel-subtitle">
                    Una contestazione disponibile per trimestre
                  </p>
                </div>
              </div>

              <div
                className={
                  hasUsedVarThisQuarter()
                    ? 'var-availability-card used'
                    : 'var-availability-card available'
                }
              >
                <strong>
                  {hasUsedVarThisQuarter()
                    ? 'VAR trimestrale utilizzato'
                    : 'VAR trimestrale disponibile'}
                </strong>

                <span>
                  Trimestre corrente: {getQuarterKey()}
                </span>
              </div>
            </section>

            <section className="panel">
              <div className="panel-title">
                <Scale />
                <div>
                  <h2>Contestazioni aperte</h2>
                  <p className="panel-subtitle">
                    Le votazioni durano al massimo 3 giorni
                  </p>
                </div>
              </div>

              {openVarCases.length === 0 ? (
                <div className="empty-var-state">
                  <Scale size={32} />
                  <p>Nessuna contestazione aperta.</p>
                </div>
              ) : (
                <div className="var-cases-list">
                  {openVarCases.map((varCase) => {
                    const voteCounts = getVarVoteCounts(varCase)
                    const currentVote = getCurrentUserVote(varCase)
                    const canVote = canCurrentUserVote(varCase)

                    return (
                      <article className="var-case-card" key={varCase.id}>
                        <div className="var-case-header">
                          <div>
                            <span className="var-status var-status-open">
                              In votazione
                            </span>

                            <h3>{varCase.targetName}</h3>
                          </div>

                          <strong>
                            {formatVarRemaining(varCase.expiresAt)}
                          </strong>
                        </div>

                        <blockquote>
                          “{varCase.eventDescription}”
                        </blockquote>

                        <div className="var-reason-box">
                          <span>Motivazione della contestazione</span>

                          <p>
                            {varCase.challengeReason ||
                              'Nessuna motivazione disponibile.'}
                          </p>
                        </div>

                        <p className="var-case-meta">
                          Contestata da {varCase.challengedByName}
                          {varCase.assignedByName &&
                            ` · Assegnata da ${varCase.assignedByName}`}
                        </p>

                        <div className="var-vote-progress">
                          <span>
                            ✅ {voteCounts.approvals} favorevoli
                          </span>

                          <span>
                            ❌ {voteCounts.rejections} contrari
                          </span>

                          <span>
                            Servono {varCase.requiredApprovals} approvazioni
                          </span>
                        </div>

                        {canVote ? (
                          <div className="var-vote-actions">
                            <button
                              type="button"
                              className={
                                currentVote === 'approve'
                                  ? 'var-vote-button approve selected'
                                  : 'var-vote-button approve'
                              }
                              onClick={() => voteVar(varCase, 'approve')}
                            >
                              ✅ Annulla
                            </button>

                            <button
                              type="button"
                              className={
                                currentVote === 'reject'
                                  ? 'var-vote-button reject selected'
                                  : 'var-vote-button reject'
                              }
                              onClick={() => voteVar(varCase, 'reject')}
                            >
                              ❌ Mantieni
                            </button>
                          </div>
                        ) : (
                          <p className="var-cannot-vote">
                            {varCase.targetId === currentUser.id
                              ? 'Hai richiesto tu questa contestazione.'
                              : varCase.assignedById === currentUser.id
                                ? 'Hai assegnato tu questo evento.'
                                : 'Non puoi votare questa contestazione.'}
                          </p>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </section>

            {closedVarCases.length > 0 && (
              <section className="panel">
                <div className="panel-title">
                  <Scale />
                  <div>
                    <h2>Storico VAR</h2>
                    <p className="panel-subtitle">
                      Ultime contestazioni concluse
                    </p>
                  </div>
                </div>

                <div className="var-cases-list">
                  {closedVarCases.slice(0, 10).map((varCase) => {
                    const voteCounts = getVarVoteCounts(varCase)

                    return (
                      <article
                        className={`var-case-card var-case-${varCase.status}`}
                        key={varCase.id}
                      >
                        <div className="var-case-header">
                          <div>
                            <span
                              className={`var-status var-status-${varCase.status}`}
                            >
                              {getVarStatusLabel(varCase.status)}
                            </span>

                            <h3>{varCase.targetName}</h3>
                          </div>
                        </div>

                        <blockquote>
                          “{varCase.eventDescription}”
                        </blockquote>

                        <div className="var-reason-box">
                          <span>Motivazione della contestazione</span>

                          <p>
                            {varCase.challengeReason ||
                              'Nessuna motivazione disponibile.'}
                          </p>
                        </div>

                        <p className="var-case-meta">
                          ✅ {voteCounts.approvals} ·
                          {' '}❌ {voteCounts.rejections}
                        </p>
                      </article>
                    )
                  })}
                </div>
              </section>
            )}
          </section>
        )}

        {activeTab === 'profile' && (
          <section className="page-view profile-page">
            <section className="panel profile-card">
              <div className="profile-avatar">
                {currentUser.username?.charAt(0)?.toUpperCase() || 'U'}
              </div>

              <div className="profile-details">
                <p className="profile-eyebrow">
                  Sessione attiva
                </p>

                <h2>{currentUser.username}</h2>

                <p>
                  {getRoleLabel(currentUser.role)} · {currentUser.accessRole}
                </p>

                <span className="team-key-label">
                  Team: {currentUser.teamKey}
                </span>
              </div>
            </section>

            <section className="panel profile-actions-panel">
              <button
                type="button"
                className="profile-action-button"
                onClick={enableNotifications}
              >
                <Bell size={21} />

                <span>
                  <strong>Notifiche</strong>
                  <small>
                    {currentUser.notificationsEnabled
                      ? 'Notifiche abilitate'
                      : 'Abilita le notifiche push'}
                  </small>
                </span>
              </button>

              <button
                type="button"
                className="profile-action-button"
                onClick={() => setShowInfo(true)}
              >
                <BookOpen size={21} />

                <span>
                  <strong>Regole del gioco</strong>
                  <small>Consulta punteggi e funzionamento</small>
                </span>
              </button>

              <button
                type="button"
                className="profile-action-button logout-profile-button"
                onClick={logout}
              >
                <LogOut size={21} />

                <span>
                  <strong>Logout</strong>
                  <small>Termina la sessione corrente</small>
                </span>
              </button>
            </section>
          </section>
        )}
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
                    } ${item.cancelledByVar ? 'event-cancelled-by-var' : ''}`}
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

                      {item.varStatus === 'open' && (
                        <span className="event-var-status event-var-open">
                          🎥 VAR in corso
                        </span>
                      )}

                      {item.cancelledByVar && (
                        <span className="event-var-status event-var-approved">
                          ✅ Annullata dal VAR
                        </span>
                      )}

                      {item.varStatus === 'rejected' && (
                        <span className="event-var-status event-var-rejected">
                          ❌ VAR respinto
                        </span>
                      )}

                    </div>

                    <div className="history-item-actions">
                      {canRequestVar(item) ? (
                        <button
                          type="button"
                          className="history-var-button"
                          disabled={isSubmittingVar}
                          onClick={() => openVarRequestModal(item)}
                          aria-label="Chiedi il VAR"
                          title="Chiedi il VAR"
                        >
                          <Scale />
                        </button>
                      ) : (
                        isMaintainer &&
                        historyModal.id !== currentUser.id && (
                          <button
                            type="button"
                            className="history-delete-button"
                            onClick={() => deleteEvent(item)}
                            aria-label="Elimina evento"
                            title="Elimina evento"
                          >
                            <Trash2 />
                          </button>
                        )
                      )}
                    </div>

                  </div>
                ))
              )}
            </div>

            {isMaintainer && historyModal.id !== currentUser.id && (
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

      {varEventToChallenge && (
        <div
          className="modal-backdrop"
          onClick={closeVarRequestModal}
        >
          <div
            className="modal var-request-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={closeVarRequestModal}
              disabled={isSubmittingVar}
              aria-label="Chiudi"
            >
              <X />
            </button>

            <div className="var-request-heading">
              <div className="var-request-icon">
                <Scale size={26} />
              </div>

              <div>
                <h2>Richiedi il VAR</h2>
                <p>
                  Hai una sola contestazione disponibile per trimestre.
                </p>
              </div>
            </div>

            <div className="var-request-event">
              <span>Evento contestato</span>

              <strong>
                {getEventIcon(varEventToChallenge.type)}{' '}
                {varEventToChallenge.description}
              </strong>

              {varEventToChallenge.createdByName && (
                <small>
                  Assegnata da {varEventToChallenge.createdByName}
                </small>
              )}
            </div>

            <label
              className="var-reason-field"
              htmlFor="var-reason"
            >
              <span>Motivazione della contestazione</span>

              <textarea
                id="var-reason"
                value={varReason}
                onChange={(event) => setVarReason(event.target.value)}
                placeholder="Spiega perché ritieni che questo evento debba essere annullato..."
                autoFocus
              />
            </label>

            <div className="modal-actions var-request-actions">
              <button
                type="button"
                className="var-cancel-button"
                onClick={closeVarRequestModal}
                disabled={isSubmittingVar}
              >
                Annulla
              </button>

              <button
                type="button"
                className="var-submit-button"
                onClick={requestVar}
                disabled={
                  isSubmittingVar ||
                  !varReason.trim()
                }
              >
                {isSubmittingVar
                  ? 'Invio in corso...'
                  : 'Invia contestazione'}
              </button>
            </div>
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
            <p>Benedizione: -1 punto.</p>
            <p>Superbestemmia: +2 punti.</p>
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