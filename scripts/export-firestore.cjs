const fs = require('node:fs/promises')
const path = require('node:path')

const {
  applicationDefault,
  initializeApp,
} = require('firebase-admin/app')

const {
  getFirestore,
  Timestamp,
  GeoPoint,
  DocumentReference,
} = require('firebase-admin/firestore')

const PROJECT_ID = 'bestemmiometro-3d8aa'

initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
})

const db = getFirestore()

function serializeValue(value) {
  if (value === null || value === undefined) {
    return value
  }

  if (value instanceof Timestamp) {
    return {
      __type: 'timestamp',
      value: value.toDate().toISOString(),
    }
  }

  if (value instanceof GeoPoint) {
    return {
      __type: 'geopoint',
      latitude: value.latitude,
      longitude: value.longitude,
    }
  }

  if (value instanceof DocumentReference) {
    return {
      __type: 'documentReference',
      path: value.path,
    }
  }

  if (Buffer.isBuffer(value)) {
    return {
      __type: 'bytes',
      value: value.toString('base64'),
    }
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue)
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        serializeValue(nestedValue),
      ])
    )
  }

  return value
}

async function exportCollection(collectionReference) {
  const snapshot = await collectionReference.get()
  const documents = []

  for (const documentSnapshot of snapshot.docs) {
    const subcollections = await documentSnapshot.ref.listCollections()
    const exportedSubcollections = {}

    for (const subcollection of subcollections) {
      exportedSubcollections[subcollection.id] =
        await exportCollection(subcollection)
    }

    documents.push({
      id: documentSnapshot.id,
      path: documentSnapshot.ref.path,
      data: serializeValue(documentSnapshot.data()),
      subcollections: exportedSubcollections,
    })
  }

  return documents
}

async function main() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')

  const outputDirectory = path.resolve(
    process.cwd(),
    'backups',
    `firestore-${PROJECT_ID}-${timestamp}`
  )

  await fs.mkdir(outputDirectory, {
    recursive: true,
  })

  const collections = await db.listCollections()

  if (!collections.length) {
    throw new Error('Nessuna collection trovata in Firestore.')
  }

  const summary = {
    projectId: PROJECT_ID,
    exportedAt: new Date().toISOString(),
    collections: {},
  }

  console.log(`Progetto: ${PROJECT_ID}`)
  console.log(`Collection trovate: ${collections.length}`)
  console.log('')

  for (const collectionReference of collections) {
    console.log(`Esportazione ${collectionReference.id}...`)

    const documents =
      await exportCollection(collectionReference)

    const fileName =
      `${collectionReference.id}.json`

    await fs.writeFile(
      path.join(outputDirectory, fileName),
      JSON.stringify(
        {
          projectId: PROJECT_ID,
          collection: collectionReference.id,
          exportedAt: new Date().toISOString(),
          documentCount: documents.length,
          documents,
        },
        null,
        2
      ),
      'utf8'
    )

    summary.collections[collectionReference.id] = {
      documentCount: documents.length,
      file: fileName,
    }

    console.log(
      `  OK: ${documents.length} documenti`
    )
  }

  await fs.writeFile(
    path.join(outputDirectory, 'summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8'
  )

  console.log('')
  console.log('Backup completato:')
  console.log(outputDirectory)
}

main()
  .then(() => {
    process.exitCode = 0
  })
  .catch((error) => {
    console.error('')
    console.error('Backup fallito:', error)
    process.exitCode = 1
  })