// Sincronizzazione delle liste derivate dal disco (mod e datapack) col `project`.
//
// Regola: **a ogni apertura di progetto** (create/open, cioè a ogni cambio di
// `loadId` nello slice project) le liste vengono rilette dal disco, anche se il
// progetto era già salvato con le mod dentro. Così un mod rimosso, aggiunto o
// aggiornato fuori dall'app si riflette subito. Dentro la stessa apertura le
// letture successive usano la cache SQLite (navigare tra le pagine non riapre
// tutti i jar); il refresh manuale forza sempre una rilettura.
//
// Qui vivono: i wrapper "fresco per apertura" attorno alle scansioni, la
// conversione scansione → liste del project (preservando `active`) e il diff
// usato per NON marcare il progetto come modificato quando nulla è cambiato.

import { join } from "@tauri-apps/api/path"

import { datapack, mod, modloaderTypes, project } from "../model/models"
import { scanHint } from "./forge-spec"
import { getModsScanCached, scannedMod } from "./mods-scan"
import { getDatapacksScanCached, scannedDatapack } from "./datapacks-scan"

// --- Wrapper "fresco per apertura" -----------------------------------------
// `refreshed` ricorda per quale `loadId` una certa scansione è già stata rifatta;
// `inflight` fa sì che più chiamanti concorrenti (es. la sincronizzazione globale
// e la pagina List Mods che monta nello stesso istante) condividano UNA sola
// scansione invece di riaprire i jar due volte.

const refreshedMods = new Map<string, number>()
const inflightMods = new Map<string, Promise<scannedMod[]>>()
const refreshedDatapacks = new Map<string, number>()
const inflightDatapacks = new Map<string, Promise<scannedDatapack[]>>()

function modsKey(workpath: string, hint?: scanHint): string {
  return `${workpath}|${hint?.mc ?? ""}|${hint?.forge ?? ""}`
}

function share<T>(
  key: string,
  loadId: number,
  refreshed: Map<string, number>,
  inflight: Map<string, Promise<T>>,
  run: (force: boolean) => Promise<T>
): Promise<T> {
  const running = inflight.get(key)
  if (running) return running
  // Prima lettura di questa apertura → rileggi dal disco; poi cache.
  const force = refreshed.get(key) !== loadId
  const task = run(force)
    .then((result) => {
      refreshed.set(key, loadId)
      return result
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, task)
  return task
}

/** Scansione mod: rilettura dal disco alla prima richiesta dopo un'apertura. */
export function getModsScanForLoad(
  workpath: string,
  loadId: number,
  hint?: scanHint
): Promise<scannedMod[]> {
  const key = modsKey(workpath, hint)
  return share(key, loadId, refreshedMods, inflightMods, (force) =>
    getModsScanCached(workpath, force, hint)
  )
}

/** Refresh manuale: forza sempre la rilettura e conta come "fresco" per questa apertura. */
export function refreshModsScan(
  workpath: string,
  loadId: number,
  hint?: scanHint
): Promise<scannedMod[]> {
  refreshedMods.delete(modsKey(workpath, hint))
  return getModsScanForLoad(workpath, loadId, hint)
}

/** Scansione datapack: stessa regola, chiave per cartella. */
export function getDatapacksScanForLoad(dir: string, loadId: number): Promise<scannedDatapack[]> {
  return share(dir, loadId, refreshedDatapacks, inflightDatapacks, (force) =>
    getDatapacksScanCached(dir, force)
  )
}

export function refreshDatapacksScan(dir: string, loadId: number): Promise<scannedDatapack[]> {
  refreshedDatapacks.delete(dir)
  return getDatapacksScanForLoad(dir, loadId)
}

// --- Cosa serve a questo progetto -----------------------------------------

/** Il progetto ha mod? (loader classico, oppure datapack in modalità ibrida) */
export function usesMods(p: project): boolean {
  return p.modloader.type !== modloaderTypes.DATAPACK || !!p.modloader.hybrid
}

/** Il progetto ha datapack? (loader datapack, puro o ibrido) */
export function usesDatapacks(p: project): boolean {
  return p.modloader.type === modloaderTypes.DATAPACK
}

/** Cartella dei datapack: quella configurata (path assoluto) o `<workpath>/datapacks`. */
export function datapacksDir(p: project): Promise<string> {
  const configured = p.configs.datapacksPath?.trim()
  return configured ? Promise.resolve(configured) : join(p.configs.workpath, "datapacks")
}

// --- Conversione scansione → liste del project -----------------------------

/**
 * Mod del project dalla scansione, preservando `active` per `filename`. I
 * `keybinds` NON vengono copiati (restano nella cache): `project.json` resta
 * leggero. Le mod non più presenti sul disco spariscono, perché la lista è
 * ricostruita interamente dalla scansione.
 */
export function toProjectMods(scanned: scannedMod[], previous: mod[]): mod[] {
  const prevActive = new Map(previous.map((m) => [m.filename, m.active]))
  return scanned.map((s) => ({
    active: prevActive.get(s.filename) ?? true,
    filename: s.filename,
    modId: s.modId,
    name: s.name,
    modloader: s.modloader as modloaderTypes,
    version: s.version,
    provides: s.provides,
    description: s.description ?? undefined,
    authors: s.authors,
    dependencies: s.dependencies,
  }))
}

/** Datapack del project dalla scansione, preservando `active` per `filename`. */
export function toProjectDatapacks(
  scanned: scannedDatapack[],
  previous: datapack[]
): datapack[] {
  const prevActive = new Map(previous.map((d) => [d.filename, d.active]))
  return scanned.map((s) => ({
    active: prevActive.get(s.filename) ?? true,
    filename: s.filename,
    name: s.name,
    description: s.description ?? undefined,
    packFormat: s.packFormat ?? undefined,
  }))
}

// --- Diff (per non marcare `unsaved` a vuoto) -----------------------------

export interface listDiff {
  added: number
  removed: number
  changed: number
}

export const hasChanges = (diff: listDiff): boolean =>
  diff.added > 0 || diff.removed > 0 || diff.changed > 0

/** Firma dei campi che arrivano dalla scansione (`active` è dell'utente: escluso). */
function modSignature(m: mod): string {
  return JSON.stringify([
    m.modId,
    m.name,
    m.version,
    m.modloader,
    m.description ?? "",
    m.authors ?? [],
    m.provides ?? [],
    (m.dependencies ?? []).map((d) => [d.name, d.version, d.mandatory]),
  ])
}

function datapackSignature(d: datapack): string {
  return JSON.stringify([d.name, d.description ?? "", d.packFormat ?? null])
}

function diffBy<T>(
  previous: T[],
  next: T[],
  keyOf: (item: T) => string,
  signatureOf: (item: T) => string
): listDiff {
  const before = new Map(previous.map((item) => [keyOf(item), signatureOf(item)]))
  let added = 0
  let changed = 0
  for (const item of next) {
    const signature = before.get(keyOf(item))
    if (signature === undefined) added++
    else if (signature !== signatureOf(item)) changed++
  }
  const nextKeys = new Set(next.map(keyOf))
  const removed = previous.filter((item) => !nextKeys.has(keyOf(item))).length
  return { added, removed, changed }
}

export function diffMods(previous: mod[], next: mod[]): listDiff {
  return diffBy(previous, next, (m) => m.filename, modSignature)
}

export function diffDatapacks(previous: datapack[], next: datapack[]): listDiff {
  return diffBy(previous, next, (d) => d.filename, datapackSignature)
}
