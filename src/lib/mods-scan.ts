import { invoke } from "@tauri-apps/api/core"
import { join } from "@tauri-apps/api/path"

import { getCache, setCache } from "./cache-db"

// Scansione UNIFICATA dei mod. Il comando Rust `scan_mods` apre ogni .jar una
// sola volta e restituisce metadati + provides + keybind. Il risultato completo
// è cachato in un'unica entry SQLite `mods:<workpath>` (nessun TTL: si invalida
// solo con il refresh manuale, come le keybind). È l'UNICO punto dati da cui
// derivano sia la pagina List Mods (metadati) sia la pagina Keybinds/Import
// (keybind per mod). La cartella `mods` cambia raramente, quindi la cache evita
// di riaprire tutti i jar a ogni navigazione.

export interface scannedKeybind {
  key: string
  label: string
}

// Rispecchia la struct `ScannedMod` ritornata dal comando Rust `scan_mods`.
export interface scannedMod {
  filename: string
  modId: string
  name: string
  modloader: string
  version: string
  description: string | null
  authors: string[]
  dependencies: { name: string; version: string; mandatory: boolean }[]
  provides: string[]
  keybinds: scannedKeybind[]
}

// La versione (`v2`) invalida le cache scritte prima che lo scan includesse i
// keybind e i JarJar annidati: bumpandola si forza una riscansione pulita.
function keyFor(workpath: string): string {
  return `mods:v2:${workpath}`
}

/**
 * Ritorna la scansione completa dei mod (metadati + keybind), dalla cache SQLite
 * se presente (e `force` è false), altrimenti apre i jar (`scan_mods`) e aggiorna
 * la cache.
 */
export async function getModsScanCached(
  workpath: string,
  force = false
): Promise<scannedMod[]> {
  const key = keyFor(workpath)
  if (!force) {
    const cached = await getCache<scannedMod[]>(key)
    if (cached) return cached.data
  }
  const modsDir = await join(workpath, "mods")
  const scanned = await invoke<scannedMod[]>("scan_mods", { dir: modsDir })
  await setCache(key, scanned)
  return scanned
}

/**
 * Legge SOLO la cache (senza scansionare): per popolare velocemente i dati al
 * mount se già presenti. Ritorna null se assente.
 */
export async function peekModsScanCache(workpath: string): Promise<scannedMod[] | null> {
  const cached = await getCache<scannedMod[]>(keyFor(workpath))
  return cached ? cached.data : null
}
