import { invoke } from "@tauri-apps/api/core"
import { join } from "@tauri-apps/api/path"

import { getCache, setCache } from "./cache-db"
import { modKeybinds } from "../redux/keybind-actions-slice"

// Cache delle keybind estratte dai jar, per evitare di riscansionare a ogni
// accesso. Riusa la tabella key-value `manifest_cache` (cache-db). A differenza
// dei manifest NON c'è TTL: le keybind cambiano solo se cambia la cartella
// `mods`, quindi la cache si invalida solo con il refresh manuale (`force`).
// La chiave include la workpath così progetti diversi non si sovrascrivono.

function keyFor(workpath: string): string {
  return `keybinds:${workpath}`
}

/**
 * Ritorna le keybind delle mod, dalla cache SQLite se presente (e `force` è
 * false), altrimenti scansiona i jar (`scan_keybinds`) e aggiorna la cache.
 */
export async function getKeybindActionsCached(
  workpath: string,
  force = false
): Promise<modKeybinds[]> {
  const key = keyFor(workpath)
  if (!force) {
    const cached = await getCache<modKeybinds[]>(key)
    if (cached) return cached.data
  }
  const modsDir = await join(workpath, "mods")
  const mods = await invoke<modKeybinds[]>("scan_keybinds", { dir: modsDir })
  await setCache(key, mods)
  return mods
}

/**
 * Legge SOLO la cache (senza scansionare): usata al mount della pagina per
 * popolare i dati velocemente se già presenti. Ritorna null se assente.
 */
export async function peekKeybindActionsCache(workpath: string): Promise<modKeybinds[] | null> {
  const cached = await getCache<modKeybinds[]>(keyFor(workpath))
  return cached ? cached.data : null
}
