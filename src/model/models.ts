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
    configs: {
        workpath: string
    },
};

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
    action: string,     // descrizione dell'azione
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

// Una mappa di keybind (es. "Tech & Armi", "Magia"): il progetto può averne più
// di una, ciascuna con il proprio set di binding.
export type keybindMap = {
    name: string,
    keybinds: keybind[]
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