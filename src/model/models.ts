export enum modloaderTypes {
    FORGE = "forge",
    NEOFORGE = "neoforge",
    FABRIC = "fabric",
    QUILT = "quilt",
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
    keybinds: keybindsMap[],
    configs: {
        workpath: string
    },
};

export type mod = {
    name: string,
    modloader: modloaderTypes,
    version: string,
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
};

export type keybind = {
    key: string,
    action: string,
    category: keybindCategory,
};

export type keybindCategory = {
    name: string,
    color: string
};

export type keybindsMap = {
    [key: string]: keybind[]
};