// Template di default per le NUOVE mappe di keybind: un set già popolato di
// binding di base, mappati sugli id dei tasti definiti in keyboard-layout.ts.
// Categorie incluse: solo UI, Movimento, Inventario.

import { keybind, keybindCategory, keybindTag } from "../model/models"

const CAT = {
    ui: { name: "UI", color: "#ff6b6b" },
    move: { name: "Movimento", color: "#417505" },
    inv: { name: "Inventario", color: "#8c582a" },
} as const

type CatKey = keyof typeof CAT

const TAG = {
    movimento: "Movimento",
    inventario: "Inventario",
    tecnologia: "Tecnologia",
    magia: "Magia",
    avventura: "Avventura",
    equipaggiamento: "Equipaggiamento",
    creature: "Creature",
    generazioneMondo: "Generazione Mondo",
    trasporto: "Trasporto",
    agricoltura: "Agricoltura",
    cibo: "Cibo",
    decorazione: "Decorazione",
    cosmetica: "Cosmetica",
    redstone: "Redstone",
    ottimizzazione: "Ottimizzazione",
    utility: "Utility",
    mappe: "Mappe",
    server: "Server",
    economia: "Economia",
    librerie: "Librerie",
    minigioco: "Minigioco",
    cursed: "Cursed",
} as const

type TagKey = keyof typeof TAG

// [id tasto, azione, categoria]
const TEMPLATE: [string, string, CatKey][] = [
    // UI
    ["esc", "Menu", "ui"],
    ["f1", "HUD", "ui"],
    ["f2", "Screenshot", "ui"],
    ["f3", "Debug", "ui"],
    ["f4", "Shaders", "ui"],
    ["f5", "Camera", "ui"],
    ["f11", "Full Screen", "ui"],
    ["l", "Advancements", "ui"],
    ["minus", "Comando", "ui"],

    // Movimento
    ["w", "Forward", "move"],
    ["a", "Left", "move"],
    ["s", "Back", "move"],
    ["d", "Right", "move"],
    ["shiftleft", "Sneak", "move"],
    ["ctrlleft", "Sprint", "move"],
    ["c", "Crawl", "move"],
    ["space", "Jump / Fly", "move"],
    ["mouse1", "Attack", "move"],
    ["mouse2", "Mira", "move"],

    // Inventario
    ["q", "Drop item", "inv"],
    ["e", "Inventory", "inv"],
    ["f", "Swap", "inv"],
    ["digit1", "Hotbar 1", "inv"],
    ["digit2", "Hotbar 2", "inv"],
    ["digit3", "Hotbar 3", "inv"],
    ["digit4", "Hotbar 4", "inv"],
    ["digit5", "Hotbar 5", "inv"],
    ["digit6", "Hotbar 6", "inv"],
    ["digit7", "Hotbar 7", "inv"],
    ["digit8", "Hotbar 8", "inv"],
    ["digit9", "Hotbar 9", "inv"],
    ["nummultiply", "Jade menu", "inv"],
    ["less", "Carry On", "inv"],
    ["b", "Backpack", "inv"],
    ["shiftright", "Stack items", "inv"],
    ["delete", "Del item", "inv"],
]

/** Keybind di default per una nuova mappa. */
export function defaultKeybinds(): keybind[] {
    return TEMPLATE.map(([key, action, cat]) => ({ key, action, category: CAT[cat].name }))
}

/** Categorie di default: solo UI, Movimento, Inventario. */
export function defaultCategories(): keybindCategory[] {
    return (Object.keys(CAT) as CatKey[]).map((cat) => ({
        name: CAT[cat].name,
        color: CAT[cat].color,
        tags: [],
    }))
}

export function defaultTags(): keybindTag[] {
    return (Object.keys(TAG) as TagKey[]).map((tag) => ({
        name: TAG[tag]
    }))
}
