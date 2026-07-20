import { join } from "@tauri-apps/api/path"

import { KeybindExporter, ExportContext, ExportResult } from "./types"
import { keybindMap, macroModifier } from "../../model/models"
import { toMinecraftInput, UNMAPPED } from "../mc-keycodes"

// Modificatore interno → token del campo `modifiers` di Keyset (SHIFT/CTRL/ALT).
const MODIFIER_TOKEN: Record<macroModifier, string> = {
  ctrl: "CTRL",
  shift: "SHIFT",
  alt: "ALT",
}

// Exporter per la mod Keyset (BeeBoyD/Keyset).
//
// Formato: un UNICO file JSON `config/keybindprofiles.json` che contiene TUTTI i
// profili. Struttura (schema corrente = 1):
//   {
//     "schema": 1,
//     "activeProfile": "<id profilo>" | null,
//     "profiles": {
//       "<id>": {
//         "name": "<nome>",
//         "builtIn": false,
//         "bindings": {
//           "<actionKey>": { "key": "<inputCode>", "modifiers": [], "sticky": true }
//         }
//       }
//     }
//   }
// - la CHIAVE di ogni binding è la translation key dell'AZIONE (`key.*`, il nostro
//   `keybind.actionKey`); `key` è il tasto premuto (`key.keyboard.*`/`key.mouse.*`,
//   il nostro `toMinecraftInput`). `key` viene OMESSO se il tasto è "unbound".
// - `modifiers` è sempre presente (SHIFT/CTRL/ALT); noi non modelliamo i
//   modificatori quindi resta `[]`.
// - `sticky:true` marca i bind come personalizzati dall'utente: tutti i nostri
//   bind provengono dalla config del modpack, quindi li marchiamo sticky.
//
// Poiché il file è multi-profilo, l'export fa MERGE conservativo: preserva i
// profili non gestiti (es. "default" della mod) e sovrascrive per id quelli che
// ri-generiamo.

const CONFIG_SCHEMA = 1
// Path relativo alla workpath (config/keybindprofiles.json).
const REL_DIR = "config"
const FILE_NAME = "keybindprofiles.json"

// --- Tipi del file su disco (parziali/difensivi: la mod normalizza in lettura) ---
type KeysetKeyStroke = {
  key?: string
  modifiers: string[]
  sticky?: boolean
}
type KeysetProfile = {
  name: string
  builtIn: boolean
  bindings: Record<string, KeysetKeyStroke>
}
type KeysetFile = {
  schema: number
  activeProfile: string | null
  profiles: Record<string, KeysetProfile>
}

// Contatori dei problemi riscontrati costruendo i binding.
type BuildStats = {
  skippedNoKey: number
  unmapped: number
  collisions: number
  written: number
}

const newStats = (): BuildStats => ({ skippedNoKey: 0, unmapped: 0, collisions: 0, written: 0 })

// Slug stabile per l'id del profilo (chiave nella mappa `profiles`).
function toProfileId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return slug || "profile"
}

