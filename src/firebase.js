import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
} from 'firebase/firestore'
import {
  getMessaging,
  isSupported,
} from 'firebase/messaging'
import { getFunctions } from 'firebase/functions'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

if (
  import.meta.env.DEV &&
  firebaseConfig.projectId !== 'bestemmiometro-dev'
) {
  throw new Error(
    `Ambiente locale collegato al progetto sbagliato: ${firebaseConfig.projectId}`
  )
}

const app = initializeApp(firebaseConfig)


export const auth = getAuth(app)
export const functions = getFunctions(
  app,
  'europe-west8'
)

export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
})

export async function getFirebaseMessaging() {
  const supported = await isSupported()

  if (!supported) {
    return null
  }

  return getMessaging(app)
}