// Layout fisico di tastiera (ISO/IT) e mouse, usato dalla pagina Keybinds per
// la rappresentazione grafica. Ogni tasto ha un `id` STABILE: è la chiave a cui
// vengono legati i keybind del progetto, quindi non va cambiato una volta in uso.

export interface KeyDef {
    id: string
    label: string
    /** Larghezza in unità (1u = tasto base). Default 1. */
    w?: number
    /** Altezza doppia (es. Enter del tastierino). */
    tall?: boolean
}

export interface Spacer {
    /** Spaziatore vuoto, larghezza in unità. */
    spacer: number
}

export type KeyboardItem = KeyDef | Spacer

export function isSpacer(item: KeyboardItem): item is Spacer {
    return (item as Spacer).spacer !== undefined
}

const sp = (w: number): Spacer => ({ spacer: w })
const k = (id: string, label: string, w?: number, tall?: boolean): KeyDef => ({ id, label, w, tall })

// Blocco principale: 6 righe (function, numeri, qwerty, home, shift, bottom),
// con cluster di navigazione e frecce in coda alle righe come nel layout reale.
export const MAIN_ROWS: KeyboardItem[][] = [
    [
        k("esc", "Esc"), sp(1),
        k("f1", "F1"), k("f2", "F2"), k("f3", "F3"), k("f4", "F4"), sp(0.5),
        k("f5", "F5"), k("f6", "F6"), k("f7", "F7"), k("f8", "F8"), sp(0.5),
        k("f9", "F9"), k("f10", "F10"), k("f11", "F11"), k("f12", "F12"), sp(0.5),
        k("stamp", "Stamp"), k("scrolllock", "Bloc Scorr"), k("pause", "Pausa"),
    ],
    [
        k("backslash", "\\"),
        k("digit1", "1"), k("digit2", "2"), k("digit3", "3"), k("digit4", "4"), k("digit5", "5"),
        k("digit6", "6"), k("digit7", "7"), k("digit8", "8"), k("digit9", "9"), k("digit0", "0"),
        k("apostrophe", "'"), k("igrave", "ì"), k("backspace", "Backspace", 2), sp(0.5),
        k("insert", "Ins"), k("home", "Home"), k("pageup", "PagSu"),
    ],
    [
        k("tab", "Tab", 1.5),
        k("q", "Q"), k("w", "W"), k("e", "E"), k("r", "R"), k("t", "T"), k("y", "Y"),
        k("u", "U"), k("i", "I"), k("o", "O"), k("p", "P"), k("egrave", "è"), k("plus", "+"),
        k("enter1", "Invio", 1.5), sp(0.5),
        k("delete", "Canc"), k("end", "Fine"), k("pagedown", "PagGiù"),
    ],
    [
        k("capslock", "Caps", 1.75),
        k("a", "A"), k("s", "S"), k("d", "D"), k("f", "F"), k("g", "G"), k("h", "H"),
        k("j", "J"), k("k", "K"), k("l", "L"), k("ograve", "ò"), k("agrave", "à"), k("ugrave", "ù"),
        k("enter2", "Invio", 1.25),
    ],
    [
        k("shiftleft", "Shift", 1.5),
        k("less", "<"), k("z", "Z"), k("x", "X"), k("c", "C"), k("v", "V"), k("b", "B"),
        k("n", "N"), k("m", "M"), k("comma", ","), k("dot", "."), k("minus", "−"),
        k("shiftright", "Shift", 2.5), sp(0.5),
        sp(1), k("arrowup", "↑"),
    ],
    [
        k("ctrlleft", "Ctrl", 1.5), k("winleft", "Win", 1.25), k("alt", "Alt", 1.25),
        k("space", "Spazio", 5.75),
        k("altgr", "AltGr", 1.25), k("winright", "Win", 1.25), k("menu", "Menu", 1.25),
        k("ctrlright", "Ctrl", 1.5), sp(0.5),
        k("arrowleft", "←"), k("arrowdown", "↓"), k("arrowright", "→"),
    ],
]

// Tastierino numerico: le 3 colonne di sinistra (righe da 3u, nessun vuoto).
export const NUMPAD_ROWS: KeyboardItem[][] = [
    [k("numlock", "Bloc Num"), k("numdivide", "/"), k("nummultiply", "*")],
    [k("num7", "7"), k("num8", "8"), k("num9", "9")],
    [k("num4", "4"), k("num5", "5"), k("num6", "6")],
    [k("num1", "1"), k("num2", "2"), k("num3", "3")],
    [k("num0", "0", 2), k("numdecimal", ".")],
]

// Colonna destra del tastierino, impilata: "−", "+" e "Invio" (questi ultimi
// alti 2u). Resa come colonna per evitare i vuoti dei tasti alti nelle righe.
export const NUMPAD_SIDE: KeyDef[] = [
    k("numminus", "−"),
    k("numplus", "+", 1, true),
    k("numenter", "Invio", 1, true),
]

// Mouse: pulsanti principali, rotella e tasti laterali.
export const MOUSE_KEYS: KeyDef[] = [
    k("mouse1", "BT1 (Sx)"),
    k("mouse3", "Rotella"),
    k("mouse2", "BT2 (Dx)"),
    k("mouse4", "BT4"),
    k("mouse5", "BT5"),
]

// Tutti gli id assegnabili (utile per validazioni/ricerche).
export const ALL_KEY_IDS: string[] = [
    ...MAIN_ROWS.flat().filter((i): i is KeyDef => !isSpacer(i)).map((key) => key.id),
    ...NUMPAD_ROWS.flat().filter((i): i is KeyDef => !isSpacer(i)).map((key) => key.id),
    ...NUMPAD_SIDE.map((key) => key.id),
    ...MOUSE_KEYS.map((key) => key.id),
]