// id univoco a partire da uno slug base, evitando collisioni con `used`.
function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base
  let i = 2
  while (used.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

// Costruisce i binding di un profilo da una keybindMap, ordinati per chiave
// azione (come fa la mod, che usa un TreeMap). L'ultimo bind su una stessa
// azione vince; i bind senza `actionKey` vengono saltati (non hanno chiave).
// Le MACRO (modificatore + tasto) sono scritte dopo i keybind: se condividono
// l'actionKey con un keybind, la macro (più specifica) prevale.
function buildBindings(map: keybindMap, stats: BuildStats): Record<string, KeysetKeyStroke> {
  const byAction = new Map<string, KeysetKeyStroke>()
  for (const kb of map.keybinds) {
    const action = kb.actionKey?.trim()
    if (!action) {
      stats.skippedNoKey++
      continue
    }
    const code = toMinecraftInput(kb.key)
    if (code === UNMAPPED) stats.unmapped++
    if (byAction.has(action)) stats.collisions++
    byAction.set(action, { key: code, modifiers: [], sticky: true })
  }
  for (const mc of map.macros ?? []) {
    const action = mc.actionKey?.trim()
    if (!action) {
      stats.skippedNoKey++
      continue
    }
    const code = toMinecraftInput(mc.key)
    if (code === UNMAPPED) stats.unmapped++
    if (byAction.has(action)) stats.collisions++
    byAction.set(action, { key: code, modifiers: [MODIFIER_TOKEN[mc.modifier]], sticky: true })
  }
  stats.written += byAction.size
  const sorted: Record<string, KeysetKeyStroke> = {}
  for (const action of [...byAction.keys()].sort()) sorted[action] = byAction.get(action)!
  return sorted
}

// Parsa il file esistente in modo difensivo; ritorna un file vuoto se assente o
// non valido (in tal caso aggiunge un warning e il file verrà rimpiazzato).
function parseExisting(raw: string | null, warnings: string[]): KeysetFile {
  const empty: KeysetFile = { schema: CONFIG_SCHEMA, activeProfile: null, profiles: {} }
  if (!raw) return empty
  try {
    const obj = JSON.parse(raw) as Partial<KeysetFile>
    return {
      schema: CONFIG_SCHEMA, // normalizziamo sempre allo schema corrente
      activeProfile: typeof obj.activeProfile === "string" ? obj.activeProfile : null,
      profiles:
        obj.profiles && typeof obj.profiles === "object"
          ? (obj.profiles as Record<string, KeysetProfile>)
          : {},
    }
  } catch {
    warnings.push("Existing keybindprofiles.json is not valid JSON and was replaced.")
    return empty
  }
}

function warningsFromStats(stats: BuildStats, warnings: string[]): void {
  if (stats.skippedNoKey)
    warnings.push(`${stats.skippedNoKey} keybind without a translation key were skipped.`)
  if (stats.unmapped)
    warnings.push(`${stats.unmapped} key(s) could not be mapped and were written as 'unknown'.`)
  if (stats.collisions)
    warnings.push(`${stats.collisions} action(s) bound to multiple keys: only the last was kept.`)
}

// Serializza come JSON indentato a 2 spazi (come il pretty-print di GSON usato
// dalla mod) con newline finale.
const serialize = (file: KeysetFile): string => JSON.stringify(file, null, 2) + "\n"

export const keysetExporter: KeybindExporter = {
  id: "keyset",
  label: "Keyset mod (keybindprofiles.json)",
  defaultFileName: FILE_NAME,
  available: true,

  // Esporta una singola mappa come profilo, con MERGE nel file esistente
  // (preserva gli altri profili, incluso il "default" della mod).
  async build(map: keybindMap, ctx: ExportContext): Promise<ExportResult> {
    const warnings: string[] = []
    const stats = newStats()

    const suggestedPath = await join(ctx.workpath, REL_DIR, FILE_NAME)
    const file = parseExisting(await ctx.readExisting(suggestedPath), warnings)

    const id = toProfileId(map.name)
    file.profiles[id] = {
      name: map.name || id,
      builtIn: false,
      bindings: buildBindings(map, stats),
    }
    // Rendi attivo il profilo appena esportato se non c'è un active valido.
    if (!file.activeProfile || !(file.activeProfile in file.profiles)) file.activeProfile = id

    warningsFromStats(stats, warnings)
    return { content: serialize(file), suggestedPath, warnings, writtenLines: stats.written }
  },

  // Esporta TUTTE le mappe come profili, con MERGE nel file esistente. I profili
  // ri-generati sovrascrivono per id quelli omonimi già presenti; i profili non
  // gestiti (es. "default") restano intatti.
  async buildAll(maps: keybindMap[], ctx: ExportContext): Promise<ExportResult> {
    const warnings: string[] = []
    const stats = newStats()

    const suggestedPath = await join(ctx.workpath, REL_DIR, FILE_NAME)
    const file = parseExisting(await ctx.readExisting(suggestedPath), warnings)

    // Dedup solo tra le mappe di questo batch (nomi che generano lo stesso slug):
    // così due mappe distinte non si sovrascrivono a vicenda.
    const usedInBatch = new Set<string>()
    let firstId: string | null = null
    for (const map of maps) {
      const id = uniqueId(toProfileId(map.name), usedInBatch)
      usedInBatch.add(id)
      if (!firstId) firstId = id
      file.profiles[id] = {
        name: map.name || id,
        builtIn: false,
        bindings: buildBindings(map, stats),
      }
    }
    if ((!file.activeProfile || !(file.activeProfile in file.profiles)) && firstId)
      file.activeProfile = firstId

    warningsFromStats(stats, warnings)
    return { content: serialize(file), suggestedPath, warnings, writtenLines: stats.written }
  },
}
