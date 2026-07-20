// Template di default per le NUOVE mappe di keybind: i keybind VANILLA di
// Minecraft, mappati sugli id dei tasti di keyboard-layout.ts. Tutti hanno un
// actionKey vanilla valido (quindi esportabili) e stanno in un'unica categoria
// non-mod "Vanilla".

import { keybind, keybindCategory, keybindTag } from "../model/models"

// Unica categoria non-mod dello schema di default (le altre categorie sono le mod).
const VANILLA_CATEGORY = { name: "Vanilla", color: "#6b7280" } as const

// I nomi dei tag di default sono in INGLESE (dato canonico persistito nel
// project). La visualizzazione localizzata è gestita a parte via i18n; i valori
// salvati restano stabili in inglese per non rompere i progetti esistenti.
const TAG = {
    movement: "Movement",
    inventory: "Inventory",
    technology: "Technology",
    magic: "Magic",
    adventure: "Adventure",
    equipment: "Equipment",
    creatures: "Creatures",
    worldGeneration: "World Generation",
    transport: "Transport",
    farming: "Farming",
    food: "Food",
    decoration: "Decoration",
    cosmetic: "Cosmetic",
    redstone: "Redstone",
    optimization: "Optimization",
    utility: "Utility",
    maps: "Maps",
    server: "Server",
    economy: "Economy",
    libraries: "Libraries",
    minigame: "Minigame",
    cursed: "Cursed",
} as const

type TagKey = keyof typeof TAG

// Funzioni vanilla HARDCODED: NON sono KeyMapping (nessun actionKey, quindi non
// esportabili in options.txt/keyset), ma le includiamo come riferimento perché
// occupano tasti fissi. [id tasto, label EN].
const HARDCODED: [string, string][] = [
    ["esc", "Menu"],
    ["f1", "Toggle HUD"],
    ["f3", "Debug Screen"],
]

// [id tasto (keyboard-layout.ts), actionKey vanilla, label EN].
// Solo keybind vanilla REALI col loro tasto di default (niente placeholder di mod),
// così lo schema è esportabile.
const TEMPLATE: [string, string, string][] = [
    // Movimento
    ["w", "key.forward", "Walk Forwards"],
    ["a", "key.left", "Strafe Left"],
    ["s", "key.back", "Walk Backwards"],
    ["d", "key.right", "Strafe Right"],
    ["space", "key.jump", "Jump"],
    ["shiftleft", "key.sneak", "Sneak"],
    ["ctrlleft", "key.sprint", "Sprint"],
    ["mouse1", "key.attack", "Attack / Destroy"],
    ["mouse2", "key.use", "Use Item / Place Block"],
    ["mouse3", "key.pickItem", "Pick Block"],

    // Inventario
    ["q", "key.drop", "Drop Selected Item"],
    ["e", "key.inventory", "Open/Close Inventory"],
    ["f", "key.swapOffhand", "Swap Item With Offhand"],
    ["c", "key.saveToolbarActivator", "Save Toolbar Activator"],
    ["x", "key.loadToolbarActivator", "Load Toolbar Activator"],

    // UI
    ["f2", "key.screenshot", "Take Screenshot"],
    ["f5", "key.togglePerspective", "Toggle Perspective"],
    ["f11", "key.fullscreen", "Toggle Fullscreen"],
    ["l", "key.advancements", "Advancements"],

    // Multiplayer
    ["t", "key.chat", "Open Chat"],
    ["tab", "key.playerlist", "List Players"],
]

/** Keybind di default per una nuova mappa: i keybind vanilla di Minecraft. */
export function defaultKeybinds(): keybind[] {
    const binds: keybind[] = TEMPLATE.map(([key, actionKey, action]) => ({
        key,
        action,
        actionKey,
        category: VANILLA_CATEGORY.name,
    }))
    // Hotbar 1-9 → digit1..9
    for (let i = 1; i <= 9; i++) {
        binds.push({
            key: `digit${i}`,
            action: `Hotbar Slot ${i}`,
            actionKey: `key.hotbar.${i}`,
            category: VANILLA_CATEGORY.name,
        })
    }
    // Funzioni hardcoded (senza actionKey): incluse come riferimento.
    for (const [key, action] of HARDCODED) {
        binds.push({ key, action, category: VANILLA_CATEGORY.name })
    }
    return binds
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

/** Categorie di default: solo "Vanilla" (le altre categorie sono le mod). */
export function defaultCategories(): keybindCategory[] {
    return [{ name: VANILLA_CATEGORY.name, color: VANILLA_CATEGORY.color, tags: [] }]
}

export function defaultTags(): keybindTag[] {
    return (Object.keys(TAG) as TagKey[]).map((tag) => ({
        name: TAG[tag]
    }))
}
