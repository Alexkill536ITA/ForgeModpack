import { invoke } from "@tauri-apps/api/core"

import { getCache, setCache } from "./cache-db"

// Scansione dei datapack. Il comando Rust `scan_datapacks` legge una cartella e
// per ogni .zip/cartella con `pack.mcmeta` estrae nome, descrizione e
// pack_format. Il risultato è cachato in SQLite `datapacks:<dir>` (nessun TTL:
// si invalida solo col refresh manuale, come la scansione mod).

// Rispecchia la struct `ScannedDatapack` ritornata dal comando Rust.
export interface scannedDatapack {
  filename: string
  name: string
  description: string | null
  packFormat: number | null
}

function keyFor(dir: string): string {
  return `datapacks:v1:${dir}`
}

/**
 * Ritorna la scansione dei datapack della cartella `dir`, dalla cache SQLite se
 * presente (e `force` è false), altrimenti invoca `scan_datapacks` e aggiorna la
 * cache.
 */
export async function getDatapacksScanCached(
  dir: string,
  force = false
): Promise<scannedDatapack[]> {
  const key = keyFor(dir)
  if (!force) {
    const cached = await getCache<scannedDatapack[]>(key)
    if (cached) return cached.data
  }
  const scanned = await invoke<scannedDatapack[]>("scan_datapacks", { dir })
  await setCache(key, scanned)
  return scanned
}

/** Legge SOLO la cache (senza scansionare). Ritorna null se assente. */
export async function peekDatapacksScanCache(dir: string): Promise<scannedDatapack[] | null> {
  const cached = await getCache<scannedDatapack[]>(keyFor(dir))
  return cached ? cached.data : null
}
