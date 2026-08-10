const {
  onDocumentCreated,
  onDocumentUpdated,
} = require('firebase-functions/v2/firestore')
const { initializeApp } = require('firebase-admin/app')
const {
  getFirestore,
  FieldValue,
} = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { 
  onCall, 
  HttpsError, 
} = require('firebase-functions/v2/https')

initializeApp()

async function getAuthenticatedProfile(
  transaction,
  db,
  authUid
) {
  const profileQuery = db
    .collection('users')
    .where('authUid', '==', authUid)
    .limit(2)

  const profileSnapshot =
    await transaction.get(profileQuery)

  if (profileSnapshot.empty) {
    throw new HttpsError(
      'permission-denied',
      'Nessun profilo collegato a questo account.'
    )
  }

  if (profileSnapshot.size > 1) {
    throw new HttpsError(
      'failed-precondition',
      'L’account risulta collegato a più profili.'
    )
  }

  const profileDocument =
    profileSnapshot.docs[0]

  return {
    id: profileDocument.id,
    ref: profileDocument.ref,
    ...profileDocument.data(),
  }
}

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

        data: {
          type: 'event-created',
          eventType: data.type || '',
          targetId: data.targetId || '',
          targetName: data.targetName || '',
          eventId: event.params.eventId || '',
        },

        webpush: {
          fcmOptions: {
            link: 'https://pierpaolo97.github.io/bestemmiometro/',
          },

          notification: {
            tag: `bestemmiometro-${event.params.eventId}`,
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

async function notifyVarResult(varCase, result) {
  const db = getFirestore()

  if (!varCase?.teamKey) {
    console.log(
      'Impossibile notificare il risultato VAR: teamKey mancante.'
    )
    return
  }

  const usersSnapshot = await db
    .collection('users')
    .where('teamKey', '==', varCase.teamKey)
    .where('notificationsEnabled', '==', true)
    .get()

  const recipients = usersSnapshot.docs
    .map((document) => ({
      id: document.id,
      notificationToken: document.data().notificationToken,
    }))
    .filter((user) => Boolean(user.notificationToken))

  if (!recipients.length) {
    console.log(
      `Nessun token disponibile per l'esito del VAR ${varCase.eventId}.`
    )
    return
  }

  const tokens = [
    ...new Set(
      recipients.map((user) => user.notificationToken)
    ),
  ].slice(0, 500)

  const title =
    result === 'approved'
      ? '✅ VAR approvato'
      : '❌ VAR respinto'

  const body =
    result === 'approved'
      ? `La bestemmia assegnata a ${varCase.targetName} è stata annullata.`
      : `La bestemmia assegnata a ${varCase.targetName} rimane valida.`

  const response =
    await getMessaging().sendEachForMulticast({
      tokens,

      notification: {
        title,
        body,
      },

      data: {
        type: 'var-result',
        result,
        eventId: varCase.eventId || '',
        varCaseId: varCase.eventId || '',
        teamKey: varCase.teamKey || '',
        targetName: varCase.targetName || '',
      },

      webpush: {
        fcmOptions: {
          link:
            'https://pierpaolo97.github.io/bestemmiometro/',
        },

        notification: {
          title,
          body,

          tag:
            `bestemmiometro-var-result-${varCase.eventId}`,

          icon:
            'https://pierpaolo97.github.io/bestemmiometro/icons/icon-192.png',

          badge:
            'https://pierpaolo97.github.io/bestemmiometro/icons/icon-192.png',
        },
      },
    })

  console.log(
    `Notifica esito VAR inviata. Successi: ${response.successCount}, fallimenti: ${response.failureCount}`
  )

  const invalidTokens = []

  response.responses.forEach((item, index) => {
    if (item.success) return

    const errorCode = item.error?.code

    console.error(
      `Errore notifica esito VAR token ${index}:`,
      errorCode,
      item.error?.message
    )

    if (
      errorCode ===
        'messaging/registration-token-not-registered' ||
      errorCode ===
        'messaging/invalid-registration-token'
    ) {
      invalidTokens.push(tokens[index])
    }
  })

  if (!invalidTokens.length) {
    return
  }

  const batch = db.batch()

  recipients
    .filter((user) =>
      invalidTokens.includes(user.notificationToken)
    )
    .forEach((user) => {
      const userRef = db
        .collection('users')
        .doc(user.id)

      batch.update(userRef, {
        notificationToken: null,
        notificationsEnabled: false,
        updatedAt: new Date(),
      })
    })

  await batch.commit()

  console.log(
    `${invalidTokens.length} token non validi rimossi dopo l'esito del VAR.`
  )
}

async function finalizeVarCase(varCaseRef, varCase, result) {
  const db = getFirestore()
  const eventRef = db.collection('events').doc(varCase.eventId)

  const finalizationResult = await db.runTransaction(
    async (transaction) => {
      const latestVarSnapshot =
        await transaction.get(varCaseRef)

      if (!latestVarSnapshot.exists) {
        return {
          finalized: false,
          reason: 'VAR_NOT_FOUND',
        }
      }

      const latestVar = latestVarSnapshot.data()

      // Impedisce notifiche e chiusure duplicate.
      if (latestVar.status !== 'open') {
        return {
          finalized: false,
          reason: 'VAR_ALREADY_CLOSED',
        }
      }

      const status =
        result === 'approved'
          ? 'approved'
          : 'rejected'

      const now = new Date()

      transaction.update(varCaseRef, {
        status,
        result,
        resolvedAt: now,
        updatedAt: now,
      })

      if (result === 'approved') {
        transaction.update(eventRef, {
          cancelledByVar: true,
          varStatus: 'approved',
          varResolvedAt: now,
          updatedAt: now,
        })
      } else {
        transaction.update(eventRef, {
          cancelledByVar: false,
          varStatus: 'rejected',
          varResolvedAt: now,
          updatedAt: now,
        })
      }

      return {
        finalized: true,
        varCase: latestVar,
      }
    }
  )

  if (!finalizationResult.finalized) {
    console.log(
      `VAR non finalizzato: ${finalizationResult.reason}`
    )
    return
  }

  try {
    await notifyVarResult(
      finalizationResult.varCase,
      result
    )

    console.log(
      `Notifica esito VAR inviata: ${result}`
    )
  } catch (error) {
    // Il VAR rimane correttamente chiuso anche se la push fallisce.
    console.error(
      'Errore invio notifica esito VAR:',
      error
    )
  }
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
  'every 5 minutes',
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

exports.approveAccountLink = onCall(
  {
    region: 'europe-west8',
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Devi effettuare l’accesso con Google.'
      )
    }

    const requestId =
      typeof request.data?.requestId === 'string'
        ? request.data.requestId.trim()
        : ''

    if (!requestId) {
      throw new HttpsError(
        'invalid-argument',
        'requestId mancante.'
      )
    }

    const db = getFirestore()

    const linkRequestRef = db
      .collection('accountLinkRequests')
      .doc(requestId)

    const result = await db.runTransaction(
      async (transaction) => {
        /*
         * Tutte le letture vengono eseguite prima
         * delle scritture.
         */

        const reviewer =
          await getAuthenticatedProfile(
            transaction,
            db,
            request.auth.uid
          )

        if (
          reviewer.accessRole !== 'maintainer' &&
          reviewer.accessRole !== 'owner'
        ) {
          throw new HttpsError(
            'permission-denied',
            'Solo owner e maintainer possono approvare.'
          )
        }

        const linkRequestSnapshot =
          await transaction.get(linkRequestRef)

        if (!linkRequestSnapshot.exists) {
          throw new HttpsError(
            'not-found',
            'La richiesta non esiste.'
          )
        }

        const linkRequest =
          linkRequestSnapshot.data()

        if (linkRequest.status !== 'pending') {
          throw new HttpsError(
            'failed-precondition',
            'La richiesta è già stata gestita.'
          )
        }

        if (
          !linkRequest.legacyUserId ||
          !linkRequest.requestedByUid ||
          !linkRequest.teamKey
        ) {
          throw new HttpsError(
            'failed-precondition',
            'La richiesta contiene dati incompleti.'
          )
        }

        if (
          reviewer.teamKey !== linkRequest.teamKey
        ) {
          throw new HttpsError(
            'permission-denied',
            'La richiesta appartiene a un altro team.'
          )
        }

        if (
          reviewer.authUid ===
          linkRequest.requestedByUid
        ) {
          throw new HttpsError(
            'permission-denied',
            'Non puoi approvare la tua richiesta.'
          )
        }

        const legacyUserRef = db
          .collection('users')
          .doc(linkRequest.legacyUserId)

        const legacyUserSnapshot =
          await transaction.get(legacyUserRef)

        if (!legacyUserSnapshot.exists) {
          throw new HttpsError(
            'not-found',
            'Il profilo richiesto non esiste.'
          )
        }

        const legacyUser =
          legacyUserSnapshot.data()

        if (
          legacyUser.teamKey !== reviewer.teamKey
        ) {
          throw new HttpsError(
            'permission-denied',
            'Il profilo appartiene a un altro team.'
          )
        }

        if (
          legacyUser.authUid &&
          legacyUser.authUid !==
            linkRequest.requestedByUid
        ) {
          throw new HttpsError(
            'already-exists',
            'Il profilo è già collegato a un altro account.'
          )
        }

        const claimedAccountQuery = db
          .collection('users')
          .where(
            'authUid',
            '==',
            linkRequest.requestedByUid
          )
          .limit(1)

        const claimedAccountSnapshot =
          await transaction.get(
            claimedAccountQuery
          )

        if (
          !claimedAccountSnapshot.empty &&
          claimedAccountSnapshot.docs[0].id !==
            legacyUserRef.id
        ) {
          throw new HttpsError(
            'already-exists',
            'Questo account Google è già collegato a un altro profilo.'
          )
        }

        const now =
          FieldValue.serverTimestamp()

        transaction.update(legacyUserRef, {
          authUid:
            linkRequest.requestedByUid,

          email:
            linkRequest.requestedByEmail ||
            null,

          photoURL:
            linkRequest.requestedByPhotoURL ||
            null,

          accountStatus: 'active',
          accountLinkedAt: now,
          updatedAt: now,
        })

        transaction.update(linkRequestRef, {
          status: 'approved',

          reviewedAt: now,
          reviewedByUid: request.auth.uid,
          reviewedByUserId: reviewer.id,
          reviewedByName:
            reviewer.username || null,

          updatedAt: now,
        })

        return {
          legacyUserId: legacyUserRef.id,
          legacyUsername:
            legacyUser.username || null,
        }
      }
    )

    return {
      success: true,
      ...result,
    }
  }
)

exports.rejectAccountLink = onCall(
  {
    region: 'europe-west8',
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Devi effettuare l’accesso con Google.'
      )
    }

    const requestId =
      typeof request.data?.requestId === 'string'
        ? request.data.requestId.trim()
        : ''

    if (!requestId) {
      throw new HttpsError(
        'invalid-argument',
        'requestId mancante.'
      )
    }

    const db = getFirestore()

    const linkRequestRef = db
      .collection('accountLinkRequests')
      .doc(requestId)

    const result = await db.runTransaction(
      async (transaction) => {
        const reviewer =
          await getAuthenticatedProfile(
            transaction,
            db,
            request.auth.uid
          )

        if (
          reviewer.accessRole !== 'maintainer' &&
          reviewer.accessRole !== 'owner'
        ) {
          throw new HttpsError(
            'permission-denied',
            'Solo owner e maintainer possono rifiutare.'
          )
        }

        const linkRequestSnapshot =
          await transaction.get(linkRequestRef)

        if (!linkRequestSnapshot.exists) {
          throw new HttpsError(
            'not-found',
            'La richiesta non esiste.'
          )
        }

        const linkRequest =
          linkRequestSnapshot.data()

        if (linkRequest.status !== 'pending') {
          throw new HttpsError(
            'failed-precondition',
            'La richiesta è già stata gestita.'
          )
        }

        if (
          reviewer.teamKey !== linkRequest.teamKey
        ) {
          throw new HttpsError(
            'permission-denied',
            'La richiesta appartiene a un altro team.'
          )
        }

        if (
          request.auth.uid ===
          linkRequest.requestedByUid
        ) {
          throw new HttpsError(
            'permission-denied',
            'Non puoi gestire la tua richiesta.'
          )
        }

        const now =
          FieldValue.serverTimestamp()

        transaction.update(linkRequestRef, {
          status: 'rejected',

          reviewedAt: now,
          reviewedByUid: request.auth.uid,
          reviewedByUserId: reviewer.id,
          reviewedByName:
            reviewer.username || null,

          updatedAt: now,
        })

        return {
          legacyUsername:
            linkRequest.legacyUsername || null,
        }
      }
    )

    return {
      success: true,
      ...result,
    }
  }
)