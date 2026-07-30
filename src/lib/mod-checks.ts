// Controlli diagnostici della tabella mod (dipendenze mancanti, compatibilità
// con la versione MC del progetto, avvisi di scansione) e loro CORREZIONE
// MANUALE (`mod.checks`, vedi `checkFix` in models.ts).
//
// Regola comune a tutti e tre: un problema marcato falso positivo (o risolto da
// una correzione a mano) esce dai conteggi e dai filtri della pagina, ma NON
// scompare dai dati — il dialog di correzione deve poterlo rimostrare, altrimenti
// una correzione sbagliata non si potrebbe più togliere. Da qui la coppia di
// funzioni per ogni controllo: una che elenca *tutto* (per il dialog) e una che
// tiene solo ciò che è ancora un problema (per la tabella).
//
// Funzioni pure: nessun accesso a Redux/Tauri.

import { checkFix, mod, modChecks } from "../model/models"

// modId "ambiente" forniti dal loader/runtime: sempre soddisfatti, non sono mod.
export const RUNTIME_DEPS = new Set([
  "minecraft",
  "java",
  "forge",
  "neoforge",
  "fabricloader",
  "fabric",
  "quilt_loader",
  "quilt_base",
])

// --- Dipendenze -------------------------------------------------------------

/** Una dipendenza obbligatoria della mod, con l'esito del controllo. */
export interface dependencyIssue {
  /** modId dichiarato dalla mod: è la CHIAVE della correzione. */
  name: string
  /** modId realmente verificato: quello corretto a mano, se c'è. */
  lookup: string
  /** `lookup` è fra i modId forniti dalle mod attive. */
  installed: boolean
  fix?: checkFix
}

/**
 * Dipendenze obbligatorie da mostrare nel dialog: quelle NON soddisfatte più
 * quelle che hanno già una correzione registrata (che va restare visibile anche
 * quando la correzione ha risolto il problema). Le dipendenze verso
 * loader/runtime sono ignorate: non sono mod.
 */
export function dependencyIssues(target: mod, installedIds: Set<string>): dependencyIssue[] {
  const fixes = target.checks?.dependencies ?? {}
  const issues: dependencyIssue[] = []
  for (const dep of target.dependencies ?? []) {
    if (!dep.mandatory) continue
    const name = dep.name
    if (RUNTIME_DEPS.has(name.toLowerCase())) continue
    const fix = fixes[name]
    const corrected = fix?.value?.trim()
    const lookup = corrected || name
    const installed = installedIds.has(lookup.toLowerCase())
    if (installed && !fix) continue // tutto a posto e nulla da rimostrare
    issues.push({ name, lookup, installed, fix })
  }
  return issues
}

/**
 * modId da segnalare in tabella: le dipendenze ancora mancanti dopo le
 * correzioni, escluse quelle marcate falso positivo. Si mostra il modId
 * verificato (`lookup`), così una correzione sbagliata è visibile.
 */
export function missingDependencies(target: mod, installedIds: Set<string>): string[] {
  return dependencyIssues(target, installedIds)
    .filter((d) => !d.installed && !d.fix?.falsePositive)
    .map((d) => d.lookup)
}

/** Quante dipendenze mancanti sono state messe a posto a mano (falso positivo o modId corretto). */
export function fixedDependencies(target: mod, installedIds: Set<string>): dependencyIssue[] {
  return dependencyIssues(target, installedIds).filter(
    (d) => d.fix && (d.fix.falsePositive || d.installed)
  )
}

// --- Avvisi di scansione ----------------------------------------------------

/** Un avviso della scansione, con la sua eventuale correzione. */
export interface warningIssue {
  /** Testo dell'avviso (in inglese, da Rust): è la CHIAVE della correzione. */
  text: string
  fix?: checkFix
}

/** Tutti gli avvisi del jar con la correzione associata (per il dialog). */
export function warningIssues(target: mod, warnings: string[]): warningIssue[] {
  const fixes = target.checks?.warnings ?? {}
  return warnings.map((text) => ({ text, fix: fixes[text] }))
}

/** Avvisi ancora validi: quelli non marcati falso positivo (per tabella e conteggi). */
export function activeWarnings(target: mod, warnings: string[]): string[] {
  const fixes = target.checks?.warnings ?? {}
  return warnings.filter((w) => !fixes[w]?.falsePositive)
}

/** Avvisi silenziati a mano (per il marcatore in tabella). */
export function dismissedWarnings(target: mod, warnings: string[]): string[] {
  const fixes = target.checks?.warnings ?? {}
  return warnings.filter((w) => !!fixes[w]?.falsePositive)
}

// --- Compatibilità con la versione MC del progetto --------------------------

/**
 * Esito effettivo del controllo: la correzione manuale vince sulla scansione.
 * `null` = non verificabile (vincolo assente o sintassi non riconosciuta): resta
 * `null`, non è un errore da correggere.
 *
 * Se l'utente ha corretto il VINCOLO senza dichiarare la mod compatibile,
 * l'esito torna a "non lo so": il confronto lo fa Rust sul vincolo letto dal jar,
 * e tenerlo rosso vorrebbe dire mostrare un verdetto calcolato su un dato che
 * l'utente ha appena smentito (farebbe cercare un problema che non esiste).
 */
export function effectiveMcCompatible(
  target: mod,
  scanned: boolean | null | undefined
): boolean | null {
  const fix = target.checks?.mc
  if (fix?.falsePositive) return true
  if (fix?.value?.trim()) return null
  return scanned ?? null
}

/** Vincolo da mostrare: quello corretto a mano se c'è, altrimenti quello del jar. */
export function effectiveMcConstraint(
  target: mod,
  scanned: string | null | undefined
): string | null {
  const corrected = target.checks?.mc?.value?.trim()
  return corrected || scanned || null
}

// --- Manutenzione di `mod.checks` ------------------------------------------

/** Una correzione è "vuota" se non dice nulla: va rimossa invece di persistita. */
function isEmptyFix(fix: checkFix | undefined): boolean {
  if (!fix) return true
  return !fix.falsePositive && !fix.value?.trim() && !fix.note?.trim()
}

/** Ripulisce una correzione dai campi vuoti (`undefined` se non dice nulla). */
function cleanFix(fix: checkFix | undefined): checkFix | undefined {
  if (isEmptyFix(fix)) return undefined
  const cleaned: checkFix = {}
  if (fix!.falsePositive) cleaned.falsePositive = true
  const value = fix!.value?.trim()
  if (value) cleaned.value = value
  const note = fix!.note?.trim()
  if (note) cleaned.note = note
  return cleaned
}

/**
 * Normalizza le correzioni prima di salvarle: butta via le voci vuote e ritorna
 * `undefined` se non resta nulla, così il `project.json` non si riempie di
 * oggetti `{}` e il campo `checks` sparisce quando l'utente annulla tutto.
 */
export function cleanChecks(checks: modChecks | undefined): modChecks | undefined {
  if (!checks) return undefined
  const result: modChecks = {}
  const mc = cleanFix(checks.mc)
  if (mc) result.mc = mc
  for (const group of ["dependencies", "warnings"] as const) {
    const entries = Object.entries(checks[group] ?? {})
      .map(([key, fix]) => [key, cleanFix(fix)] as const)
      .filter((entry): entry is readonly [string, checkFix] => !!entry[1])
    if (entries.length > 0) result[group] = Object.fromEntries(entries)
  }
  return Object.keys(result).length > 0 ? result : undefined
}

/** La mod ha almeno una correzione manuale registrata? */
export function hasChecks(target: mod): boolean {
  return !!cleanChecks(target.checks)
}
