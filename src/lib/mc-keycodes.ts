// Traduzione degli id dei tasti fisici del layout (vedi keyboard-layout.ts) nei
// codici di input di Minecraft (1.13+), usati nel file options.txt come parte
// destra delle righe `key_<translationKey>:<inputCode>`.
// Esempi: "key.keyboard.w", "key.keyboard.left.shift", "key.mouse.left".

// Codice per un tasto non assegnato / non mappabile.
export const UNMAPPED = "key.keyboard.unknown"

// Casi irregolari che non seguono una regola semplice (id -> inputCode).
const SPECIAL: Record<string, string> = {
  // Modificatori sinistra/destra
  shiftleft: "key.keyboard.left.shift",
  shiftright: "key.keyboard.right.shift",
  ctrlleft: "key.keyboard.left.control",
  ctrlright: "key.keyboard.right.control",
  alt: "key.keyboard.left.alt",
  altgr: "key.keyboard.right.alt",
  winleft: "key.keyboard.left.win",
  winright: "key.keyboard.right.win",
  menu: "key.keyboard.menu",

  // Tasti di controllo / editing
  space: "key.keyboard.space",
  tab: "key.keyboard.tab",
  esc: "key.keyboard.escape",
  enter1: "key.keyboard.enter",
  enter2: "key.keyboard.enter",
  backspace: "key.keyboard.backspace",
  capslock: "key.keyboard.caps.lock",
  insert: "key.keyboard.insert",
  delete: "key.keyboard.delete",
  home: "key.keyboard.home",
  end: "key.keyboard.end",
  pageup: "key.keyboard.page.up",
  pagedown: "key.keyboard.page.down",
  stamp: "key.keyboard.print.screen",
  scrolllock: "key.keyboard.scroll.lock",
  pause: "key.keyboard.pause",

  // Frecce
  arrowup: "key.keyboard.up",
  arrowdown: "key.keyboard.down",
  arrowleft: "key.keyboard.left",
  arrowright: "key.keyboard.right",

  // Punteggiatura (id del layout -> nome Minecraft)
  comma: "key.keyboard.comma",
  dot: "key.keyboard.period",
  minus: "key.keyboard.minus",

  // Tastierino: operatori e invio
  numlock: "key.keyboard.num.lock",
  numdivide: "key.keyboard.keypad.divide",
  nummultiply: "key.keyboard.keypad.multiply",
  numminus: "key.keyboard.keypad.subtract",
  numplus: "key.keyboard.keypad.add",
  numdecimal: "key.keyboard.keypad.decimal",
  numenter: "key.keyboard.keypad.enter",

  // Mouse
  mouse1: "key.mouse.left",
  mouse2: "key.mouse.right",
  mouse3: "key.mouse.middle",
  mouse4: "key.mouse.4",
  mouse5: "key.mouse.5",

  // I tasti specifici del layout ISO/IT (accentate e simboli non-US) non hanno
  // un input code vanilla stabile: restano UNMAPPED e vanno segnalati.
}

/**
 * Ritorna l'input code Minecraft per un id di tasto del layout, o `UNMAPPED`
 * se non è mappabile.
 */
export function toMinecraftInput(keyId: string): string {
  if (keyId in SPECIAL) return SPECIAL[keyId]
  // Lettere a-z
  if (/^[a-z]$/.test(keyId)) return `key.keyboard.${keyId}`
  // Cifre della riga numerica: digit0..9 -> key.keyboard.0..9
  if (/^digit[0-9]$/.test(keyId)) return `key.keyboard.${keyId.slice(5)}`
  // Funzione: f1..f12 -> key.keyboard.f1..f12
  if (/^f([1-9]|1[0-2])$/.test(keyId)) return `key.keyboard.${keyId}`
  // Tastierino numerico: num0..9 -> key.keyboard.keypad.0..9
  if (/^num[0-9]$/.test(keyId)) return `key.keyboard.keypad.${keyId.slice(3)}`
  return UNMAPPED
}

// Mappa inversa dei casi irregolari (input code Minecraft -> id del layout). In
// caso di più id per lo stesso code (es. enter1/enter2 -> key.keyboard.enter)
// vince il PRIMO inserito (l'ordine di SPECIAL), cioè quello "principale".
const REVERSE_SPECIAL: Record<string, string> = (() => {
  const rev: Record<string, string> = {}
  for (const [id, code] of Object.entries(SPECIAL)) {
    if (!(code in rev)) rev[code] = id
  }
  return rev
})()

/**
 * Inversa di `toMinecraftInput`: dato un input code Minecraft (es.
 * "key.keyboard.w", "key.mouse.left") ritorna l'id del tasto del layout, o
 * `null` se il tasto è non assegnato/non riconosciuto (`key.keyboard.unknown` o
 * code fuori dal set gestito). Usata dall'import dei config nel layout.
 */
export function fromMinecraftInput(code: string): string | null {
  if (!code || code === UNMAPPED) return null
  if (code in REVERSE_SPECIAL) return REVERSE_SPECIAL[code]
  let m: RegExpExecArray | null
  // Lettere a-z
  if ((m = /^key\.keyboard\.([a-z])$/.exec(code))) return m[1]
  // Cifre riga numerica: key.keyboard.0..9 -> digit0..9
  if ((m = /^key\.keyboard\.([0-9])$/.exec(code))) return `digit${m[1]}`
  // Funzione: key.keyboard.f1..f12 -> f1..f12
  if ((m = /^key\.keyboard\.(f(?:[1-9]|1[0-2]))$/.exec(code))) return m[1]
  // Tastierino numerico: key.keyboard.keypad.0..9 -> num0..9
  if ((m = /^key\.keyboard\.keypad\.([0-9])$/.exec(code))) return `num${m[1]}`
  return null
}
