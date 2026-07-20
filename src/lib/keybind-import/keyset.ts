import { KeybindImporter, ImportContext, ImportResult, ImportedMap, ImportIssue } from "./types"
import { keybind, keybindCategory, macro, macroModifier } from "../../model/models"
import { fromMinecraftInput } from "../mc-keycodes"
import { vanillaActions } from "../keybind-template"

// Riconosce il modificatore (SHIFT/CTRL/ALT, case-insensitive) di uno stroke
// Keyset: ritorna il PRIMO riconosciuto, o null se assente/non gestito. Supporta
// un solo modificatore per macro (gli altri, se presenti, sono ignorati).
function parseModifier(tokens: string[] | undefined): macroModifier | null {
  for (const t of tokens ?? []) {
    const s = t.trim().toUpperCase()
    if (s === "CTRL" || s === "CONTROL") return "ctrl"
    if (s === "SHIFT") return "shift"
    if (s === "ALT") return "alt"
  }
  return null
}

// Importer per la mod Keyset (BeeBoyD/Keyset): legge `config/keybindprofiles.json`
// e ricostruisce le keybindMap interne. Vedi keybind-export/keyset.ts per il
// formato del file.
//
// "Ricollegamento" dei dati (il cuore dell'import): ogni binding nel file è
// mappato per translation key dell'AZIONE (`actionKey`, key.*) → tasto premuto
// (`key`, key.keyboard.*/key.mouse.*). Per ogni binding ricostruiamo:
//  - `key`      = tasto fisico del layout, invertendo toMinecraftInput
//  - `actionKey`= la chiave nel file (invariata)
//  - `action`   = label leggibile, risolta dalle azioni scansionate della mod
//                 (o vanilla, o derivata dalla chiave)
//  - `category` = la mod proprietaria (nome), dedotta dalle azioni scansionate,
//                 poi vanilla, poi confrontando i segmenti della chiave con i
//                 modId installati, infine il primo segmento non generico.

// Massimo binding per tasto (coerente con la UI della pagina keybinds).
const MAX_BINDINGS = 4
const REL_PATH = ["config", "keybindprofiles.json"]
const VANILLA_CATEGORY = "Vanilla"

// Palette per le categorie create in import (stessa della pagina keybinds).
const PALETTE = [
  "#417505", "#8c582a", "#1a6fa8", "#0e7a5c", "#e67e00", "#8b0000",
  "#c8a200", "#f39c12", "#9012ff", "#4eccc4", "#7c3aed", "#1d4ed8",
  "#be185d", "#0891b2", "#d97706",
]

// --- Tipi del file su disco (parziali/difensivi) ---
type RawStroke = { key?: string; modifiers?: string[]; sticky?: boolean }
type RawProfile = { name?: string; builtIn?: boolean; bindings?: Record<string, RawStroke> }
type RawFile = { schema?: number; activeProfile?: string | null; profiles?: Record<string, RawProfile> }

// Etichetta leggibile di fallback dall'actionKey ("key.jei.toggleOverlay" →
// "Toggle Overlay"), quando non abbiamo una label reale.
function prettify(actionKey: string): string {
  const seg = actionKey.split(".").pop() ?? actionKey
  return seg
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase())
}

// Determina la mod proprietaria + label di un actionKey (il "collegamento").
// Ritorna null quando il binding NON è legato a nessuna mod installata (e non è
// vanilla): in tal caso va SCARTATO dall'import.
function resolveOwner(
  actionKey: string,
  ctx: ImportContext,
  modByModId: Map<string, { modId: string; name: string }>
): { category: string; label: string } | null {
  const segments = actionKey.split(".")
  // 0) risoluzione mirata per chiave esatta (comando Rust): trovata in un jar
  //    INSTALLATO → mod presente. Copre anche i nomi non standard (config.jsg.*).
  const direct = ctx.resolvedByKey?.[actionKey]
  if (direct) {
    const m = modByModId.get(direct.modId)
    return { category: m?.name ?? direct.modId, label: direct.label || prettify(actionKey) }
  }
  // 1) match esatto tra le azioni scansionate dei jar installati (mod + label reale)
  for (const [modId, actions] of Object.entries(ctx.actionsByModId)) {
    const found = actions.find((a) => a.key === actionKey)
    if (found) {
      const m = modByModId.get(modId)
      return { category: m?.name ?? modId, label: found.label || prettify(actionKey) }
    }
  }
  // 2) azione vanilla (sempre mantenuta, categoria "Vanilla")
  const v = vanillaActions().find((a) => a.actionKey === actionKey)
  if (v) return { category: VANILLA_CATEGORY, label: v.label }
  // 3) un segmento della chiave corrisponde a una mod INSTALLATA. Il modId può
  //    stare in posizioni diverse a seconda del formato della mod ("key.jei.x",
  //    "create.keyinfo.x", "mod.chiselsandbits.keys.x"), quindi li proviamo tutti.
  for (const seg of segments) {
    const m = modByModId.get(seg)
    if (m) return { category: m.name, label: prettify(actionKey) }
  }
  // 4) nessun legame con una mod installata → scarta.
  return null
}

