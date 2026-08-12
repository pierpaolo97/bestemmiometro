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



async function getAuthenticatedTeamProfile(
  transaction,
  db,
  authUid,
  teamId
) {
  const profileQuery = db
    .collection('users')
    .where('authUid', '==', authUid)
    .where('teamId', '==', teamId)
    .where('accountStatus', '==', 'active')
    .limit(1)

  const profileSnapshot =
    await transaction.get(profileQuery)

  if (profileSnapshot.empty) {
    throw new HttpsError(
      'permission-denied',
      'Non fai parte di questo gruppo.'
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
        // 1. Leggiamo prima la richiesta
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

        // 2. Troviamo il reviewer NEL TEAM corretto
        const reviewer =
          await getAuthenticatedTeamProfileByKey(
            transaction,
            db,
            request.auth.uid,
            linkRequest.teamKey
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

        if (
          reviewer.authUid ===
          linkRequest.requestedByUid
        ) {
          throw new HttpsError(
            'permission-denied',
            'Non puoi approvare la tua richiesta.'
          )
        }

        // 3. Profilo storico da collegare
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
          legacyUser.teamKey !==
          linkRequest.teamKey
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

        /*
         * Multi-team:
         * lo stesso Google UID PUÒ esistere in altri gruppi.
         * Dobbiamo impedire soltanto un secondo profilo
         * nello STESSO team.
         */
        const existingTeamMembershipQuery = db
          .collection('users')
          .where(
            'authUid',
            '==',
            linkRequest.requestedByUid
          )
          .where(
            'teamKey',
            '==',
            linkRequest.teamKey
          )
          .limit(1)

        const existingTeamMembershipSnapshot =
          await transaction.get(
            existingTeamMembershipQuery
          )

        if (
          !existingTeamMembershipSnapshot.empty &&
          existingTeamMembershipSnapshot.docs[0].id !==
            legacyUserRef.id
        ) {
          throw new HttpsError(
            'already-exists',
            'Questo account Google è già collegato a un profilo di questo gruppo.'
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
          reviewedByUid:
            request.auth.uid,

          reviewedByUserId:
            reviewer.id,

          reviewedByName:
            reviewer.username || null,

          updatedAt: now,
        })

        return {
          legacyUserId:
            legacyUserRef.id,

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
        // 1. Prima leggiamo la richiesta
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

        if (!linkRequest.teamKey) {
          throw new HttpsError(
            'failed-precondition',
            'teamKey mancante nella richiesta.'
          )
        }

        // 2. Reviewer nel team corretto
        const reviewer =
          await getAuthenticatedTeamProfileByKey(
            transaction,
            db,
            request.auth.uid,
            linkRequest.teamKey
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
          reviewedByUid:
            request.auth.uid,

          reviewedByUserId:
            reviewer.id,

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

exports.approveJoinRequest = onCall(
  {
    region: 'europe-west8',
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Accesso richiesto.'
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

    const joinRequestRef = db
      .collection('joinRequests')
      .doc(requestId)

    const result = await db.runTransaction(
      async (transaction) => {
        // 1. Prima leggiamo la richiesta
        const joinRequestSnapshot =
          await transaction.get(joinRequestRef)

        if (!joinRequestSnapshot.exists) {
          throw new HttpsError(
            'not-found',
            'Richiesta non trovata.'
          )
        }

        const joinRequest =
          joinRequestSnapshot.data()

        if (joinRequest.status !== 'pending') {
          throw new HttpsError(
            'failed-precondition',
            'Richiesta già gestita.'
          )
        }

        if (
          !joinRequest.teamId ||
          !joinRequest.requestedByUid
        ) {
          throw new HttpsError(
            'failed-precondition',
            'Richiesta incompleta.'
          )
        }

        // 2. Cerchiamo il profilo del reviewer
        // SOLTANTO nel team della richiesta
        const reviewer =
          await getAuthenticatedTeamProfile(
            transaction,
            db,
            request.auth.uid,
            joinRequest.teamId
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

        // 3. Cerchiamo un'eventuale vecchia membership
        const existingMembershipQuery = db
          .collection('users')
          .where(
            'authUid',
            '==',
            joinRequest.requestedByUid
          )
          .where(
            'teamId',
            '==',
            joinRequest.teamId
          )

        const existingMembershipSnapshot =
          await transaction.get(
            existingMembershipQuery
          )

        const now =
          FieldValue.serverTimestamp()

        let membershipRef = null
        let reactivatedMembership = false

        if (!existingMembershipSnapshot.empty) {
          const memberships =
            existingMembershipSnapshot.docs.map(
              (document) => ({
                id: document.id,
                ref: document.ref,
                ...document.data(),
              })
            )

          const activeMembership =
            memberships.find(
              (membership) =>
                membership.accountStatus === 'active'
            )

          if (activeMembership) {
            throw new HttpsError(
              'already-exists',
              'L’utente fa già parte del gruppo.'
            )
          }

          /*
          * Non esiste nessuna membership attiva:
          * recuperiamo una di quelle rimosse.
          */
          const removedMembership =
            memberships.find(
              (membership) =>
                membership.accountStatus === 'removed'
            )

          if (removedMembership) {
            membershipRef =
              removedMembership.ref

            reactivatedMembership = true
          }
        } 

        if (!membershipRef) {
          membershipRef =
            db.collection('users').doc()
        }


        const displayName =
          joinRequest.requestedByName ||
          joinRequest.requestedByEmail ||
          'Giocatore'

        const nameParts =
          displayName.trim().split(/\s+/)

        const firstName =
          nameParts[0] || displayName

        const lastName =
          nameParts.slice(1).join(' ')

        if (reactivatedMembership) {
          transaction.update(
            membershipRef,
            {
              accountStatus: 'active',

              /*
              * Rientra sempre come Player.
              * Non recuperiamo automaticamente
              * eventuali privilegi da Maintainer.
              */
              accessRole: 'player',

              email:
                joinRequest.requestedByEmail ||
                null,

              photoURL:
                joinRequest.requestedByPhotoURL ||
                null,

              removedAt: null,
              removedById: null,
              removedByName: null,

              leftAt: null,

              rejoinedAt: now,

              updatedAt: now,
            }
          )
        } else {
          const displayName =
            joinRequest.requestedByName ||
            joinRequest.requestedByEmail ||
            'Giocatore'

          const nameParts =
            displayName.trim().split(/\s+/)

          const firstName =
            nameParts[0] || displayName

          const lastName =
            nameParts.slice(1).join(' ')

          transaction.set(
            membershipRef,
            {
              authUid:
                joinRequest.requestedByUid,

              teamId:
                joinRequest.teamId,

              teamKey:
                joinRequest.teamKey,

              teamName:
                joinRequest.teamName,

              username:
                firstName,

              firstName,
              lastName,

              email:
                joinRequest.requestedByEmail ||
                null,

              photoURL:
                joinRequest.requestedByPhotoURL ||
                null,

              role: 'default',
              accessRole: 'player',
              accountStatus: 'active',

              createdAt: now,
              updatedAt: now,
            }
          )
        }

        transaction.update(
          joinRequestRef,
          {
            status: 'approved',
            reactivatedMembership,
            membershipId:
              membershipRef.id,

            reviewedAt: now,
            reviewedByUid:
              request.auth.uid,

            reviewedByUserId:
              reviewer.id,

            reviewedByName:
              reviewer.username || null,

            updatedAt: now,
          }
        )

        return {
          membershipId:
            membershipRef.id,
          reactivatedMembership,
        }
      }
    )

    return {
      success: true,
      ...result,
    }
  }
)

exports.rejectJoinRequest = onCall(
  {
    region: 'europe-west8',
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Accesso richiesto.'
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

    const joinRequestRef = db
      .collection('joinRequests')
      .doc(requestId)

    await db.runTransaction(
      async (transaction) => {
        // Prima leggiamo la richiesta
        const snapshot =
          await transaction.get(
            joinRequestRef
          )

        if (!snapshot.exists) {
          throw new HttpsError(
            'not-found',
            'Richiesta non trovata.'
          )
        }

        const joinRequest =
          snapshot.data()

        if (
          joinRequest.status !== 'pending'
        ) {
          throw new HttpsError(
            'failed-precondition',
            'Richiesta già gestita.'
          )
        }

        if (!joinRequest.teamId) {
          throw new HttpsError(
            'failed-precondition',
            'teamId mancante nella richiesta.'
          )
        }

        // Poi troviamo la membership corretta
        const reviewer =
          await getAuthenticatedTeamProfile(
            transaction,
            db,
            request.auth.uid,
            joinRequest.teamId
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

        const now =
          FieldValue.serverTimestamp()

        transaction.update(
          joinRequestRef,
          {
            status: 'rejected',

            reviewedAt: now,
            reviewedByUid:
              request.auth.uid,

            reviewedByUserId:
              reviewer.id,

            reviewedByName:
              reviewer.username || null,

            updatedAt: now,
          }
        )
      }
    )

    return {
      success: true,
    }
  }
)

async function getAuthenticatedTeamProfileByKey(
  transaction,
  db,
  authUid,
  teamKey
) {
  const profileQuery = db
    .collection('users')
    .where('authUid', '==', authUid)
    .where('teamKey', '==', teamKey)
    .where('accountStatus', '==', 'active')
    .limit(1)

  const profileSnapshot =
    await transaction.get(profileQuery)

  if (profileSnapshot.empty) {
    throw new HttpsError(
      'permission-denied',
      'Non fai parte di questo gruppo.'
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

exports.deleteTeam = onCall(
  {
    region: 'europe-west8',
    timeoutSeconds: 300,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Devi effettuare l’accesso.'
      )
    }

    const teamId =
      typeof request.data?.teamId === 'string'
        ? request.data.teamId.trim()
        : ''

    const confirmation =
      typeof request.data?.confirmation === 'string'
        ? request.data.confirmation.trim()
        : ''

    if (!teamId) {
      throw new HttpsError(
        'invalid-argument',
        'teamId mancante.'
      )
    }

    if (confirmation !== 'ELIMINA') {
      throw new HttpsError(
        'invalid-argument',
        'Conferma eliminazione non valida.'
      )
    }

    const db = getFirestore()

    const teamRef = db
      .collection('teams')
      .doc(teamId)

    const teamSnapshot =
      await teamRef.get()

    if (!teamSnapshot.exists) {
      throw new HttpsError(
        'not-found',
        'Il gruppo non esiste.'
      )
    }

    const team = teamSnapshot.data()

    /*
     * Cerchiamo la membership dell'utente
     * proprio in questo gruppo.
     */
    const ownerQuery = await db
      .collection('users')
      .where('authUid', '==', request.auth.uid)
      .where('teamId', '==', teamId)
      .where('accountStatus', '==', 'active')
      .limit(1)
      .get()

    if (ownerQuery.empty) {
      throw new HttpsError(
        'permission-denied',
        'Non fai parte di questo gruppo.'
      )
    }

    const ownerProfile =
      ownerQuery.docs[0].data()

    if (ownerProfile.accessRole !== 'owner') {
      throw new HttpsError(
        'permission-denied',
        'Solo l’owner può eliminare il gruppo.'
      )
    }

    /*
     * Ulteriore controllo:
     * se ownerUid è presente nel documento team,
     * deve coincidere con chi sta eseguendo
     * l'operazione.
     */
    if (
      team.ownerUid &&
      team.ownerUid !== request.auth.uid
    ) {
      throw new HttpsError(
        'permission-denied',
        'Non sei il proprietario del gruppo.'
      )
    }

    const collections = [
      'events',
      'varCases',
      'varUsage',
      'joinRequests',
      'users',
    ]

    let deletedDocuments = 0

    /*
     * BulkWriter è adatto a molte operazioni
     * server-side Firestore.
     */
    const writer = db.bulkWriter()

    writer.onWriteError((error) => {
      console.error(
        'Errore BulkWriter:',
        error
      )

      /*
       * Firebase ritenta già alcune operazioni;
       * limitiamo eventuali ulteriori retry.
       */
      return error.failedAttempts < 3
    })

    for (const collectionName of collections) {
      const snapshot = await db
        .collection(collectionName)
        .where('teamId', '==', teamId)
        .get()

      for (const document of snapshot.docs) {
        writer.delete(document.ref)
        deletedDocuments += 1
      }
    }

    await writer.close()

    /*
     * Il team viene eliminato per ultimo:
     * finché la pulizia non è terminata,
     * il documento principale continua
     * ad esistere.
     */
    await teamRef.delete()

    console.log(
      `Team ${teamId} eliminato da ${request.auth.uid}. ` +
      `${deletedDocuments} documenti associati rimossi.`
    )

    return {
      success: true,
      deletedDocuments,
    }
  }
)

exports.leaveTeam = onCall(
  {
    region: 'europe-west8',
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Devi effettuare l’accesso.'
      )
    }

    const teamId =
      typeof request.data?.teamId === 'string'
        ? request.data.teamId.trim()
        : ''

    if (!teamId) {
      throw new HttpsError(
        'invalid-argument',
        'teamId mancante.'
      )
    }

    const db = getFirestore()

    await db.runTransaction(
      async (transaction) => {
        const membership =
          await getAuthenticatedTeamProfile(
            transaction,
            db,
            request.auth.uid,
            teamId
          )

        if (
          membership.accessRole === 'owner'
        ) {
          throw new HttpsError(
            'failed-precondition',
            'L’owner deve trasferire la proprietà prima di uscire.'
          )
        }

        const now =
          FieldValue.serverTimestamp()

        transaction.update(
          membership.ref,
          {
            accountStatus: 'removed',

            leftAt: now,

            removedAt: now,

            removedById:
              membership.id,

            removedByName:
              membership.username || null,

            updatedAt: now,
          }
        )
      }
    )

    return {
      success: true,
    }
  }
)

exports.transferTeamOwnership = onCall(
  {
    region: 'europe-west8',
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Devi effettuare l’accesso.'
      )
    }

    const teamId =
      typeof request.data?.teamId === 'string'
        ? request.data.teamId.trim()
        : ''

    const targetMembershipId =
      typeof request.data?.targetMembershipId === 'string'
        ? request.data.targetMembershipId.trim()
        : ''

    if (
      !teamId ||
      !targetMembershipId
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Dati mancanti.'
      )
    }

    const db = getFirestore()

    const teamRef = db
      .collection('teams')
      .doc(teamId)

    const targetRef = db
      .collection('users')
      .doc(targetMembershipId)

    await db.runTransaction(
      async (transaction) => {
        /*
         * Tutte le letture prima delle scritture.
         */

        const currentOwner =
          await getAuthenticatedTeamProfile(
            transaction,
            db,
            request.auth.uid,
            teamId
          )

        if (
          currentOwner.accessRole !== 'owner'
        ) {
          throw new HttpsError(
            'permission-denied',
            'Solo l’owner può trasferire la proprietà.'
          )
        }

        if (
          currentOwner.id ===
          targetMembershipId
        ) {
          throw new HttpsError(
            'invalid-argument',
            'Sei già owner del gruppo.'
          )
        }

        const teamSnapshot =
          await transaction.get(teamRef)

        if (!teamSnapshot.exists) {
          throw new HttpsError(
            'not-found',
            'Il gruppo non esiste.'
          )
        }

        const targetSnapshot =
          await transaction.get(targetRef)

        if (!targetSnapshot.exists) {
          throw new HttpsError(
            'not-found',
            'Il membro selezionato non esiste.'
          )
        }

        const target =
          targetSnapshot.data()

        if (
          target.teamId !== teamId
        ) {
          throw new HttpsError(
            'permission-denied',
            'Il membro appartiene a un altro gruppo.'
          )
        }

        if (
          target.accountStatus !== 'active'
        ) {
          throw new HttpsError(
            'failed-precondition',
            'Il membro non è attivo.'
          )
        }

        if (!target.authUid) {
          throw new HttpsError(
            'failed-precondition',
            'Il membro deve avere un account Google collegato.'
          )
        }

        const now =
          FieldValue.serverTimestamp()

        /*
         * Il vecchio owner diventa maintainer.
         */
        transaction.update(
          currentOwner.ref,
          {
            accessRole: 'maintainer',
            updatedAt: now,
          }
        )

        /*
         * Il nuovo membro diventa owner.
         */
        transaction.update(
          targetRef,
          {
            accessRole: 'owner',
            updatedAt: now,
          }
        )

        transaction.update(
          teamRef,
          {
            ownerUid:
              target.authUid,

            updatedAt: now,
          }
        )
      }
    )

    return {
      success: true,
    }
  }
)