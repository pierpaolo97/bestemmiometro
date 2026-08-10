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
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import {
  auth,
  db,
  functions,
  getFirebaseMessaging,
} from './firebase'
import {
  httpsCallable,
} from 'firebase/functions'
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth'
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

const googleProvider = new GoogleAuthProvider()

googleProvider.setCustomParameters({
  prompt: 'select_account',
})

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    return saved ? JSON.parse(saved) : null
  })

  const [userMemberships, setUserMemberships] = useState([])
  const [activeMembershipId, setActiveMembershipId] = useState(
    () => localStorage.getItem('bestemmiometro_active_membership')
  )
  const [showTeamChooser, setShowTeamChooser] = useState(false)

  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamUsername, setNewTeamUsername] = useState('')
  const [isCreatingTeam, setIsCreatingTeam] = useState(false)

  const [showLegacyRecovery, setShowLegacyRecovery] =
    useState(false)

  const [firebaseUser, setFirebaseUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [authProfileLoading, setAuthProfileLoading] =
    useState(false)

  const [linkTeamKey, setLinkTeamKey] = useState('')
  const [linkCandidates, setLinkCandidates] = useState([])
  const [selectedLegacyUserId, setSelectedLegacyUserId] =
    useState('')
  const [linkSearchError, setLinkSearchError] = useState('')
  const [isSearchingProfiles, setIsSearchingProfiles] =
    useState(false)
  const [isRequestingLink, setIsRequestingLink] =
    useState(false)

  const [currentLinkRequest, setCurrentLinkRequest] =
    useState(null)

  const [
      pendingAccountLinkRequests,
      setPendingAccountLinkRequests,
  ] = useState([])

    const [
    reviewingAccountLinkId,
    setReviewingAccountLinkId,
  ] = useState(null)

  const pendingAccountRequests = useMemo(() => {
    return pendingAccountLinkRequests.length
  }, [pendingAccountLinkRequests])

  const approveAccountLinkCallable = useMemo(
    () =>
      httpsCallable(
        functions,
        'approveAccountLink'
      ),
    []
  )

  const rejectAccountLinkCallable = useMemo(
    () =>
      httpsCallable(
        functions,
        'rejectAccountLink'
      ),
    []
  )

  const [teamName, setTeamName] = useState('')

  const [
    bestemmiaPointsSetting,
    setBestemmiaPointsSetting,
  ] = useState(1)

  const [
    superbestemmiaPointsSetting,
    setSuperbestemmiaPointsSetting,
  ] = useState(2)

  const [
    varAllowanceSetting,
    setVarAllowanceSetting,
  ] = useState(1)

  const [
    varResetPeriodSetting,
    setVarResetPeriodSetting,
  ] = useState('quarter')

  const [
    varDurationHoursSetting,
    setVarDurationHoursSetting,
  ] = useState(72)

  const [
    isSavingTeamSettings,
    setIsSavingTeamSettings,
  ] = useState(false)

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

  const [activeTeam, setActiveTeam] = useState(null)
  const [teamLoading, setTeamLoading] = useState(false)

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

  const isOwner = currentUser?.accessRole === 'owner'

  const isMaintainer =
    currentUser?.accessRole === 'maintainer' ||
    currentUser?.accessRole === 'owner'
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
    async function handleGoogleRedirectResult() {
      try {
        await getRedirectResult(auth)
      } catch (error) {
        console.error(
          'Errore risultato redirect Google:',
          error
        )

        showToast(
          'Accesso Google non riuscito.',
          'danger'
        )
      }
    }

    handleGoogleRedirectResult()
  }, [])

  useEffect(() => {
    if (
      !currentUser?.teamKey ||
      !isMaintainer
    ) {
      setPendingAccountLinkRequests([])
      return
    }

    const requestsQuery = query(
      collection(db, 'accountLinkRequests'),
      where(
        'teamKey',
        '==',
        currentUser.teamKey
      ),
      where('status', '==', 'pending')
    )

    const unsubscribe = onSnapshot(
      requestsQuery,
      (snapshot) => {
        const requests = snapshot.docs
          .map((document) => ({
            id: document.id,
            ...document.data(),
          }))
          .sort(
            (a, b) =>
              (a.createdAt?.seconds || 0) -
              (b.createdAt?.seconds || 0)
          )

        setPendingAccountLinkRequests(requests)
      },
      (error) => {
        console.error(
          'Errore richieste collegamento:',
          error
        )
      }
    )

    return unsubscribe
  }, [currentUser, isMaintainer])

  useEffect(() => {
    if (!currentUser) {
      setActiveTeam(null)
      return
    }

    const teamId = currentUser.teamId

    if (!teamId) {
      console.warn(
        'Il profilo non contiene ancora teamId:',
        currentUser.id
      )

      setActiveTeam(null)
      return
    }

    setTeamLoading(true)

    const teamRef = doc(db, 'teams', teamId)

    const unsubscribe = onSnapshot(
      teamRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          console.error(
            'Gruppo non trovato:',
            teamId
          )

          setActiveTeam(null)
          setTeamLoading(false)
          return
        }

        setActiveTeam({
          id: snapshot.id,
          ...snapshot.data(),
        })

        setTeamLoading(false)
      },
      (error) => {
        console.error(
          'Errore caricamento gruppo:',
          error
        )

        setActiveTeam(null)
        setTeamLoading(false)
      }
    )

    return unsubscribe
  }, [currentUser])

  useEffect(() => {
    if (!activeTeam) return

    const settings = getTeamSettings()

    setTeamName(activeTeam.name || '')

    setBestemmiaPointsSetting(
      settings.bestemmiaPoints
    )

    setSuperbestemmiaPointsSetting(
      settings.superbestemmiaPoints
    )

    setVarAllowanceSetting(
      settings.varAllowance
    )

    setVarResetPeriodSetting(
      settings.varResetPeriod
    )

    setVarDurationHoursSetting(
      settings.varDurationHours
    )
  }, [activeTeam])

  useEffect(() => {
    if (!currentUser?.teamKey) return

    const usersQuery = query(
      collection(db, 'users'),
      where(
        'teamId',
        '==',
        currentUser.teamId
      )
    )

    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const data = snapshot.docs
        .map((document) => ({ id: document.id, ...document.data() }))
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))

      setUsers(data)
    })

    const eventsQuery = query(
      collection(db, 'events'),
      where(
        'teamId',
        '==',
        currentUser.teamId
      )
    )

    const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
      const data = snapshot.docs
        .map((document) => ({ id: document.id, ...document.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))

      setEvents(data)
    })

    const varCasesQuery = query(
      collection(db, 'varCases'),
      where(
        'teamId',
        '==',
        currentUser.teamId
      )
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

      unsubscribeNotifications = onMessage(
        messaging,
        (payload) => {
          const messageType = payload.data?.type
          const eventType = payload.data?.eventType

          let toastType = 'danger'

          if (
            messageType === 'event-created' &&
            eventType === 'benedizione'
          ) {
            toastType = 'success'
          }

          if (
            messageType === 'var-result' &&
            payload.data?.result === 'approved'
          ) {
            toastType = 'success'
          }

          showToast(
            `${payload.notification?.title || 'Bestemmiometro'} — ${
              payload.notification?.body || 'Nuovo aggiornamento'
            }`,
            toastType
          )
        }
      )

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

  useEffect(() => {
    let unsubscribeProfile = null

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      (user) => {
        setFirebaseUser(user)
        setAuthReady(true)

        if (unsubscribeProfile) {
          unsubscribeProfile()
          unsubscribeProfile = null
        }

        if (!user) {
          localStorage.removeItem(SESSION_KEY)
          localStorage.removeItem(
            'bestemmiometro_active_membership'
          )

          setFirebaseUser(null)
          setCurrentUser(null)
          setUserMemberships([])
          setActiveMembershipId(null)
          setShowTeamChooser(false)
          setAuthProfileLoading(false)
          setCurrentLinkRequest(null)

          return
        }

        setAuthProfileLoading(true)

    const linkedProfileQuery = query(
      collection(db, 'users'),
      where('authUid', '==', user.uid),
      where('accountStatus', '==', 'active')
    )

    unsubscribeProfile = onSnapshot(
      linkedProfileQuery,
      (snapshot) => {
        const memberships = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }))

        setUserMemberships(memberships)

        if (memberships.length === 0) {
          localStorage.removeItem(SESSION_KEY)
          localStorage.removeItem(
            'bestemmiometro_active_membership'
          )

          setCurrentUser(null)
          setActiveMembershipId(null)
          setAuthProfileLoading(false)
          return
        }

        const storedMembershipId =
          localStorage.getItem(
            'bestemmiometro_active_membership'
          )

        const storedMembership = memberships.find(
          (membership) =>
            membership.id === storedMembershipId
        )

        if (storedMembership) {
          setCurrentUser(storedMembership)
          setActiveMembershipId(storedMembership.id)

          localStorage.setItem(
            SESSION_KEY,
            JSON.stringify(storedMembership)
          )

          setShowTeamChooser(false)
          setAuthProfileLoading(false)
          return
        }

        if (memberships.length === 1) {
          const onlyMembership = memberships[0]

          setCurrentUser(onlyMembership)
          setActiveMembershipId(onlyMembership.id)

          localStorage.setItem(
            SESSION_KEY,
            JSON.stringify(onlyMembership)
          )

          localStorage.setItem(
            'bestemmiometro_active_membership',
            onlyMembership.id
          )

          setShowTeamChooser(false)
          setAuthProfileLoading(false)
          return
        }

        // Più gruppi e nessuna scelta precedente valida.
        localStorage.removeItem(SESSION_KEY)

        setCurrentUser(null)
        setActiveMembershipId(null)
        setShowTeamChooser(true)
        setAuthProfileLoading(false)
      },
      (error) => {
        console.error(
          'Errore caricamento profili collegati:',
          error
        )

        setAuthProfileLoading(false)
      }
    )
      }
    )

    return () => {
      unsubscribeAuth()

      if (unsubscribeProfile) {
        unsubscribeProfile()
      }
    }
  }, [])

  useEffect(() => {
    if (!firebaseUser || currentUser) {
      setCurrentLinkRequest(null)
      return
    }

    const requestQuery = query(
      collection(db, 'accountLinkRequests'),
      where('requestedByUid', '==', firebaseUser.uid)
    )

    const unsubscribe = onSnapshot(
      requestQuery,
      (snapshot) => {
        const requests = snapshot.docs
          .map((document) => ({
            id: document.id,
            ...document.data(),
          }))
          .sort(
            (a, b) =>
              (b.createdAt?.seconds || 0) -
              (a.createdAt?.seconds || 0)
          )

        const pendingRequest = requests.find(
          (request) => request.status === 'pending'
        )

        const latestRequest =
          pendingRequest || requests[0] || null

        setCurrentLinkRequest(latestRequest)
      },
      (error) => {
        console.error(
          'Errore lettura richiesta collegamento:',
          error
        )
      }
    )

    return unsubscribe
  }, [firebaseUser, currentUser])

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

  const teamSettings = getTeamSettings()

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

  async function saveTeamSettings(event) {
    event.preventDefault()

    if (
      !isMaintainer ||
      !activeTeam ||
      isSavingTeamSettings
    ) {
      return
    }

    const bestemmiaPoints =
      Number(bestemmiaPointsSetting)

    const superbestemmiaPoints =
      Number(superbestemmiaPointsSetting)

    const varAllowance =
      Number(varAllowanceSetting)

    const varDurationHours =
      Number(varDurationHoursSetting)

    if (
      !Number.isInteger(bestemmiaPoints) ||
      bestemmiaPoints < 0
    ) {
      showToast(
        'Il valore della bestemmia non è valido.',
        'danger'
      )
      return
    }

    if (
      !Number.isInteger(superbestemmiaPoints) ||
      superbestemmiaPoints < 0
    ) {
      showToast(
        'Il valore della superbestemmia non è valido.',
        'danger'
      )
      return
    }

    if (
      !Number.isInteger(varAllowance) ||
      varAllowance < 0
    ) {
      showToast(
        'Il numero di VAR non è valido.',
        'danger'
      )
      return
    }

    if (
      !Number.isInteger(varDurationHours) ||
      varDurationHours < 1
    ) {
      showToast(
        'La durata del VAR non è valida.',
        'danger'
      )
      return
    }

    setIsSavingTeamSettings(true)

    try {
      await updateDoc(
        doc(db, 'teams', activeTeam.id),
        {
          name: teamName.trim() || activeTeam.name,

          'settings.bestemmiaPoints':
            bestemmiaPoints,

          'settings.superbestemmiaPoints':
            superbestemmiaPoints,

          'settings.varAllowance':
            varAllowance,

          'settings.varResetPeriod':
            varResetPeriodSetting,

          'settings.varDurationHours':
            varDurationHours,

          updatedAt: serverTimestamp(),
        }
      )

      showToast(
        'Impostazioni del gruppo salvate.',
        'success'
      )
    } catch (error) {
      console.error(
        'Errore salvataggio gruppo:',
        error
      )

      showToast(
        'Errore durante il salvataggio.',
        'danger'
      )
    } finally {
      setIsSavingTeamSettings(false)
    }
  }

  async function approveAccountLink(request) {
    if (
      !isMaintainer ||
      !currentUser ||
      reviewingAccountLinkId
    ) {
      return
    }

    const confirmed = window.confirm(
      `Collegare ${
        request.requestedByName ||
        request.requestedByEmail
      } al profilo ${request.legacyUsername}?`
    )

    if (!confirmed) return

    setReviewingAccountLinkId(request.id)

    try {
      await approveAccountLinkCallable({
        requestId: request.id,
      })

      showToast(
        'Account collegato correttamente.',
        'success'
      )
    } catch (error) {
      console.error(
        'Errore approvazione collegamento:',
        error
      )

      const messages = {
        'functions/unauthenticated':
          'Devi entrare con l’account Google del maintainer.',

        'functions/permission-denied':
          'Non sei autorizzato ad approvare questa richiesta.',

        'functions/not-found':
          'La richiesta o il profilo non esistono più.',

        'functions/already-exists':
          'Il profilo o l’account Google risultano già collegati.',

        'functions/failed-precondition':
          'La richiesta è già stata gestita o contiene dati non validi.',
      }

      showToast(
        messages[error.code] ||
          error.message ||
          'Errore durante l’approvazione.',
        'danger'
      )
    } finally {
      setReviewingAccountLinkId(null)
    }
  }

  async function rejectAccountLink(request) {
    if (
      !isMaintainer ||
      !currentUser ||
      reviewingAccountLinkId
    ) {
      return
    }

    const confirmed = window.confirm(
      `Rifiutare la richiesta per ${request.legacyUsername}?`
    )

    if (!confirmed) return

    setReviewingAccountLinkId(request.id)

    try {
      await rejectAccountLinkCallable({
        requestId: request.id,
      })

      showToast(
        'Richiesta rifiutata.',
        'success'
      )
    } catch (error) {
      console.error(
        'Errore rifiuto collegamento:',
        error
      )

      const messages = {
        'functions/unauthenticated':
          'Devi entrare con l’account Google del maintainer.',

        'functions/permission-denied':
          'Non sei autorizzato a rifiutare questa richiesta.',

        'functions/not-found':
          'La richiesta non esiste più.',

        'functions/failed-precondition':
          'La richiesta è già stata gestita.',
      }

      showToast(
        messages[error.code] ||
          error.message ||
          'Errore durante il rifiuto.',
        'danger'
      )
    } finally {
      setReviewingAccountLinkId(null)
    }
  }

  async function loginWithGoogle() {
    try {
      const isMobileDevice =
        /Android|iPhone|iPad|iPod/i.test(
          navigator.userAgent
        )

      if (isMobileDevice) {
        await signInWithRedirect(
          auth,
          googleProvider
        )

        return
      }

      await signInWithPopup(
        auth,
        googleProvider
      )
    } catch (error) {
      console.error('Errore login Google:', error)

      const messages = {
        'auth/popup-closed-by-user':
          'Accesso Google annullato.',
        'auth/popup-blocked':
          'Il browser ha bloccato la finestra di accesso.',
        'auth/cancelled-popup-request':
          'È già in corso un tentativo di accesso.',
      }

      showToast(
        messages[error.code] ||
          'Accesso Google non riuscito.',
        'danger'
      )
    }
  }

  async function logoutGoogle() {
    try {
      await signOut(auth)

      localStorage.removeItem(
        'bestemmiometro_active_membership'
      )

      setUserMemberships([])
      setActiveMembershipId(null)
      setShowTeamChooser(false)

      localStorage.removeItem(SESSION_KEY)

      setCurrentUser(null)
      setFirebaseUser(null)
      setUsers([])
      setEvents([])
      setVarCases([])
      setLinkCandidates([])
      setSelectedLegacyUserId('')
      setLinkTeamKey('')
      setCurrentLinkRequest(null)
      setActiveTab('home')
    } catch (error) {
      console.error('Errore logout Google:', error)

      showToast(
        'Errore durante il logout.',
        'danger'
      )
    }
  }

  async function createTeam(event) {
    event.preventDefault()

    if (
      !firebaseUser ||
      isCreatingTeam
    ) {
      return
    }

    const name = newTeamName.trim()
    const username = newTeamUsername.trim()

    if (!name || !username) return

    setIsCreatingTeam(true)

    try {
      const teamRef = doc(
        collection(db, 'teams')
      )

      const membershipRef = doc(
        collection(db, 'users')
      )

      const inviteCode =
        generateTeamCode()

      await runTransaction(
        db,
        async (transaction) => {
          transaction.set(teamRef, {
            name,

            inviteCode,
            legacyTeamKey: inviteCode,

            ownerUid: firebaseUser.uid,

            settings: {
              bestemmiaPoints: 1,
              superbestemmiaPoints: 2,

              blessingMode:
                'next-bestemmia-shield',

              varEnabled: true,
              varAllowance: 1,
              varResetPeriod: 'quarter',
              varDurationHours: 72,
            },

            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })

          transaction.set(membershipRef, {
            authUid: firebaseUser.uid,

            teamId: teamRef.id,
            teamKey: inviteCode,
            teamName: name,

            username,

            firstName:
              firebaseUser.displayName || username,

            lastName: '',

            email:
              firebaseUser.email || null,

            photoURL:
              firebaseUser.photoURL || null,

            role: 'default',
            accessRole: 'owner',
            accountStatus: 'active',

            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        }
      )

      localStorage.setItem(
        'bestemmiometro_active_membership',
        membershipRef.id
      )

      setNewTeamName('')
      setNewTeamUsername('')
      setShowCreateTeam(false)

      showToast(
        `Gruppo "${name}" creato.`,
        'success'
      )

      // Il listener authUid vedrà automaticamente
      // la nuova membership.
    } catch (error) {
      console.error(
        'Errore creazione gruppo:',
        error
      )

      showToast(
        'Errore durante la creazione del gruppo.',
        'danger'
      )
    } finally {
      setIsCreatingTeam(false)
    }
  }  

  function generateTeamCode() {
    const alphabet =
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

    let code = ''

    for (let i = 0; i < 6; i++) {
      code += alphabet[
        Math.floor(
          Math.random() * alphabet.length
        )
      ]
    }

    return code
  }

  function changeTeam() {
    if (userMemberships.length <= 1) {
      showToast(
        'Non hai altri gruppi disponibili.',
        'danger'
      )
      return
    }

    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(
      'bestemmiometro_active_membership'
    )

    setCurrentUser(null)
    setActiveMembershipId(null)
    setShowTeamChooser(true)

    setUsers([])
    setEvents([])
    setVarCases([])
    setActiveTeam(null)
  }

  function selectMembership(membership) {
    if (!membership) return
    setCurrentUser(membership)
    setActiveMembershipId(membership.id)
    setShowTeamChooser(false)
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify(membership)
    )
    localStorage.setItem(
      'bestemmiometro_active_membership',
      membership.id
    )
    setActiveTab('home')
  }
  
  async function searchLegacyProfiles(event) {
    event.preventDefault()

    if (!firebaseUser) return

    const teamKey = linkTeamKey.trim()

    setLinkSearchError('')
    setLinkCandidates([])
    setSelectedLegacyUserId('')

    if (!teamKey) {
      setLinkSearchError('Inserisci la team key.')
      return
    }

    setIsSearchingProfiles(true)

    try {
      const usersQuery = query(
        collection(db, 'users'),
        where('teamKey', '==', teamKey)
      )

      const snapshot = await getDocs(usersQuery)

      const availableProfiles = snapshot.docs
        .map((document) => ({
          id: document.id,
          ...document.data(),
        }))
        .filter((user) => !user.authUid)
        .sort((a, b) =>
          (a.username || '').localeCompare(
            b.username || '',
            'it'
          )
        )

      if (!availableProfiles.length) {
        setLinkSearchError(
          'Non ci sono profili disponibili per questa team key.'
        )

        return
      }

      setLinkCandidates(availableProfiles)
    } catch (error) {
      console.error(
        'Errore ricerca profili esistenti:',
        error
      )

      setLinkSearchError(
        'Errore durante la ricerca dei profili.'
      )
    } finally {
      setIsSearchingProfiles(false)
    }
  }

  async function requestExistingProfileLink(event) {
    event.preventDefault()

    if (
      !firebaseUser ||
      !selectedLegacyUserId ||
      isRequestingLink
    ) {
      return
    }

    const selectedUser = linkCandidates.find(
      (user) => user.id === selectedLegacyUserId
    )

    if (!selectedUser) {
      showToast(
        'Seleziona un profilo valido.',
        'danger'
      )

      return
    }

    setIsRequestingLink(true)

    try {
      const requestId =
        `${firebaseUser.uid}__${selectedUser.id}`

      const requestRef = doc(
        db,
        'accountLinkRequests',
        requestId
      )

      await setDoc(requestRef, {
        teamKey: selectedUser.teamKey,
        legacyUserId: selectedUser.id,
        legacyUsername: selectedUser.username,

        requestedByUid: firebaseUser.uid,
        requestedByEmail:
          firebaseUser.email || null,
        requestedByName:
          firebaseUser.displayName || null,
        requestedByPhotoURL:
          firebaseUser.photoURL || null,

        status: 'pending',

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        reviewedAt: null,
        reviewedByUserId: null,
        reviewedByName: null,
      })

      setLinkCandidates([])
      setSelectedLegacyUserId('')
      setLinkTeamKey('')

      showToast(
        'Richiesta inviata al maintainer.',
        'success'
      )
    } catch (error) {
      console.error(
        'Errore richiesta collegamento:',
        error
      )

      showToast(
        'Errore durante l’invio della richiesta.',
        'danger'
      )
    } finally {
      setIsRequestingLink(false)
    }
  }

  async function cancelAccountLinkRequest() {
    if (
      !currentLinkRequest ||
      currentLinkRequest.status !== 'pending'
    ) {
      return
    }

    const confirmed = window.confirm(
      'Vuoi annullare la richiesta di collegamento?'
    )

    if (!confirmed) return

    try {
      await deleteDoc(
        doc(
          db,
          'accountLinkRequests',
          currentLinkRequest.id
        )
      )

      setCurrentLinkRequest(null)

      showToast(
        'Richiesta annullata.',
        'success'
      )
    } catch (error) {
      console.error(
        'Errore annullamento richiesta:',
        error
      )

      showToast(
        'Impossibile annullare la richiesta.',
        'danger'
      )
    }
  }

  async function logout() {
    try {
      if (auth.currentUser) {
        await signOut(auth)
        localStorage.removeItem(
          'bestemmiometro_active_membership'
        )

        setUserMemberships([])
        setActiveMembershipId(null)
        setShowTeamChooser(false)
      }
    } catch (error) {
      console.error(
        'Errore logout Firebase:',
        error
      )
    }

    localStorage.removeItem(SESSION_KEY)

    setCurrentUser(null)
    setFirebaseUser(null)
    setUsers([])
    setEvents([])
    setVarCases([])
    setPendingAccountLinkRequests([])
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
      teamId:
        activeTeam?.id ||
        currentUser.teamId ||
        null,
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

  function getTeamSettings() {
    return {
      bestemmiaPoints:
        activeTeam?.settings?.bestemmiaPoints ?? 1,

      superbestemmiaPoints:
        activeTeam?.settings?.superbestemmiaPoints ?? 2,

      blessingMode:
        activeTeam?.settings?.blessingMode ??
        'next-bestemmia-shield',

      varEnabled:
        activeTeam?.settings?.varEnabled ?? true,

      varAllowance:
        activeTeam?.settings?.varAllowance ?? 1,

      varResetPeriod:
        activeTeam?.settings?.varResetPeriod ??
        'quarter',

      varDurationHours:
        activeTeam?.settings?.varDurationHours ?? 72,
    }
  }

  async function addEvent(event) {
    event.preventDefault()

    const description = eventDescription.trim()
    const target = users.find(
      (user) => user.id === selectedTargetId
    )

    if (!target || !description) return

    // Congela il tipo selezionato per tutta l'operazione.
    const eventType = selectedEventType

    function getTeamSettings() {
      return {
        bestemmiaPoints:
          activeTeam?.settings?.bestemmiaPoints ?? 1,

        superbestemmiaPoints:
          activeTeam?.settings?.superbestemmiaPoints ?? 2,

        blessingMode:
          activeTeam?.settings?.blessingMode ??
          'next-bestemmia-shield',

        varEnabled:
          activeTeam?.settings?.varEnabled ?? true,

        varAllowance:
          activeTeam?.settings?.varAllowance ?? 1,

        varResetPeriod:
          activeTeam?.settings?.varResetPeriod ??
          'quarter',

        varDurationHours:
          activeTeam?.settings?.varDurationHours ?? 72,
      }
    }
    const eventConfig = {
      bestemmia: {
        points: teamSettings.bestemmiaPoints,
        icon: '🔥',
        label: 'Bestemmia',
        toastType: 'danger',
      },

      benedizione: {
        points: 0,
        icon: '🙏',
        label: 'Benedizione',
        toastType: 'success',
      },

      superbestemmia: {
        points: teamSettings.superbestemmiaPoints,
        icon: '💀',
        label: 'Superbestemmia',
        toastType: 'danger',
      },
    }

    const config = eventConfig[eventType]

    if (!config) {
      console.error('Tipo evento non valido:', eventType)
      showToast('Tipo evento non valido.', 'danger')
      return
    }

    const availableBlessing =
      eventType === 'bestemmia'
        ? events
            .filter((item) => item.targetId === target.id)
            .filter((item) => item.type === 'benedizione')
            .filter((item) => !item.consumed)
            .sort(
              (a, b) =>
                (a.createdAt?.seconds || 0) -
                (b.createdAt?.seconds || 0)
            )[0]
        : null

    const effectivePoints =
      eventType === 'bestemmia' && availableBlessing
        ? 0
        : config.points

    try {
      const createdEvent = await addDoc(
        collection(db, 'events'),
        {
          teamKey: currentUser.teamKey,
          teamId: activeTeam?.id || currentUser.teamId || null,
          targetId: target.id,
          targetName: target.username,
          targetRole: target.role,

          type: eventType,
          points: effectivePoints,
          description,

          createdById: currentUser.id,
          createdByName: currentUser.username,

          paidById:
            eventType === 'superbestemmia'
              ? currentUser.id
              : null,

          paidByName:
            eventType === 'superbestemmia'
              ? currentUser.username
              : null,

          blessingApplied: Boolean(availableBlessing),
          consumedBlessingId:
            availableBlessing?.id || null,

          consumed: false,
          consumedByEventId: null,
          pointsConfigSnapshot: {
            bestemmiaPoints:
              teamSettings.bestemmiaPoints,

            superbestemmiaPoints:
              teamSettings.superbestemmiaPoints,

            blessingMode:
              teamSettings.blessingMode,
          },
          createdAt: serverTimestamp(),
        }
      )

      if (availableBlessing) {
        await updateDoc(
          doc(db, 'events', availableBlessing.id),
          {
            consumed: true,
            consumedByEventId: createdEvent.id,
            consumedByUserId: target.id,
            consumedByUserName: target.username,
            updatedAt: serverTimestamp(),
          }
        )
      }

      if (
        eventType === 'bestemmia' ||
        eventType === 'superbestemmia'
      ) {
        triggerBestemmiaEffect()
      } else {
        triggerRedemptionEffect()
      }

      if (availableBlessing) {
        showToast(
          `🙏 La benedizione di ${target.username} ha neutralizzato la bestemmia.`,
          'success'
        )
      } else {
        showToast(
          `${config.icon} ${config.label} assegnata a ${target.username}: ${description}`,
          config.toastType
        )
      }

      setSelectedTargetId('')
      setSelectedEventType('bestemmia')
      setEventDescription('')
    } catch (error) {
      console.error('Errore aggiunta evento:', error)
      showToast(
        `Errore durante l'assegnazione della ${config.label.toLowerCase()}.`,
        'danger'
      )
    }
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

    const confirmed = window.confirm(
      'Vuoi davvero eliminare questo evento?'
    )

    if (!confirmed) return

    const consumedBlessing = events.find(
      (event) =>
        event.type === 'benedizione' &&
        event.consumedByEventId === item.id
    )

    if (consumedBlessing) {
      await updateDoc(
        doc(db, 'events', consumedBlessing.id),
        {
          consumed: false,
          consumedByEventId: null,
          consumedByUserId: null,
          consumedByUserName: null,
          updatedAt: serverTimestamp(),
        }
      )
    }

    await deleteDoc(doc(db, 'events', item.id))

    showToast(
      consumedBlessing
        ? 'Evento rimosso e benedizione ripristinata.'
        : 'Evento rimosso.',
      'success'
    )
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
      .filter((event) => !event.cancelledByVar)
      .filter((event) => event.type !== 'benedizione')
      .reduce(
        (total, event) =>
          total + (event.points || 0),
        0
      )

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

  if (!authReady || authProfileLoading) {
    return (
      <main className="app login-app">
        <section className="login-card">
          <img
            className="login-logo"
            src={`${import.meta.env.BASE_URL}images/bestemmiometro-header.PNG`}
            alt="Bestemmiometro"
          />

          <p>Caricamento account...</p>
        </section>
      </main>
    )
  }

  if (
    firebaseUser &&
    !currentUser &&
    currentLinkRequest?.status === 'pending'
  ) {
    return (
      <main className="app login-app">
          <section className="login-card pending-link-card">          
            <img
            className="login-logo"
            src={`${import.meta.env.BASE_URL}images/bestemmiometro-header.PNG`}
            alt="Bestemmiometro"
          />

          <h2>Richiesta inviata</h2>

          <p>
            Hai richiesto di collegarti al profilo:
          </p>

          <strong>
            {currentLinkRequest.legacyUsername}
          </strong>

          <p>
            Team: {currentLinkRequest.teamKey}
          </p>

          <p>
            Devi attendere l’approvazione di un
            maintainer.
          </p>
          <div className="pending-link-actions">
            <button
              type="button"
              className="pending-link-cancel-button"
              onClick={cancelAccountLinkRequest}
            >
              Annulla richiesta
            </button>

            <button
              type="button"
              className="pending-link-logout-button"
              onClick={logoutGoogle}
            >
              Cambia account
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (
    firebaseUser &&
    !currentUser &&
    currentLinkRequest?.status === 'rejected'
  ) {
    return (
      <main className="app login-app">
        <section className="login-card">
          <img
            className="login-logo"
            src={`${import.meta.env.BASE_URL}images/bestemmiometro-header.PNG`}
            alt="Bestemmiometro"
          />

          <h2>Richiesta rifiutata</h2>

          <p>
            Il collegamento al profilo richiesto
            non è stato approvato.
          </p>

          <button
            type="button"
            onClick={async () => {
              await deleteDoc(
                doc(
                  db,
                  'accountLinkRequests',
                  currentLinkRequest.id
                )
              )

              setCurrentLinkRequest(null)
            }}
          >
            Prova con un altro profilo
          </button>

          <button
            type="button"
            onClick={logoutGoogle}
          >
            Logout
          </button>
        </section>
      </main>
    )
  }

  if (
    firebaseUser &&
    !currentUser &&
    userMemberships.length > 1 &&
    showTeamChooser
  ) {
    return (
      <main className="app login-app">
        <section className="login-card team-chooser-card">
          <img
            className="login-logo"
            src={`${import.meta.env.BASE_URL}images/bestemmiometro-header.PNG`}
            alt="Bestemmiometro"
          />

          <div className="google-user-summary">
            {firebaseUser.photoURL && (
              <img
                src={firebaseUser.photoURL}
                alt=""
                referrerPolicy="no-referrer"
              />
            )}

            <div className="google-user-info">
              <strong>
                {firebaseUser.displayName}
              </strong>

              <span>{firebaseUser.email}</span>
            </div>

            <button
              type="button"
              className="google-change-account-button"
              onClick={logoutGoogle}
            >
              Cambia
            </button>
          </div>

          <h2>Scegli un gruppo</h2>

          <p>
            Seleziona il gruppo in cui vuoi entrare.
          </p>

          <div className="team-chooser-list">
            {userMemberships.map((membership) => (
              <button
                type="button"
                key={membership.id}
                className="team-chooser-item"
                onClick={() =>
                  selectMembership(membership)
                }
              >
                <div>
                  <strong>
                    {membership.teamName ||
                      membership.teamKey}
                  </strong>

                  <span>
                    {membership.username}
                    {' · '}
                    {membership.accessRole}
                  </span>
                </div>

                <span className="team-chooser-arrow">
                  ›
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="primary-option-button"
            onClick={() => setShowCreateTeam(true)}
          >
            + Crea un nuovo gruppo
          </button>
        </section>
      </main>
    )
  }

  if (firebaseUser && !currentUser && userMemberships.length === 0) {
    return (
      <main className="app login-app">
        <section className="login-card account-link-card">
          <img
            className="login-logo"
            src={`${import.meta.env.BASE_URL}images/bestemmiometro-header.PNG`}
            alt="Bestemmiometro"
          />

          <div className="google-user-summary">
            {firebaseUser.photoURL && (
              <img
                src={firebaseUser.photoURL}
                alt=""
                referrerPolicy="no-referrer"
              />
            )}

            <div className="google-user-info">
              <strong>{firebaseUser.displayName}</strong>
              <span>{firebaseUser.email}</span>
            </div>

            <button
              type="button"
              className="google-change-account-button"
              onClick={logoutGoogle}
            >
              Cambia
            </button>
          </div>

          <h2>
            {showLegacyRecovery
              ? 'Recupera il tuo profilo'
              : 'Collega il tuo profilo'}
          </h2>

          <p>
            {showLegacyRecovery
              ? 'Inserisci la team key e seleziona il tuo giocatore.'
              : 'Questo account non è ancora collegato. Scegli come continuare.'}
          </p>

          {!showLegacyRecovery && (
            <div className="account-link-options">
              <button
                type="button"
                className="primary-option-button"
                onClick={() => setShowLegacyRecovery(true)}
              >
                Recupera un profilo esistente
              </button>

              <button
                type="button"
                className="secondary-option-button"
                onClick={() => {
                  showToast(
                    'La creazione dei gruppi sarà disponibile a breve.',
                    'success'
                  )
                }}
              >
                Crea un nuovo gruppo
              </button>
            </div>
          )}
          <form
            className="login-form"
            onSubmit={searchLegacyProfiles}
          >
            <input
              type="text"
              placeholder="Team key"
              value={linkTeamKey}
              onChange={(event) =>
                setLinkTeamKey(event.target.value)
              }
            />

            <button
              type="submit"
              disabled={isSearchingProfiles}
            >
              {isSearchingProfiles
                ? 'Ricerca...'
                : 'Cerca profili'}
            </button>
          </form>

          {showLegacyRecovery && (
          <button 
            type="button"
            className="back-button"
            onClick={() => {
              setShowLegacyRecovery(false)
              setLinkCandidates([])
              setSelectedLegacyUserId('')
              setLinkSearchError('')
              setLinkTeamKey('')
            }}
          >
            Torna alle opzioni
          </button>)}

          {linkSearchError && (
            <p className="error-message">
              {linkSearchError}
            </p>
          )}

          {linkCandidates.length > 0 && (
            <form
              className="login-form"
              onSubmit={requestExistingProfileLink}
            >
              <select
                value={selectedLegacyUserId}
                onChange={(event) =>
                  setSelectedLegacyUserId(
                    event.target.value
                  )
                }
              >
                <option value="">
                  Seleziona il tuo profilo
                </option>

                {linkCandidates.map((user) => (
                  <option
                    key={user.id}
                    value={user.id}
                  >
                    {user.username}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={
                  !selectedLegacyUserId ||
                  isRequestingLink
                }
              >
                {isRequestingLink
                  ? 'Invio...'
                  : 'Richiedi collegamento'}
              </button>
            </form>
          )}

        </section>
      </main>
    )
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

          <button
            type="button"
            className="google-login-button"
            onClick={loginWithGoogle}
          >
            <svg
              className="google-login-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fill="#4285F4"
                d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.32 2.98-7.41Z"
              />
              <path
                fill="#34A853"
                d="M12 22c2.7 0 4.98-.9 6.64-2.36l-3.24-2.54c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"
              />
              <path
                fill="#FBBC05"
                d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.12-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.39 3.13 1.04 4.55l3.35-2.62Z"
              />
              <path
                fill="#EA4335"
                d="M12 5.94c1.47 0 2.79.51 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"
              />
            </svg>

            <span>Continua con Google</span>
          </button>

          <div className="legacy-login-divider">
            <span>Accesso temporaneo maintainer</span>
          </div>

          <form
            onSubmit={login}
            className="login-form"
          >
            {/* Mantieni qui i tuoi tre input:
                team key, nome e cognome */}

            <input
              type="text"
              placeholder="Team key"
              value={loginTeamKey}
              onChange={(event) =>
                setLoginTeamKey(event.target.value)
              }
            />

            <input
              type="text"
              placeholder="Nome"
              value={loginFirstName}
              onChange={(event) =>
                setLoginFirstName(event.target.value)
              }
            />

            <input
              type="text"
              placeholder="Cognome"
              value={loginLastName}
              onChange={(event) =>
                setLoginLastName(event.target.value)
              }
            />

            {loginError && (
              <p className="error-message">
                {loginError}
              </p>
            )}

            <button type="submit">
              Accesso storico
            </button>
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
          className={
            activeTab === 'profile'
              ? 'nav-item active'
              : isMaintainer && pendingAccountRequests > 0
                ? 'nav-item attention'
                : 'nav-item'
          }
          onClick={() => setActiveTab('profile')}
        >
          <span className="nav-icon-wrapper">
            <UserRound size={21} />

            {isMaintainer &&
              pendingAccountRequests > 0 && (
                <span className="nav-badge">
                  {pendingAccountRequests}
                </span>
              )}
          </span>
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
            {isMaintainer &&
              pendingAccountLinkRequests.length > 0 && (
                <section className="panel">
                  <div className="panel-title">
                    <Users />

                    <div>
                      <h2>Richieste account</h2>

                      <p className="panel-subtitle">
                        Collega gli account Google ai
                        giocatori esistenti
                      </p>
                    </div>
                  </div>

                  <div className="account-link-requests">
                    {pendingAccountLinkRequests.map(
                      (request) => (
                        <article
                          className="account-link-request"
                          key={request.id}
                        >
                          <div>
                            <strong>
                              {request.requestedByName ||
                                request.requestedByEmail}
                            </strong>

                            <span>
                              Vuole collegarsi a{' '}
                              <b>
                                {request.legacyUsername}
                              </b>
                            </span>

                            <small>
                              {request.requestedByEmail}
                            </small>
                          </div>
                        <div className="account-link-actions">
                          <button
                            type="button"
                            className="account-link-reject-button"
                            disabled={reviewingAccountLinkId === request.id}
                            onClick={() => rejectAccountLink(request)}
                          >
                            {reviewingAccountLinkId === request.id
                              ? '...'
                              : 'Rifiuta'}
                          </button>

                          <button
                            type="button"
                            className="account-link-approve-button"
                            disabled={reviewingAccountLinkId === request.id}
                            onClick={() => approveAccountLink(request)}
                          >
                            {reviewingAccountLinkId === request.id
                              ? '...'
                              : 'Approva'}
                          </button>
                        </div>
                        </article>
                      )
                    )}
                  </div>
                </section>
              )}
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

            {isMaintainer && activeTeam && (
              <section className="panel team-settings-panel">
                <div className="panel-title">
                  <Users />

                  <div>
                    <h2>Impostazioni gruppo</h2>

                    <p className="panel-subtitle">
                      Configura punteggi e disponibilità VAR
                    </p>
                  </div>
                </div>

                <form
                  className="team-settings-form"
                  onSubmit={saveTeamSettings}
                >
                  <label>
                    <span>Nome gruppo</span>

                    <input
                      type="text"
                      value={teamName}
                      onChange={(event) =>
                        setTeamName(event.target.value)
                      }
                    />
                  </label>

                  <div className="team-settings-grid">
                    <label>
                      <span>Punti bestemmia</span>

                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={bestemmiaPointsSetting}
                        onChange={(event) =>
                          setBestemmiaPointsSetting(
                            event.target.value
                          )
                        }
                      />
                    </label>

                    <label>
                      <span>Punti superbestemmia</span>

                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={superbestemmiaPointsSetting}
                        onChange={(event) =>
                          setSuperbestemmiaPointsSetting(
                            event.target.value
                          )
                        }
                      />
                    </label>

                    <label>
                      <span>VAR disponibili</span>

                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={varAllowanceSetting}
                        onChange={(event) =>
                          setVarAllowanceSetting(
                            event.target.value
                          )
                        }
                      />
                    </label>

                    <label>
                      <span>Rinnovo VAR</span>

                      <select
                        value={varResetPeriodSetting}
                        onChange={(event) =>
                          setVarResetPeriodSetting(
                            event.target.value
                          )
                        }
                      >
                        <option value="month">
                          Ogni mese
                        </option>

                        <option value="quarter">
                          Ogni trimestre
                        </option>

                        <option value="year">
                          Ogni anno
                        </option>

                        <option value="never">
                          Mai
                        </option>
                      </select>
                    </label>

                    <label>
                      <span>Durata votazione</span>

                      <select
                        value={varDurationHoursSetting}
                        onChange={(event) =>
                          setVarDurationHoursSetting(
                            event.target.value
                          )
                        }
                      >
                        <option value="24">24 ore</option>
                        <option value="48">48 ore</option>
                        <option value="72">72 ore</option>
                        <option value="120">5 giorni</option>
                      </select>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingTeamSettings}
                  >
                    {isSavingTeamSettings
                      ? 'Salvataggio...'
                      : 'Salva impostazioni'}
                  </button>
                </form>
              </section>
            )}

            <section className="panel profile-actions-panel">

              {userMemberships.length > 1 && (
                <button
                  type="button"
                  className="profile-action-button"
                  onClick={changeTeam}
                >
                  <Users size={21} />

                  <span>
                    <strong>Cambia gruppo</strong>
                    <small>
                      Passa a un altro gruppo senza fare logout
                    </small>
                  </span>
                </button>
              )}

              <button
                type="button"
                className="profile-action-button"
                onClick={() => setShowCreateTeam(true)}
              >
                <Plus size={21} />

                <span>
                  <strong>Crea nuovo gruppo</strong>
                  <small>
                    Crea una nuova partita
                  </small>
                </span>
              </button>
              
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
                      </span>

                      {item.blessingApplied && (
                        <span className="event-blessing-applied">
                          🙏 Bestemmia neutralizzata da una benedizione
                        </span>
                      )}

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

      {showCreateTeam && (
        <div
          className="modal-backdrop"
          onClick={() => setShowCreateTeam(false)}
        >
          <div
            className="modal create-team-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              className="modal-close"
              onClick={() =>
                setShowCreateTeam(false)
              }
            >
              <X />
            </button>

            <h2>Crea un nuovo gruppo</h2>

            <p>
              Sarai automaticamente owner del nuovo gruppo.
            </p>

            <form
              className="create-team-form"
              onSubmit={createTeam}
            >
              <label>
                <span>Nome gruppo</span>

                <input
                  type="text"
                  value={newTeamName}
                  onChange={(event) =>
                    setNewTeamName(event.target.value)
                  }
                  placeholder="Es. Team Progetto X"
                />
              </label>

              <label>
                <span>Il tuo username</span>

                <input
                  type="text"
                  value={newTeamUsername}
                  onChange={(event) =>
                    setNewTeamUsername(
                      event.target.value
                    )
                  }
                  placeholder="Come vuoi apparire in classifica"
                />
              </label>

              <button
                type="submit"
                disabled={
                  isCreatingTeam ||
                  !newTeamName.trim() ||
                  !newTeamUsername.trim()
                }
              >
                {isCreatingTeam
                  ? 'Creazione...'
                  : 'Crea gruppo'}
              </button>
            </form>
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

            <p>
              Benedizione: protegge dalla prossima bestemmia e viene
              consumata quando la neutralizza.
            </p>

            <p>
              Superbestemmia: +2 punti e non può essere neutralizzata da
              una benedizione.
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