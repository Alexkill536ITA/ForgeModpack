// Fabbrica del progetto vuoto, usata da TUTTI i punti che creano un progetto
// (il menu della sidebar e il blocco "No project selected" di ProjectGate).
// Prima l'oggetto era duplicato nei due file: una modifica in uno solo lasciava
// progetti diversi a seconda di dove li avevi creati.

import { defaultJvmSettings, modloaderTypes, project } from "../model/models"
import { defaultTags } from "./keybind-template"

/**
 * Progetto nuovo e vuoto per la `workpath` scelta.
 *
 * I tag keybind di default ci sono da subito: servono ad associare i tag alle
 * mod (bottone "Add Mod" nella pagina Keybinds) e senza di essi il secondo filtro
 * resterebbe vuoto finché non si crea una mappa. Le categorie invece no: sono
 * i nomi delle mod, e l'unica non-mod ("Vanilla") nasce insieme alla prima mappa
 * dal template, che è anche l'unico posto in cui ha senso.
 *
 * I nomi dei tag restano in inglese canonico: sono dati persistiti nel
 * `project.json`, la localizzazione riguarda solo la visualizzazione.
 */
export function emptyProject(workpath: string): project {
  return {
    metadata: { name: "", version: "", description: "" },
    modloader: { mcversion: "", type: modloaderTypes.FORGE, version: "" },
    assetes: [],
    notes: [],
    mods: [],
    datapacks: [],
    keybindMaps: [],
    keybindCategories: [],
    keybindTags: defaultTags(),
    jvm: defaultJvmSettings(),
    configs: { workpath },
  }
}
