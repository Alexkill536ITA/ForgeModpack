import { invoke } from "@tauri-apps/api/core"
import { join } from "@tauri-apps/api/path"

import { getCache, setCache } from "./cache-db"
import { scanHint } from "./forge-spec"

// Scansione UNIFICATA dei mod. Il comando Rust `scan_mods` apre ogni .jar una
// sola volta e restituisce metadati + provides + keybind. Il risultato completo
// è cachato in un'unica entry SQLite `mods:<hint>:<workpath>` (nessun TTL: si
// invalida solo con il refresh manuale, come le keybind). È l'UNICO punto dati da
// cui derivano sia la pagina List Mods (metadati) sia la pagina Keybinds/Import
// (keybind per mod). La cartella `mods` cambia raramente, quindi la cache evita
// di riaprire tutti i jar a ogni navigazione.
//
// L'hint di versione (vedi [`forge-spec.ts`](./forge-spec.ts)) fa parte della
// chiave: cambiare versione di Minecraft cambia il formato di metadati/lang
// atteso, quindi la scansione va rifatta.

export interface scannedKeybind {
  key: string
  label: string
  // Come è stata riconosciuta (vedi `keybind_scan.rs`):
  //  - "bytecode": la chiave è dichiarata da una classe che usa l'API keybind di
  //    Forge/NeoForge (`KeyBinding`/`KeyMapping`) → keybind CERTA;
  //  - "lang": la chiave "sembra" una keybind dal nome → probabile.
  // Assente nelle cache scritte prima dello scan del bytecode.
  source?: "bytecode" | "lang"
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
  // Formato di metadati rilevato nel jar: "forge:mods.toml", "forge:mcmod.info",
  // "neoforge:mods.toml", "fabric:fabric.mod.json", "quilt:quilt.mod.json",
  // "unknown:manifest", "unknown", "unreadable". Assente nelle cache vecchie.
  format?: string
  // Problemi riscontrati leggendo il jar (in inglese, come i warning di export).
  warnings?: string[]
}

// La versione (`v4`) invalida le cache scritte prima del riconoscimento keybind
// dal bytecode (campo `source`, chiavi non standard, meno falsi positivi) e prima
// del fix di decodifica dei lang non-UTF8. `v3` era il supporto ai formati legacy
// Forge (mcmod.info / en_US.lang) e ai campi `format`/`warnings`.
function keyFor(workpath: string, hint?: scanHint): string {
  return `mods:v4:${hint?.mc ?? ""}:${hint?.forge ?? ""}:${workpath}`
}

/**
 * Ritorna la scansione completa dei mod (metadati + keybind), dalla cache SQLite
 * se presente (e `force` è false), altrimenti apre i jar (`scan_mods`) e aggiorna
 * la cache. `hint` seleziona il profilo di formato atteso lato Rust.
 */
export async function getModsScanCached(
  workpath: string,
  force = false,
  hint?: scanHint
): Promise<scannedMod[]> {
  const key = keyFor(workpath, hint)
  if (!force) {
    const cached = await getCache<scannedMod[]>(key)
    if (cached) return cached.data
  }
  const modsDir = await join(workpath, "mods")
  const scanned = await invoke<scannedMod[]>("scan_mods", {
    dir: modsDir,
    mc: hint?.mc,
    forge: hint?.forge,
  })
  await setCache(key, scanned)
  return scanned
}

/**
 * Legge SOLO la cache (senza scansionare): per popolare velocemente i dati al
 * mount se già presenti. Ritorna null se assente.
 */
export async function peekModsScanCache(
  workpath: string,
  hint?: scanHint
): Promise<scannedMod[] | null> {
  const cached = await getCache<scannedMod[]>(keyFor(workpath, hint))
  return cached ? cached.data : null
}
