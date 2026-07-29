export enum modloaderTypes {
    FORGE = "forge",
    NEOFORGE = "neoforge",
    FABRIC = "fabric",
    QUILT = "quilt",
    DATAPACK = "datapack",
    UNKNOWN = "unknown",
};

export type project = {
    metadata: {
        name: string,
        version: string,
        description: string,
    },
    modloader: {
        mcversion: string,
        type: modloaderTypes,
        version: string,
        // Modalità IBRIDA: quando `type === datapack`, se `hybrid` è true il
        // modpack include ANCHE un loader classico (mods). `hybridLoader` è il
        // loader classico scelto; `version` in tal caso è la sua versione.
        hybrid?: boolean,
        hybridLoader?: modloaderTypes,
    },
    assetes: asset[],
    notes?: string[], // note libere del progetto; opzionale = retrocompatibile
    mods: mod[],
    datapacks?: datapack[], // datapack del modpack; opzionale = retrocompatibile
    keybindMaps: keybindMap[],
    keybindCategories: keybindCategory[],
    keybindTags: keybindTag[],
    jvm: jvmSettings,
    configs: {
        workpath: string,
        // Cartella dei datapack (path assoluto). Se assente/vuoto, default
        // <workpath>/datapacks. Configurabile perché la posizione varia (per
        // mondo lato client, world/datapacks lato server, ecc.).
        datapacksPath?: string,
    },
};

// Tipo di garbage collector selezionabile per gli argomenti JVM.
export type gcType = "g1" | "zgc" | "shen";

// Impostazioni JVM del modpack (allocazione RAM + GC), salvate nel project.
export type jvmSettings = {
    ramGb: number,
    gc: gcType,
};

// Valori di default per un nuovo progetto / per i progetti salvati prima
// dell'introduzione del campo `jvm`.
export const defaultJvmSettings = (): jvmSettings => ({ ramGb: 4, gc: "g1" });

export type mod = {
    active: boolean,
    filename: string,
    modId: string,
    name: string,
    modloader: modloaderTypes,
    version: string,
    provides: string[],
    description?: string,
    dependencies?: dependency[],
    authors?: string[],
};

export type asset = {
    type: string,          // tipo della risorsa (es. Resource Pack, Shader Pack...)
    name: string,          // nome della risorsa
    path: string,          // path relativo alla workpath
    url?: string,          // link/url della fonte esterna (opzionale)
    notes?: string[],      // note libere della singola risorsa (opzionale)
    description?: string,  // descrizione opzionale (legacy)
};

export type dependency = {
    name: string,
    version: string,
    mandatory: boolean,
};

// Un datapack del modpack, scansionato dalla cartella datapacks (file .zip o
// cartella con pack.mcmeta). `active` è gestito come per le mod.
export type datapack = {
    active: boolean,
    filename: string,       // nome del file .zip o della cartella
    name: string,
    description?: string,
    packFormat?: number,    // pack_format da pack.mcmeta
};

export type keybind = {
    key: string,        // id del tasto fisico (vedi keyboard-layout.ts)
    action: string,     // descrizione leggibile dell'azione (label)
    actionKey?: string, // chiave di traduzione Minecraft (es. "key.jei.toggleOverlay"),
                        // usata per scrivere i file di config; opzionale = retrocompatibile
    category: string,   // nome della categoria (riferimento a keybindCategory.name)
    // Livello (>= 1, senza massimo) su cui vive il binding DENTRO la sua mappa: serve a
    // distribuire più azioni sullo stesso tasto su "lucidi" sovrapposti, così la
    // tastiera mostra un solo binding per tasto invece di dividere il tasto in
    // riquadri di colori diversi. Assente = 1 (retrocompatibile: i progetti
    // salvati prima dei layer hanno tutto sul primo livello).
    layer?: number,
};

// Categoria primaria di un keybind: corrisponde a una mod (name = nome mod).
export type keybindCategory = {
    name: string,
    color: string,      // colore HEX della categoria
    tags: string[]      // nomi dei tag associati (secondo filtro)
};

// Tag: secondo livello di filtro, associabile alle mod (senza colore).
export type keybindTag = {
    name: string
};

// Modificatore di una macro: un solo modificatore per combinazione (standard
// supportato dai mod, es. Keyset). Mappato su left/right in export.
export type macroModifier = "ctrl" | "shift" | "alt";

// Macro: combinazione modificatore + tasto base legata a un'azione (es. Ctrl+A).
// È come un keybind ma con un modificatore; vive nella keybindMap, separata dai
// keybind normali. `key`/`action`/`actionKey`/`category` come in `keybind`.
export type macro = {
    modifier: macroModifier, // modificatore della combinazione
    key: string,             // id del tasto base (vedi keyboard-layout.ts)
    action: string,          // descrizione leggibile dell'azione (label)
    actionKey?: string,      // chiave di traduzione Minecraft (per l'export); opzionale
    category: string,        // nome della categoria (riferimento a keybindCategory.name)
};

// Una mappa di keybind (es. "Tech & Armi", "Magia"): il progetto può averne più
// di una, ciascuna con il proprio set di binding.
export type keybindMap = {
    name: string,
    keybinds: keybind[],
    macros?: macro[], // combinazioni modificatore + tasto; opzionale = retrocompatibile
    // Quanti livelli ha la mappa (>= 1, senza massimo). È esplicito e non derivato dal
    // massimo `layer` usato, altrimenti un livello appena creato e ancora vuoto
    // scomparirebbe. Assente = 1.
    layerCount?: number
};

export const toastStyles = {
    info: {
        '--normal-bg':
            'color-mix(in oklab, light-dark(var(--color-sky-600), var(--color-sky-400)) 10%, var(--background))',
        '--normal-text': 'light-dark(var(--color-sky-600), var(--color-sky-400))',
        '--normal-border': 'light-dark(var(--color-sky-600), var(--color-sky-400))'
    } as React.CSSProperties,
    success: {
        '--normal-bg':
            'color-mix(in oklab, light-dark(var(--color-green-600), var(--color-green-400)) 10%, var(--background))',
        '--normal-text': 'light-dark(var(--color-green-600), var(--color-green-400))',
        '--normal-border': 'light-dark(var(--color-green-600), var(--color-green-400))'
    } as React.CSSProperties,
    warning: {
        '--normal-bg':
            'color-mix(in oklab, light-dark(var(--color-amber-600), var(--color-amber-400)) 10%, var(--background))',
        '--normal-text': 'light-dark(var(--color-amber-600), var(--color-amber-400))',
        '--normal-border': 'light-dark(var(--color-amber-600), var(--color-amber-400))'
    } as React.CSSProperties,
    destructive: {
        '--normal-bg': 'color-mix(in oklab, var(--destructive) 10%, var(--background))',
        '--normal-text': 'var(--destructive)',
        '--normal-border': 'var(--destructive)'
    } as React.CSSProperties
};