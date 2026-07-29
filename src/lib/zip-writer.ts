// Scrittura di archivi ZIP, in TypeScript puro (nessuna dipendenza).
//
// Perché non una libreria: serve solo impacchettare file già compressi (i PNG
// dell'export della tastiera), quindi basta il metodo **STORE** (nessuna
// compressione) e il formato ZIP si riduce a tre strutture. Comprimere un PNG con
// deflate guadagna pochi punti percentuali, non vale una dipendenza in più né il
// passaggio dei byte al backend Rust.
//
// Funzione PURA e DETERMINISTICA: nessun I/O e nessun orologio — il timestamp
// delle voci è fisso, così esportare due volte la stessa mappa dà un file
// identico (utile per confronti e diff). La scrittura su disco resta alla UI,
// come per gli altri exporter.
//
// Limiti dichiarati: nessun supporto ZIP64, quindi vale fino a 4 GB per voce e
// 65535 voci — ordini di grandezza sopra un export di immagini.

/** Voce dell'archivio: `name` può contenere `/` per creare cartelle. */
export interface zipEntry {
  name: string
  data: Uint8Array
}

// Tabella CRC-32 (polinomio 0xEDB88320), calcolata una volta sola.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// Data/ora in formato DOS, fissa (2020-01-01 00:00): vedi nota sul determinismo.
const DOS_TIME = 0
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1

// Flag "nomi in UTF-8" (bit 11): senza questo i nomi con accenti o simboli
// vengono letti male da Explorer, e i nomi delle mappe sono scelti dall'utente.
const FLAG_UTF8 = 0x0800
const METHOD_STORE = 0

class ByteWriter {
  private parts: Uint8Array[] = []
  private len = 0

  bytes(b: Uint8Array): void {
    this.parts.push(b)
    this.len += b.length
  }
  u16(v: number): void {
    this.bytes(new Uint8Array([v & 0xff, (v >>> 8) & 0xff]))
  }
  u32(v: number): void {
    this.bytes(new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]))
  }
  get offset(): number {
    return this.len
  }
  concat(): Uint8Array {
    const out = new Uint8Array(this.len)
    let at = 0
    for (const p of this.parts) {
      out.set(p, at)
      at += p.length
    }
    return out
  }
}

/**
 * Costruisce l'archivio ZIP con le voci date, nell'ordine ricevuto.
 *
 * Le cartelle NON hanno una voce propria: un nome come `Mappa/livello-1.png` è
 * sufficiente a farle comparire in Explorer e in qualsiasi estrattore.
 */
export function buildZip(entries: zipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const out = new ByteWriter()
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = []

  for (const entry of entries) {
    // Separatori sempre `/` (lo ZIP non conosce il backslash di Windows).
    const name = encoder.encode(entry.name.replace(/\\/g, "/"))
    const crc = crc32(entry.data)
    const offset = out.offset

    // --- Local file header ---
    out.u32(0x04034b50)
    out.u16(20) // versione necessaria per estrarre
    out.u16(FLAG_UTF8)
    out.u16(METHOD_STORE)
    out.u16(DOS_TIME)
    out.u16(DOS_DATE)
    out.u32(crc)
    out.u32(entry.data.length) // dimensione compressa = originale (STORE)
    out.u32(entry.data.length)
    out.u16(name.length)
    out.u16(0) // extra field
    out.bytes(name)
    out.bytes(entry.data)

    central.push({ name, crc, size: entry.data.length, offset })
  }

  // --- Central directory ---
  const cdOffset = out.offset
  for (const e of central) {
    out.u32(0x02014b50)
    out.u16(20) // versione di chi ha creato l'archivio
    out.u16(20) // versione necessaria
    out.u16(FLAG_UTF8)
    out.u16(METHOD_STORE)
    out.u16(DOS_TIME)
    out.u16(DOS_DATE)
    out.u32(e.crc)
    out.u32(e.size)
    out.u32(e.size)
    out.u16(e.name.length)
    out.u16(0) // extra
    out.u16(0) // commento
    out.u16(0) // disco
    out.u16(0) // attributi interni
    out.u32(0) // attributi esterni
    out.u32(e.offset)
    out.bytes(e.name)
  }
  const cdSize = out.offset - cdOffset

  // --- End of central directory ---
  out.u32(0x06054b50)
  out.u16(0) // numero del disco
  out.u16(0) // disco della central directory
  out.u16(central.length)
  out.u16(central.length)
  out.u32(cdSize)
  out.u32(cdOffset)
  out.u16(0) // lunghezza commento

  return out.concat()
}
