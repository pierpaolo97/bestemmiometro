importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'LA_TUA_API_KEY',
  authDomain: 'bestemmiometro-3d8aa.firebaseapp.com',
  projectId: 'bestemmiometro-3d8aa',
  storageBucket: 'bestemmiometro-3d8aa.firebasestorage.app',
  messagingSenderId: '950657704844',
  appId: '1:950657704844:web:40efc6cdbc11dc5afd2ca9',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(
    payload.notification?.title || 'Bestemmiometro',
    {
      body: payload.notification?.body || 'Nuovo evento registrato',
      icon: '/bestemmiometro/icons/icon-192.png',
      badge: '/bestemmiometro/icons/icon-192.png',
    }
  )
})