export enum modloaderTypes {
    FORGE = "forge",
    NEOFORGE = "neoforge",
    FABRIC = "fabric",
    QUILT = "quilt",
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
    },
    assetes: asset[],
    mods: mod[],
    keybindMaps: keybindMap[],
    keybindCategories: keybindCategory[],
    keybindTags: keybindTag[],
    jvm: jvmSettings,
    configs: {
        workpath: string
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
    name: string,
    description: string,
    path: string,
    type: string,
};

export type dependency = {
    name: string,
    version: string,
    mandatory: boolean,
};

export type keybind = {
    key: string,        // id del tasto fisico (vedi keyboard-layout.ts)
    action: string,     // descrizione leggibile dell'azione (label)
    actionKey?: string, // chiave di traduzione Minecraft (es. "key.jei.toggleOverlay"),
                        // usata per scrivere i file di config; opzionale = retrocompatibile
    category: string,   // nome della categoria (riferimento a keybindCategory.name)
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
    macros?: macro[] // combinazioni modificatore + tasto; opzionale = retrocompatibile
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