function parseKeyset(content: string, ctx: ImportContext): ImportResult {
  let file: RawFile
  try {
    file = JSON.parse(content) as RawFile
  } catch {
    throw new Error("keybindprofiles.json is not valid JSON.")
  }

  const profiles =
    file.profiles && typeof file.profiles === "object" ? file.profiles : {}
  // Mod installate (dallo scan): fonte di verità per "esiste nel mod list".
  const modByModId = new Map(ctx.installedMods.map((m) => [m.modId, m]))

  const maps: ImportedMap[] = []
  const usedCategories = new Set<string>()
  const issues: ImportIssue[] = []
  let bindingCount = 0

  for (const [id, prof] of Object.entries(profiles)) {
    const name = prof?.name?.trim() || id
    const bindings =
      prof?.bindings && typeof prof.bindings === "object" ? prof.bindings : {}

    const perKey = new Map<string, number>()
    const keybinds: keybind[] = []
    const macros: macro[] = []
    for (const [actionKey, stroke] of Object.entries(bindings)) {
      const code = stroke?.key ?? null
      if (!code) continue // binding senza tasto: ignorato in silenzio (non è un problema)
      const keyId = fromMinecraftInput(code)
      if (!keyId) {
        issues.push({ map: name, actionKey, keyCode: code, reason: "unmapped" })
        continue
      }
      const owner = resolveOwner(actionKey, ctx, modByModId)
      if (!owner) {
        // Mod non installata (né vanilla): scartato dall'import.
        issues.push({ map: name, actionKey, keyCode: code, reason: "not-installed" })
        continue
      }
      const { category, label } = owner
      const modifier = parseModifier(stroke?.modifiers)
      if (modifier) {
        // Stroke con modificatore → macro (nessun limite per-tasto: sono combo).
        usedCategories.add(category)
        macros.push({ modifier, key: keyId, action: label, actionKey, category })
        bindingCount++
        continue
      }
      const count = perKey.get(keyId) ?? 0
      if (count >= MAX_BINDINGS) {
        issues.push({ map: name, actionKey, keyCode: code, reason: "overflow" })
        continue
      }
      usedCategories.add(category)
      keybinds.push({ key: keyId, action: label, actionKey, category })
      perKey.set(keyId, count + 1)
      bindingCount++
    }
    maps.push({ name, keybinds, macros })
  }

  // Categorie (mod) da aggiungere al project, con un colore dalla palette.
  const existing = new Set(ctx.project.keybindCategories.map((c) => c.name))
  const usedColors = new Set(ctx.project.keybindCategories.map((c) => c.color))
  let colorCursor = ctx.project.keybindCategories.length
  const nextColor = (): string => {
    for (let i = 0; i < PALETTE.length; i++) {
      const c = PALETTE[(colorCursor + i) % PALETTE.length]
      if (!usedColors.has(c)) {
        usedColors.add(c)
        colorCursor += i + 1
        return c
      }
    }
    return PALETTE[colorCursor++ % PALETTE.length]
  }
  const newCategories: keybindCategory[] = [...usedCategories]
    .filter((n) => !existing.has(n))
    .map((name) => ({ name, color: nextColor(), tags: [] }))

  return {
    maps,
    newCategories,
    report: {
      maps: maps.length,
      bindings: bindingCount,
      issues,
    },
  }
}

export const keysetImporter: KeybindImporter = {
  id: "keyset",
  label: "Keyset mod (keybindprofiles.json)",
  defaultFileName: "keybindprofiles.json",
  available: true,
  relativePath: REL_PATH,
  parse: parseKeyset,
}
