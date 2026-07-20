import { invoke } from "@tauri-apps/api/core"
import { join } from "@tauri-apps/api/path"

import { modKeybinds } from "../redux/keybind-actions-slice"
import { getModsScanCached, peekModsScanCache, scannedMod } from "./mods-scan"

// Le keybind NON hanno più una scansione/cache separata: derivano dalla
// scansione UNIFICATA dei mod (vedi mods-scan.ts), che apre ogni jar una sola
// volta e cacha metadati + keybind insieme in SQLite (`mods:<workpath>`). Qui
// esponiamo solo la vista "per mod" (`ModKeybinds[]`) attesa dallo slice Redux.

// Mappa la scansione unificata nella forma ModKeybinds[] (una entry per mod che
// definisce almeno una keybind).
function toModKeybinds(mods: scannedMod[]): modKeybinds[] {
  return mods
    .filter((m) => (m.keybinds?.length ?? 0) > 0)
    .map((m) => ({
      filename: m.filename,
      modId: m.modId,
      keybinds: m.keybinds ?? [],
    }))
}

/**
 * Keybind delle mod, dalla scansione unificata (cache SQLite se presente e
 * `force` è false, altrimenti riscansiona i jar).
 */
export async function getKeybindActionsCached(
  workpath: string,
  force = false
): Promise<modKeybinds[]> {
  return toModKeybinds(await getModsScanCached(workpath, force))
}

/**
 * Legge SOLO la cache unificata (senza scansionare): usata al mount per popolare
 * i dati velocemente se già presenti. Ritorna null se assente.
 */
export async function peekKeybindActionsCache(workpath: string): Promise<modKeybinds[] | null> {
  const cached = await peekModsScanCache(workpath)
  return cached ? toModKeybinds(cached) : null
}

// Rispecchia la struct `ResolvedKeybind` ritornata da Rust.
export interface resolvedKeybind {
  key: string
  label: string
  modId: string
}

/**
 * Risoluzione MIRATA (comando `resolve_keybind_labels`): date delle chiavi di
 * traduzione esatte (es. gli actionKey di un keybindprofiles.json), cerca per
 * match esatto nei jar la label e il modId proprietario. A differenza dello scan
 * generico trova anche le keybind con nomi non standard (config.jsg.*,
 * placebo.toggle*) senza falsi positivi. Le chiavi non trovate vengono omesse.
 */
export async function resolveKeybindLabels(
  workpath: string,
  keys: string[]
): Promise<resolvedKeybind[]> {
  if (keys.length === 0) return []
  const modsDir = await join(workpath, "mods")
  return invoke<resolvedKeybind[]>("resolve_keybind_labels", { dir: modsDir, keys })
}
