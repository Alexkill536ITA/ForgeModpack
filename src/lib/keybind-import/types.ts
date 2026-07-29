// Astrazione per l'IMPORT dei keybind dai file di config di Minecraft/mod verso
// il modello interno del progetto. Simmetrica agli exporter (keybind-export):
// gli importer sono PURI (ricevono il contenuto testuale già letto, non toccano
// il disco) e ritornano le mappe ricostruite + le categorie (mod) da garantire.
// La lettura del file e il dispatch su Redux restano nella UI.

import { keybind, keybindCategory, macro, project } from "../../model/models"

export interface ImportContext {
  project: project
  // Mod effettivamente INSTALLATE (dallo scan della cartella mods): modId + nome.
  // Un binding la cui mod non è qui (e non è vanilla) viene SCARTATO dall'import.
  installedMods: { modId: string; name: string }[]
  // Azioni keybind scansionate dai jar (Redux runtime: `byModId`). Servono a
  // ricollegare un `actionKey` (key.*) alla mod proprietaria e alla sua label.
  actionsByModId: Record<string, { key: string; label: string }[]>
  // Risoluzione MIRATA per chiave esatta (comando Rust `resolve_keybind_labels`):
  // actionKey → { modId, label }. È il link più affidabile e copre anche le
  // keybind con nomi non standard (config.jsg.*, placebo.toggle*). Opzionale.
  resolvedByKey?: Record<string, { modId: string; label: string }>
}

// Una mappa ricostruita da un profilo del file.
export interface ImportedMap {
  name: string
  keybinds: keybind[]
  macros: macro[] // binding con modificatori (SHIFT/CTRL/ALT) ricostruiti come macro
  // Quanti livelli servono alla mappa: l'import distribuisce i binding che
  // condividono un tasto su livelli separati (uno per livello), così la tastiera
  // non nasce con i tasti divisi in riquadri di colori diversi.
  layerCount: number
}

// Motivo per cui un binding è stato saltato durante l'import. I binding "unbound"
// (senza tasto nel file) NON sono considerati un problema: vengono ignorati in
// silenzio, non compaiono nel report.
//  - not-installed: la mod del binding non è tra quelle installate → scartato.
//  - unmapped: il tasto non è mappabile sul layout.
export type ImportIssueReason = "not-installed" | "unmapped"

// Un singolo binding problematico (riga della tabella dettagliata in pagina).
export interface ImportIssue {
  map: string             // nome del profilo/mappa di provenienza
  actionKey: string       // translation key dell'azione (key.*)
  keyCode: string | null  // input code del tasto nel file (null se unbound)
  reason: ImportIssueReason
}

// Report dettagliato dell'import (mostrato in pagina sotto il blocco Keybinds).
export interface ImportReport {
  maps: number            // mappe (profili) importate
  bindings: number        // binding effettivamente importati
  issues: ImportIssue[]   // elenco dettagliato dei binding saltati
}

export interface ImportResult {
  maps: ImportedMap[]              // profili → mappe
  newCategories: keybindCategory[] // categorie (mod) non ancora nel project, con colore assegnato
  report: ImportReport            // report dettagliato (conteggi + issue)
}

export interface KeybindImporter {
  id: string               // "keyset"
  label: string            // etichetta mostrata nel dialog
  defaultFileName: string  // "keybindprofiles.json"
  available: boolean       // false = disabilitato in UI
  relativePath: string[]   // path relativo alla workpath, es. ["config", "keybindprofiles.json"]
  parse: (content: string, ctx: ImportContext) => ImportResult
}
