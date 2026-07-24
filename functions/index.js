const {
  onDocumentCreated,
  onDocumentUpdated,
} = require('firebase-functions/v2/firestore')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')
const { onSchedule } = require('firebase-functions/v2/scheduler')

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
            tag: `bestemmiometro-${data.targetId}`,
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

async function finalizeVarCase(varCaseRef, varCase, result) {
  const db = getFirestore()
  const eventRef = db.collection('events').doc(varCase.eventId)

  await db.runTransaction(async (transaction) => {
    const latestVarSnapshot = await transaction.get(varCaseRef)

    if (!latestVarSnapshot.exists) return

    const latestVar = latestVarSnapshot.data()

    if (latestVar.status !== 'open') return

    const status = result === 'approved'
      ? 'approved'
      : 'rejected'

    transaction.update(varCaseRef, {
      status,
      result,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })

    if (result === 'approved') {
      transaction.update(eventRef, {
        cancelledByVar: true,
        varStatus: 'approved',
        varResolvedAt: new Date(),
        updatedAt: new Date(),
      })
    } else {
      transaction.update(eventRef, {
        cancelledByVar: false,
        varStatus: 'rejected',
        varResolvedAt: new Date(),
        updatedAt: new Date(),
      })
    }
  })
}

exports.resolveVarOnVote = onDocumentUpdated(
  'varCases/{varCaseId}',
  async (event) => {
    const after = event.data.after.data()

    if (!after || after.status !== 'open') {
      return
    }

    const votes = Object.values(after.votes || {})

    const approvals = votes.filter(
      (vote) => vote === 'approve'
    ).length

    const rejections = votes.filter(
      (vote) => vote === 'reject'
    ).length

    const requiredApprovals = after.requiredApprovals || 1

    if (approvals >= requiredApprovals) {
      await finalizeVarCase(
        event.data.after.ref,
        after,
        'approved'
      )

      return
    }

    if (rejections >= requiredApprovals) {
      await finalizeVarCase(
        event.data.after.ref,
        after,
        'rejected'
      )
    }
  }
)

exports.finalizeExpiredVarCases = onSchedule(
  'every 1 hours',
  async () => {
    const db = getFirestore()
    const now = new Date()

    const snapshot = await db
      .collection('varCases')
      .where('status', '==', 'open')
      .where('expiresAt', '<=', now)
      .get()

    await Promise.all(
      snapshot.docs.map(async (document) => {
        const varCase = document.data()
        const votes = Object.values(varCase.votes || {})

        const approvals = votes.filter(
          (vote) => vote === 'approve'
        ).length

        const requiredApprovals =
          varCase.requiredApprovals || 1

        const result =
          approvals >= requiredApprovals
            ? 'approved'
            : 'rejected'

        await finalizeVarCase(
          document.ref,
          varCase,
          result
        )
      })
    )
  }
)

exports.notifyNewVar = onDocumentCreated(
  {
    document: 'varCases/{varCaseId}',
    region: 'us-central1',
  },
  async (event) => {
    const varCase = event.data?.data()

    if (!varCase) {
      console.log('Documento VAR non disponibile.')
      return
    }

    const {
      teamKey,
      challengedById,
      challengedByName,
      targetName,
      eventDescription,
      challengeReason,
      eventId,
    } = varCase

    if (!teamKey) {
      console.log('teamKey mancante nel VAR.')
      return
    }

    const db = getFirestore()

    const usersSnapshot = await db
      .collection('users')
      .where('teamKey', '==', teamKey)
      .where('notificationsEnabled', '==', true)
      .get()

    const recipients = usersSnapshot.docs
      .map((document) => ({
        id: document.id,
        ...document.data(),
      }))
      .filter(
        (user) =>
          Boolean(user.notificationToken) &&
          user.id !== varCase.challengedById
      )

    if (recipients.length === 0) {
      console.log(
        `Nessun destinatario disponibile per il VAR ${event.params.varCaseId}.`
      )
      return
    }

    const tokens = [
      ...new Set(
        recipients.map((user) => user.notificationToken)
      ),
    ].slice(0, 500)

    const personName =
      challengedByName ||
      targetName ||
      'Un giocatore'

    const description =
      eventDescription || 'Evento contestato'

    const reason =
      challengeReason || 'Nessuna motivazione indicata'

    const response = await getMessaging().sendEachForMulticast({
      tokens,

      notification: {
        title: '⚖️ Nuova richiesta VAR',
        body: `${personName} ha contestato: ${description}`,
      },

      data: {
        type: 'var-opened',
        varCaseId: event.params.varCaseId,
        eventId: eventId || '',
        teamKey,
        challengedByName: personName,
        eventDescription: description,
        challengeReason: reason,
      },

      webpush: {
        notification: {
          title: '⚖️ Nuova richiesta VAR',
          body: `${personName} ha contestato: ${description}`,

          icon: 'https://pierpaolo97.github.io/bestemmiometro/icons/icon-192.png',
          badge: 'https://pierpaolo97.github.io/bestemmiometro/icons/icon-192.png',

          tag: `bestemmiometro-var-${event.params.varCaseId}`,

          requireInteraction: false,
        },

        fcmOptions: {
          link: 'https://pierpaolo97.github.io/bestemmiometro/',
        },
      },
    })

    console.log(
      `Notifica VAR inviata: ${response.successCount} riuscite, ` +
      `${response.failureCount} fallite.`
    )

    const invalidTokens = []

    response.responses.forEach((result, index) => {
      if (result.success) return

      const errorCode = result.error?.code

      console.error(
        `Errore invio token ${index}:`,
        errorCode,
        result.error?.message
      )

      if (
        errorCode === 'messaging/registration-token-not-registered' ||
        errorCode === 'messaging/invalid-registration-token'
      ) {
        invalidTokens.push(tokens[index])
      }
    })

    if (invalidTokens.length === 0) return

    const batch = db.batch()

    recipients
      .filter((user) =>
        invalidTokens.includes(user.notificationToken)
      )
      .forEach((user) => {
        batch.update(
          db.collection('users').doc(user.id),
          {
            notificationToken: null,
            notificationsEnabled: false,
          }
        )
      })

    await batch.commit()

    console.log(
      `${invalidTokens.length} token non validi disabilitati.`
    )
  }
)