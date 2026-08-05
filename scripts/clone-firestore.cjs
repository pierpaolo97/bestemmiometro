const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline/promises')
const { stdin: input, stdout: output } = require('node:process')

const {
  cert,
  deleteApp,
  initializeApp,
} = require('firebase-admin/app')

const {
  DocumentReference,
  GeoPoint,
  Timestamp,
  getFirestore,
} = require('firebase-admin/firestore')

const SOURCE_PROJECT_ID = 'bestemmiometro-3d8aa'
const DESTINATION_PROJECT_ID = 'bestemmiometro-dev'

const DEFAULT_COLLECTIONS = [
  'users',
  'events',
  'varCases',
  'varUsage',
]

function readServiceAccount(filePath) {
  const absolutePath = path.resolve(filePath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Chiave non trovata: ${absolutePath}`)
  }

  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'))
}

/**
 * Ricrea nel database di destinazione gli eventuali DocumentReference.
 * Timestamp, GeoPoint, Buffer, array e oggetti vengono preservati.
 */
function convertValue(value, destinationDb) {
  if (value === null || value === undefined) {
    return value
  }

  if (value instanceof DocumentReference) {
    return destinationDb.doc(value.path)
  }

  if (value instanceof Timestamp) {
    return Timestamp.fromMillis(value.toMillis())
  }

  if (value instanceof GeoPoint) {
    return new GeoPoint(value.latitude, value.longitude)
  }

  if (Buffer.isBuffer(value)) {
    return Buffer.from(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      convertValue(item, destinationDb)
    )
  }

  if (
    typeof value === 'object' &&
    value.constructor === Object
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        convertValue(nestedValue, destinationDb),
      ])
    )
  }

  return value
}

async function countCollectionTree(collectionRef) {
  const snapshot = await collectionRef.get()

  let documents = snapshot.size
  let subcollections = 0

  for (const documentSnapshot of snapshot.docs) {
    const nestedCollections =
      await documentSnapshot.ref.listCollections()

    subcollections += nestedCollections.length

    for (const nestedCollection of nestedCollections) {
      const nestedCount =
        await countCollectionTree(nestedCollection)

      documents += nestedCount.documents
      subcollections += nestedCount.subcollections
    }
  }

  return {
    documents,
    subcollections,
  }
}

async function copyCollectionTree({
  sourceCollection,
  destinationCollection,
  destinationDb,
  writer,
  dryRun,
  stats,
}) {
  const snapshot = await sourceCollection.get()

  for (const sourceDocument of snapshot.docs) {
    const destinationDocument =
      destinationCollection.doc(sourceDocument.id)

    const convertedData = convertValue(
      sourceDocument.data(),
      destinationDb
    )

    if (!dryRun) {
      /*
       * set senza merge sostituisce interamente l'eventuale documento
       * omonimo, ma non elimina documenti extra presenti nel progetto dev.
       */
      writer.set(destinationDocument, convertedData)
    }

    stats.documents += 1

    const subcollections =
      await sourceDocument.ref.listCollections()

    for (const sourceSubcollection of subcollections) {
      stats.subcollections += 1

      await copyCollectionTree({
        sourceCollection: sourceSubcollection,
        destinationCollection:
          destinationDocument.collection(
            sourceSubcollection.id
          ),
        destinationDb,
        writer,
        dryRun,
        stats,
      })
    }
  }
}

async function askForConfirmation({
  collections,
  dryRun,
}) {
  if (dryRun) {
    return true
  }

  const rl = readline.createInterface({
    input,
    output,
  })

  console.log('')
  console.log('ATTENZIONE')
  console.log(
    `Origine:      ${SOURCE_PROJECT_ID}`
  )
  console.log(
    `Destinazione: ${DESTINATION_PROJECT_ID}`
  )
  console.log(
    `Collection:   ${collections.join(', ')}`
  )
  console.log('')
  console.log(
    'I documenti con lo stesso ID nel progetto dev verranno sovrascritti.'
  )
  console.log(
    'Il database di produzione verrà solamente letto.'
  )
  console.log('')

  const answer = await rl.question(
    `Scrivi CLONA ${DESTINATION_PROJECT_ID} per continuare: `
  )

  rl.close()

  return answer.trim() ===
    `CLONA ${DESTINATION_PROJECT_ID}`
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  const requestedCollections = args
    .filter((argument) =>
      argument.startsWith('--collections=')
    )
    .flatMap((argument) =>
      argument
        .replace('--collections=', '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    )

  const collections = requestedCollections.length
    ? requestedCollections
    : DEFAULT_COLLECTIONS

  const sourceKeyPath =
    process.env.FIREBASE_SOURCE_CREDENTIALS

  const destinationKeyPath =
    process.env.FIREBASE_DESTINATION_CREDENTIALS

  if (!sourceKeyPath || !destinationKeyPath) {
    throw new Error(
      [
        'Credenziali mancanti.',
        'Imposta FIREBASE_SOURCE_CREDENTIALS e',
        'FIREBASE_DESTINATION_CREDENTIALS.',
      ].join(' ')
    )
  }

  const sourceServiceAccount =
    readServiceAccount(sourceKeyPath)

  const destinationServiceAccount =
    readServiceAccount(destinationKeyPath)

  if (
    sourceServiceAccount.project_id !==
    SOURCE_PROJECT_ID
  ) {
    throw new Error(
      `La chiave sorgente appartiene a ${sourceServiceAccount.project_id}, non a ${SOURCE_PROJECT_ID}.`
    )
  }

  if (
    destinationServiceAccount.project_id !==
    DESTINATION_PROJECT_ID
  ) {
    throw new Error(
      `La chiave destinazione appartiene a ${destinationServiceAccount.project_id}, non a ${DESTINATION_PROJECT_ID}.`
    )
  }

  if (SOURCE_PROJECT_ID === DESTINATION_PROJECT_ID) {
    throw new Error(
      'Origine e destinazione non possono coincidere.'
    )
  }

  const sourceApp = initializeApp(
    {
      credential: cert(sourceServiceAccount),
      projectId: SOURCE_PROJECT_ID,
    },
    'firestore-source'
  )

  const destinationApp = initializeApp(
    {
      credential: cert(destinationServiceAccount),
      projectId: DESTINATION_PROJECT_ID,
    },
    'firestore-destination'
  )

  const sourceDb = getFirestore(sourceApp)
  const destinationDb = getFirestore(destinationApp)

  console.log('')
  console.log(
    dryRun
      ? 'Modalità DRY RUN: nessun dato verrà scritto.'
      : 'Modalità CLONAZIONE.'
  )
  console.log(`Origine: ${SOURCE_PROJECT_ID}`)
  console.log(
    `Destinazione: ${DESTINATION_PROJECT_ID}`
  )
  console.log(`Collection: ${collections.join(', ')}`)
  console.log('')

  console.log('Analisi dei dati sorgente...')

  let expectedDocuments = 0

  for (const collectionName of collections) {
    const count = await countCollectionTree(
      sourceDb.collection(collectionName)
    )

    expectedDocuments += count.documents

    console.log(
      `- ${collectionName}: ${count.documents} documenti, ${count.subcollections} sottocollezioni`
    )
  }

  console.log(
    `Totale documenti da copiare: ${expectedDocuments}`
  )

  const confirmed = await askForConfirmation({
    collections,
    dryRun,
  })

  if (!confirmed) {
    console.log('Operazione annullata.')
    return
  }

  const writer = destinationDb.bulkWriter()

  writer.onWriteError((error) => {
    console.error(
      `Errore scrittura ${error.documentRef.path}:`,
      error.code,
      error.message
    )

    return error.failedAttempts < 3
  })

  const stats = {
    documents: 0,
    subcollections: 0,
  }

  for (const collectionName of collections) {
    console.log(
      `${dryRun ? 'Controllo' : 'Copia'} ${collectionName}...`
    )

    await copyCollectionTree({
      sourceCollection:
        sourceDb.collection(collectionName),
      destinationCollection:
        destinationDb.collection(collectionName),
      destinationDb,
      writer,
      dryRun,
      stats,
    })
  }

  if (!dryRun) {
    await writer.close()
  }

  console.log('')
  console.log(
    dryRun
      ? 'Dry run completato.'
      : 'Clonazione completata.'
  )
  console.log(
    `Documenti elaborati: ${stats.documents}`
  )
  console.log(
    `Sottocollezioni trovate: ${stats.subcollections}`
  )

  await deleteApp(sourceApp)
  await deleteApp(destinationApp)
}

main().catch((error) => {
  console.error('')
  console.error('Clonazione fallita:')
  console.error(error)
  process.exitCode = 1
})