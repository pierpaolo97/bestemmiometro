const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')
const { onDocumentUpdated } = require('firebase-functions/v2/firestore')
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