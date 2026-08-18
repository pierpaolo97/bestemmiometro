const fs = require('node:fs')
const path = require('node:path')

const {
  cert,
  deleteApp,
  initializeApp,
} = require('firebase-admin/app')

const {
  FieldValue,
  getFirestore,
} = require('firebase-admin/firestore')

const PROJECT_ID = 'bestemmiometro-dev'

const COLLECTIONS_TO_MIGRATE = [
  'users',
  'events',
  'varCases',
  'varUsage',
]

function readServiceAccount(filePath) {
  const absolutePath = path.resolve(filePath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `Chiave Firebase non trovata: ${absolutePath}`
    )
  }

  return JSON.parse(
    fs.readFileSync(absolutePath, 'utf8')
  )
}

function normalizeTeamId(teamKey) {
  return teamKey
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function collectTeamKeys(db) {
  const teamKeys = new Set()

  for (const collectionName of COLLECTIONS_TO_MIGRATE) {
    const snapshot = await db
      .collection(collectionName)
      .get()

    snapshot.docs.forEach((document) => {
      const data = document.data()

      if (
        typeof data.teamKey === 'string' &&
        data.teamKey.trim()
      ) {
        teamKeys.add(data.teamKey.trim())
      }
    })
  }

  return [...teamKeys]
}

async function ensureTeamDocument(
  db,
  teamKey
) {
  const teamId = normalizeTeamId(teamKey)

  if (!teamId) {
    throw new Error(
      `Impossibile generare teamId da "${teamKey}"`
    )
  }

  const teamRef = db
    .collection('teams')
    .doc(teamId)

  const snapshot = await teamRef.get()

  if (!snapshot.exists) {
    console.log(
      `Creazione team ${teamId} (${teamKey})`
    )

    await teamRef.set({
      name: teamKey,
      inviteCode: teamKey,
      legacyTeamKey: teamKey,

      ownerUid: null,

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

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return teamId
  }

  console.log(
    `Team ${teamId} già esistente`
  )

  return teamId
}

async function migrateCollection(
  db,
  collectionName,
  teamMap
) {
  const snapshot = await db
    .collection(collectionName)
    .get()

  if (snapshot.empty) {
    console.log(
      `${collectionName}: nessun documento`
    )

    return
  }

  const writer = db.bulkWriter()

  let migrated = 0
  let skipped = 0
  let missingTeamKey = 0

  for (const document of snapshot.docs) {
    const data = document.data()

    if (data.teamId) {
      skipped += 1
      continue
    }

    const teamKey =
      typeof data.teamKey === 'string'
        ? data.teamKey.trim()
        : ''

    if (!teamKey) {
      console.warn(
        `${collectionName}/${document.id}: teamKey mancante`
      )

      missingTeamKey += 1
      continue
    }

    const teamId = teamMap.get(teamKey)

    if (!teamId) {
      console.warn(
        `${collectionName}/${document.id}: nessun teamId per ${teamKey}`
      )

      missingTeamKey += 1
      continue
    }

    writer.update(document.ref, {
      teamId,
      updatedAt: FieldValue.serverTimestamp(),
    })

    migrated += 1
  }

  await writer.close()

  console.log('')
  console.log(`${collectionName}:`)
  console.log(`  migrati: ${migrated}`)
  console.log(`  già migrati: ${skipped}`)
  console.log(
    `  senza teamKey valido: ${missingTeamKey}`
  )
}

async function main() {
  const credentialsPath =
    process.env.FIREBASE_DEV_CREDENTIALS

  if (!credentialsPath) {
    throw new Error(
      'Imposta FIREBASE_DEV_CREDENTIALS con il percorso della chiave del progetto dev.'
    )
  }

  const serviceAccount =
    readServiceAccount(credentialsPath)

  if (
    serviceAccount.project_id !== PROJECT_ID
  ) {
    throw new Error(
      `La chiave appartiene a ${serviceAccount.project_id}, non a ${PROJECT_ID}.`
    )
  }

  const app = initializeApp({
    credential: cert(serviceAccount),
    projectId: PROJECT_ID,
  })

  const db = getFirestore(app)

  console.log('')
  console.log('MIGRAZIONE TEAM')
  console.log(`Progetto: ${PROJECT_ID}`)
  console.log('')

  const teamKeys =
    await collectTeamKeys(db)

  if (!teamKeys.length) {
    throw new Error(
      'Nessuna teamKey trovata.'
    )
  }

  console.log(
    `Team trovati: ${teamKeys.join(', ')}`
  )

  const teamMap = new Map()

  for (const teamKey of teamKeys) {
    const teamId =
      await ensureTeamDocument(
        db,
        teamKey
      )

    teamMap.set(teamKey, teamId)
  }

  for (
    const collectionName
    of COLLECTIONS_TO_MIGRATE
  ) {
    await migrateCollection(
      db,
      collectionName,
      teamMap
    )
  }

  console.log('')
  console.log('Migrazione completata.')
  console.log('')

  console.log('Mapping team:')
  for (
    const [teamKey, teamId]
    of teamMap.entries()
  ) {
    console.log(
      `  ${teamKey} -> ${teamId}`
    )
  }

  await deleteApp(app)
}

main().catch((error) => {
  console.error('')
  console.error(
    'Migrazione fallita:',
    error
  )

  process.exitCode = 1
})