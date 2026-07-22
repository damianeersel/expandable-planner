// Lokale bestandsopslag voor bijlagen: de echte bestandsinhoud gaat naar IndexedDB
// (nooit als base64 in localStorage); alleen de metadata (BestandMeta) staat in de store.

const DB_NAAM = 'expandable-planner-bestanden'
const STORE = 'blobs'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const verzoek = indexedDB.open(DB_NAAM, 1)
    verzoek.onupgradeneeded = () => {
      if (!verzoek.result.objectStoreNames.contains(STORE)) verzoek.result.createObjectStore(STORE)
    }
    verzoek.onsuccess = () => resolve(verzoek.result)
    verzoek.onerror = () => reject(verzoek.error)
  })
}

/** Slaat de bestandsinhoud op onder de meta-id. Retourneert false wanneer opslag niet lukt. */
export async function slaBestandOp(id: string, bestand: Blob): Promise<boolean> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(bestand, id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
    return true
  } catch {
    return false
  }
}

export async function haalBestandOp(id: string): Promise<Blob | undefined> {
  try {
    const db = await openDb()
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const v = tx.objectStore(STORE).get(id)
      v.onsuccess = () => resolve(v.result as Blob | undefined)
      v.onerror = () => reject(v.error)
    })
    db.close()
    return blob
  } catch {
    return undefined
  }
}

export async function verwijderBestand(id: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // metadata wordt apart opgeruimd; een wees-blob is onschadelijk
  }
}

/** Opent het bestand in een nieuw tabblad (bekijken). */
export async function bekijkBestand(id: string, naam: string): Promise<boolean> {
  const blob = await haalBestandOp(id)
  if (!blob) return false
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}

/** Downloadt het bestand onder zijn oorspronkelijke naam. */
export async function downloadBestand(id: string, naam: string): Promise<boolean> {
  const blob = await haalBestandOp(id)
  if (!blob) return false
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = naam
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}

/** '2,4 MB' / '312 kB' */
export function formatGrootte(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`
  return `${bytes} B`
}

/** Korte typeaanduiding voor de UI op basis van MIME-type/bestandsnaam. */
export function bestandsTypeLabel(mime: string, naam: string): string {
  const ext = naam.split('.').pop()?.toLowerCase() ?? ''
  if (mime.includes('pdf') || ext === 'pdf') return 'PDF'
  if (mime.includes('word') || ['doc', 'docx'].includes(ext)) return 'Word'
  if (mime.includes('sheet') || mime.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext)) return 'Excel'
  if (mime.startsWith('image/')) return 'Afbeelding'
  if (['dwg', 'dxf', 'step', 'stp', 'iges'].includes(ext)) return 'Technische tekening'
  return 'Bestand'
}
