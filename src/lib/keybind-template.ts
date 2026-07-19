// Template di default per le NUOVE mappe di keybind: un set già popolato di
// binding di base, mappati sugli id dei tasti definiti in keyboard-layout.ts.
// Categorie incluse: solo UI, Movimento, Inventario.

import { keybind, keybindCategory, keybindTag } from "../model/models"

const CAT = {
    ui: { name: "UI", color: "#ff6b6b" },
    move: { name: "Movimento", color: "#417505" },
    inv: { name: "Inventario", color: "#8c582a" },
    mp: { name: "Multiplayer", color: "#4eccc4" },
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

// [id tasto, azione, categoria, actionKey?]
// actionKey = chiave di traduzione Minecraft (per l'export dei config); assente
// per le azioni che non corrispondono a un keybind vanilla (mod o funzioni hard-coded).
const TEMPLATE: [string, string, CatKey, string?][] = [
    // UI
    ["esc", "Menu", "ui"],
    ["f1", "HUD", "ui"],
    ["f2", "Screenshot", "ui", "key.screenshot"],
    ["f3", "Debug", "ui"],
    ["f4", "Shaders", "ui"],
    ["f5", "Camera", "ui", "key.togglePerspective"],
    ["f11", "Full Screen", "ui", "key.fullscreen"],
    ["l", "Advancements", "ui", "key.advancements"],
    ["minus", "Comando", "ui", "key.command"],

    // Movimento
    ["w", "Forward", "move", "key.forward"],
    ["a", "Left", "move", "key.left"],
    ["s", "Back", "move", "key.back"],
    ["d", "Right", "move", "key.right"],
    ["shiftleft", "Sneak", "move", "key.sneak"],
    ["ctrlleft", "Sprint", "move", "key.sprint"],
    ["c", "Crawl", "move"],
    ["space", "Jump / Fly", "move", "key.jump"],
    ["mouse1", "Attack", "move", "key.attack"],
    ["mouse2", "Mira", "move", "key.use"],

    // Inventario
    ["q", "Drop item", "inv", "key.drop"],
    ["e", "Inventory", "inv", "key.inventory"],
    ["f", "Swap", "inv", "key.swapOffhand"],
    ["digit1", "Hotbar 1", "inv", "key.hotbar.1"],
    ["digit2", "Hotbar 2", "inv", "key.hotbar.2"],
    ["digit3", "Hotbar 3", "inv", "key.hotbar.3"],
    ["digit4", "Hotbar 4", "inv", "key.hotbar.4"],
    ["digit5", "Hotbar 5", "inv", "key.hotbar.5"],
    ["digit6", "Hotbar 6", "inv", "key.hotbar.6"],
    ["digit7", "Hotbar 7", "inv", "key.hotbar.7"],
    ["digit8", "Hotbar 8", "inv", "key.hotbar.8"],
    ["digit9", "Hotbar 9", "inv", "key.hotbar.9"],
    ["nummultiply", "Jade menu", "inv"],
    ["less", "Carry On", "inv"],
    ["b", "Backpack", "inv"],
    ["shiftright", "Stack items", "inv"],
    ["delete", "Del item", "inv"],

    // Multiplayer
    ["t", "Chat", "mp", "key.chat"],
    ["tab", "Player list", "mp", "key.playerlist"],
]

/** Keybind di default per una nuova mappa. */
export function defaultKeybinds(): keybind[] {
    return TEMPLATE.map(([key, action, cat, actionKey]) => ({
        key,
        action,
        category: CAT[cat].name,
        ...(actionKey ? { actionKey } : {}),
    }))
}

// Azione vanilla selezionabile nel dialog dei keybind (quando la categoria non è
// una mod scansionata). `actionKey` è la chiave di traduzione Minecraft.
export interface VanillaAction {
    actionKey: string
    label: string
}

// Elenco completo dei keybind di Minecraft vanilla (chiave + label EN).
const VANILLA_ACTIONS: VanillaAction[] = [
    { actionKey: "key.attack", label: "Attack / Destroy" },
    { actionKey: "key.use", label: "Use Item / Place Block" },
    { actionKey: "key.forward", label: "Walk Forwards" },
    { actionKey: "key.left", label: "Strafe Left" },
    { actionKey: "key.back", label: "Walk Backwards" },
    { actionKey: "key.right", label: "Strafe Right" },
    { actionKey: "key.jump", label: "Jump" },
    { actionKey: "key.sneak", label: "Sneak" },
    { actionKey: "key.sprint", label: "Sprint" },
    { actionKey: "key.drop", label: "Drop Selected Item" },
    { actionKey: "key.inventory", label: "Open/Close Inventory" },
    { actionKey: "key.chat", label: "Open Chat" },
    { actionKey: "key.playerlist", label: "List Players" },
    { actionKey: "key.pickItem", label: "Pick Block" },
    { actionKey: "key.command", label: "Open Command" },
    { actionKey: "key.socialInteractions", label: "Social Interactions Screen" },
    { actionKey: "key.screenshot", label: "Take Screenshot" },
    { actionKey: "key.togglePerspective", label: "Toggle Perspective" },
    { actionKey: "key.smoothCamera", label: "Toggle Cinematic Camera" },
    { actionKey: "key.fullscreen", label: "Toggle Fullscreen" },
    { actionKey: "key.spectatorOutlines", label: "Highlight Players (Spectators)" },
    { actionKey: "key.swapOffhand", label: "Swap Item With Offhand" },
    { actionKey: "key.saveToolbarActivator", label: "Save Toolbar Activator" },
    { actionKey: "key.loadToolbarActivator", label: "Load Toolbar Activator" },
    { actionKey: "key.advancements", label: "Advancements" },
    ...Array.from({ length: 9 }, (_, i) => ({
        actionKey: `key.hotbar.${i + 1}`,
        label: `Hotbar Slot ${i + 1}`,
    })),
]

/** Azioni vanilla selezionabili (fallback quando la mod non ha keybind scansionate). */
export function vanillaActions(): VanillaAction[] {
    return VANILLA_ACTIONS
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
