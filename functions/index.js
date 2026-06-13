const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')

initializeApp()

exports.notifyNewEvent = onDocumentCreated(
  'events/{eventId}',
  async (event) => {
    try {
      const data = event.data.data()

      if (!data?.teamKey) {
        console.log('Evento senza teamKey')
        return
      }

      console.log('Nuovo evento ricevuto')
      console.log('Tipo:', data.type)
      console.log('Target:', data.targetName)

      const db = getFirestore()

      const usersSnapshot = await db
        .collection('users')
        .where('teamKey', '==', data.teamKey)
        .where('notificationsEnabled', '==', true)
        .get()

      let tokens = usersSnapshot.docs
        .filter((doc) => doc.id !== data.createdById)
        .map((doc) => doc.data().notificationToken)
        .filter(Boolean)

      if (tokens.length > 50) {
        tokens = tokens.slice(0, 50)
      }

      console.log('Token trovati:', tokens.length)

      if (!tokens.length) {
        console.log('Nessun token disponibile')
        return
      }

      const notificationConfig = {
        bestemmia: {
          title: '🔥 Nuova bestemmia',
          body: `Assegnata a ${data.targetName}`,
        },

        benedizione: {
          title: '🙏 Nuova benedizione',
          body: `Assegnata a ${data.targetName}`,
        },

        superbestemmia: {
          title: '💀 Superbestemmia',
          body: `Assegnata a ${data.targetName}`,
        },
      }

      const notification =
        notificationConfig[data.type] || {
          title: 'Bestemmiometro',
          body: 'Nuovo evento registrato',
        }

      const result = await getMessaging().sendEachForMulticast({
        tokens,

        notification: {
          title: notification.title,
          body: notification.body,
        },

        webpush: {
          fcmOptions: {
            link: 'https://pierpaolo97.github.io/bestemmiometro/',
          },

          notification: {
            icon:
              'https://pierpaolo97.github.io/bestemmiometro/icons/icon-192.png',

            badge:
              'https://pierpaolo97.github.io/bestemmiometro/icons/icon-192.png',
          },
        },
      })

      console.log(
        `Notifiche inviate. Success: ${result.successCount}`
      )

      console.log(
        `Notifiche fallite: ${result.failureCount}`
      )
    } catch (error) {
      console.error('Errore notifyNewEvent:', error)
    }
  }
)