// Rendering VISIVO della mappa dei tasti verso SVG e HTML interattivo. Funzioni
// PURE (nessun DOM, nessun I/O): replicano l'aspetto della tastiera della pagina
// Keybinds (blocchi Tastiera + Tastierino + Mouse, riquadri colorati per binding,
// un colore per mod). L'SVG è usato sia per l'HTML (inline) sia come sorgente da
// rasterizzare in PNG lato UI.

import { keybind, keybindCategory, keybindMap } from "../../model/models"
import {
  MAIN_ROWS,
  NUMPAD_ROWS,
  NUMPAD_SIDE,
  MOUSE_KEYS,
  KeyDef,
  KeyboardItem,
  isSpacer,
} from "../keyboard-layout"

// Dimensioni in px, allineate alla pagina Keybinds: là `KEY_SCALE = 1.35` porta
// il tasto base da 2.5rem (40px) a 3.375rem (54px). Il gap sarebbe 5.4: qui è
// arrotondato a 5 per tenere la geometria su numeri puliti (0.4px di differenza
// per gap, invisibile, e nessun rumore in virgola mobile nelle coordinate SVG).
// I CORPI DEL TESTO non scalano, come nella UI: il tasto più grande serve a dare
// spazio all'azione, non a scriverla più grande.
const UNIT = 54
const GAP = 5
const BLOCK_GAP = 28
const PAD = 16
const TITLE_H = 22
const RADIUS = 6

// Colori del tema (allineati alla UI dark dell'app).
const BG = "#18181b"
const KEY_BG = "#26262b"
const KEY_BORDER = "#3f3f46"
const MUTED = "#a1a1aa"
const FG = "#faf9f5"

function pxW(w: number): number {
  return w * UNIT + (w - 1) * GAP
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// Testo a contrasto (chiaro/scuro) su uno sfondo colorato — come contrastText UI.
function contrastText(hex: string): string {
  const c = hex.replace("#", "")
  if (c.length < 6) return FG
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? "#141413" : FG
}

// Riquadri (in px) per un tasto con N binding: 1 pieno, 2 sopra/sotto, 3 due in
// alto + fascia in basso, 4 griglia 2×2. Stessa logica di colorRects della UI.
function colorRectsPx(
  x: number, y: number, w: number, h: number, n: number
): { x: number; y: number; w: number; h: number }[] {
  const halfW = w / 2
  const halfH = h / 2
  const TL = { x, y, w: halfW, h: halfH }
  const TR = { x: x + halfW, y, w: halfW, h: halfH }
  const BL = { x, y: y + halfH, w: halfW, h: halfH }
  const BR = { x: x + halfW, y: y + halfH, w: halfW, h: halfH }
  const TOP = { x, y, w, h: halfH }
  const BOTTOM = { x, y: y + halfH, w, h: halfH }
  const FULL = { x, y, w, h }
  switch (n) {
    case 1: return [FULL]
    case 2: return [TOP, BOTTOM]
    case 3: return [TL, TR, BOTTOM]
    default: return [TL, TR, BL, BR]
  }
}

interface Binding {
  action: string
  color: string
  category: string
  layer: number
}

// --- Layer (livelli della mappa) -------------------------------------------
// Stessa semantica della UI: livello assente o non valido = 1 (mappe salvate
// prima dei layer), e il numero di livelli non scende mai sotto il massimo
// davvero usato dai binding.

function layerOf(kb: keybind): number {
  const n = kb.layer ?? 1
  return Number.isInteger(n) && n >= 1 ? n : 1
}

export function layerCountOf(map: keybindMap): number {
  const used = map.keybinds.reduce((max, kb) => Math.max(max, layerOf(kb)), 1)
  return Math.max(map.layerCount ?? 1, used)
}

interface PlacedKey {
  x: number
  y: number
  w: number
  h: number
  def: KeyDef
  bindings: Binding[]
}

interface Block {
  keys: PlacedKey[]
  width: number
  height: number
}

// Dispone una lista di righe (con spacer) in tasti posizionati.
function placeRows(
  rows: KeyboardItem[][],
  bindingsFor: (id: string) => Binding[]
): Block {
  const keys: PlacedKey[] = []
  let y = 0
  let maxW = 0
  for (const row of rows) {
    let x = 0
    let rowH = UNIT
    for (const item of row) {
      if (isSpacer(item)) {
        x += pxW(item.spacer) + GAP
        continue
      }
      const w = pxW(item.w ?? 1)
      const h = item.tall ? 2 * UNIT + GAP : UNIT
      keys.push({ x, y, w, h, def: item, bindings: bindingsFor(item.id) })
      rowH = Math.max(rowH, h)
      x += w + GAP
    }
    maxW = Math.max(maxW, x - GAP)
    y += rowH + GAP
  }
  return { keys, width: maxW, height: y - GAP }
}

// Dispone una colonna verticale di tasti (numpad side, mouse).
function placeColumn(
  items: KeyDef[],
  bindingsFor: (id: string) => Binding[]
): Block {
  const keys: PlacedKey[] = []
  let y = 0
  let maxW = 0
  for (const item of items) {
    const w = pxW(item.w ?? 1)
    const h = item.tall ? 2 * UNIT + GAP : UNIT
    keys.push({ x: 0, y, w, h, def: item, bindings: bindingsFor(item.id) })
    maxW = Math.max(maxW, w)
    y += h + GAP
  }
  return { keys, width: maxW, height: y - GAP }
}

// Sposta un blocco di un offset (dx, dy).
function offset(block: Block, dx: number, dy: number): PlacedKey[] {
  return block.keys.map((k) => ({ ...k, x: k.x + dx, y: k.y + dy }))
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, Math.max(1, maxChars - 1)) + "…" : text
}

// Quanti caratteri stanno in una riga del tasto. Il testo NON scala col tasto,
// quindi il budget dipende solo dalla larghezza disponibile e dal corpo usato
// (≈0.58em di larghezza media per un sans-serif); con il tasto passato a 54px
// entra più testo di prima, che è il senso dell'ingrandimento.
function maxCharsFor(w: number, fontPx = 9): number {
  return Math.max(3, Math.floor((w - 6) / (fontPx * 0.58)))
}

/**
 * Spezza l'azione su DUE righe come il `line-clamp-2` della UI: prima si
 * riempie la riga con parole intere, il resto va nella seconda (troncata).
 * Una parola unica troppo lunga viene tagliata in due pezzi.
 */
function wrapTwoLines(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    let first = ""
    let i = 0
    while (i < words.length) {
      const next = first ? `${first} ${words[i]}` : words[i]
      if (next.length > maxChars) break
      first = next
      i++
    }
    if (first && i < words.length) return [first, truncate(words.slice(i).join(" "), maxChars)]
    if (first) return [first]
  }
  return [text.slice(0, maxChars), truncate(text.slice(maxChars), maxChars)]
}

/** Stato "tasto libero": fondo muted + sola etichetta del tasto. */
function emptyKeySvg(k: PlacedKey): string {
  const { x, y, w, h, def } = k
  const cx = x + w / 2
  const cy = y + h / 2
  const rect = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${RADIUS}" fill="${KEY_BG}" stroke="${KEY_BORDER}"/>`
  // Etichetta su due righe quando serve ("Scroll Lock" non sta su un tasto 1u):
  // nella UI il testo va a capo dentro il tasto, troncarlo qui sarebbe peggio.
  const lines = wrapTwoLines(def.label, maxCharsFor(w, 10))
  const text =
    lines.length > 1
      ? `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="10" fill="${MUTED}">${esc(lines[0])}</text>` +
        `<text x="${cx}" y="${cy + 9}" text-anchor="middle" font-size="10" fill="${MUTED}">${esc(lines[1])}</text>`
      : `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="10" fill="${MUTED}">${esc(lines[0])}</text>`
  return rect + text
}

/** Sfondo colorato + testo per una lista di binding sullo stesso tasto. */
function boundKeySvg(k: PlacedKey, bindings: Binding[], clipId: string): string {
  const { x, y, w, h, def } = k
  const parts: string[] = []
  const cx = x + w / 2
  const maxChars = maxCharsFor(w)
  const labelChars = maxCharsFor(w, 8)

  if (bindings.length > 1) {
    // Più binding sullo stesso tasto: riquadri, un colore per binding (come la
    // vista "tutti i livelli" della UI).
    const rects = colorRectsPx(x, y, w, h, bindings.length)
    parts.push(
      `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${RADIUS}"/></clipPath>`
    )
    parts.push(`<g clip-path="url(#${clipId})">`)
    rects.forEach((r, i) => {
      parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${bindings[i].color}"/>`)
    })
    parts.push(`</g>`)
  } else {
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${RADIUS}" fill="${bindings[0].color}"/>`)
  }
  parts.push(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${RADIUS}" fill="none" stroke="rgba(0,0,0,0.25)"/>`
  )

  if (bindings.length > 1) {
    parts.push(
      `<text x="${cx}" y="${y + h / 2 - 2}" text-anchor="middle" font-size="11" font-weight="600" fill="${FG}" style="paint-order:stroke;stroke:rgba(0,0,0,0.7);stroke-width:2px">×${bindings.length}</text>`
    )
    parts.push(
      `<text x="${cx}" y="${y + h / 2 + 10}" text-anchor="middle" font-size="8" fill="${FG}" style="paint-order:stroke;stroke:rgba(0,0,0,0.7);stroke-width:2px">${esc(truncate(def.label, labelChars))}</text>`
    )
  } else {
    // Azione su una o due righe, come il `line-clamp-2` della UI: nel tasto più
    // grande ci sta, ed è lo spazio guadagnato con l'ingrandimento.
    const tc = contrastText(bindings[0].color)
    const lines = wrapTwoLines(bindings[0].action, maxChars)
    if (lines.length > 1) {
      parts.push(
        `<text x="${cx}" y="${y + h / 2 - 7}" text-anchor="middle" font-size="9" font-weight="500" fill="${tc}">${esc(lines[0])}</text>`
      )
      parts.push(
        `<text x="${cx}" y="${y + h / 2 + 3}" text-anchor="middle" font-size="9" font-weight="500" fill="${tc}">${esc(lines[1])}</text>`
      )
      parts.push(
        `<text x="${cx}" y="${y + h / 2 + 15}" text-anchor="middle" font-size="8" fill="${tc}" opacity="0.75">${esc(truncate(def.label, labelChars))}</text>`
      )
    } else {
      parts.push(
        `<text x="${cx}" y="${y + h / 2 - 1}" text-anchor="middle" font-size="9" font-weight="500" fill="${tc}">${esc(lines[0])}</text>`
      )
      parts.push(
        `<text x="${cx}" y="${y + h / 2 + 10}" text-anchor="middle" font-size="8" fill="${tc}" opacity="0.75">${esc(truncate(def.label, labelChars))}</text>`
      )
    }
  }
  return parts.join("")
}

/**
 * Angolo piegato in alto a destra: come nella UI segnala che il tasto ha altri
 * binding che questa vista non mostra (su un altro livello).
 */
function foldedCornerSvg(k: PlacedKey, onColor: boolean): string {
  const { x, y, w } = k
  const s = 10
  const fill = onColor ? "rgba(255,255,255,0.75)" : MUTED
  return `<path d="M${x + w - s} ${y} L${x + w} ${y} L${x + w} ${y + s} Z" fill="${fill}"/>`
}

interface KeyRenderOptions {
  // true = HTML interattivo: emette anche gli stati alternativi (tasto libero e
  // "solo una mod") che il CSS scambia al volo. Per il PNG restano fuori: lì
  // l'SVG è statico e ogni gruppo in più verrebbe rasterizzato uno sopra l'altro.
  interactive: boolean
  // Emette un gruppo `solo` per binding (colore pieno su tutto il tasto): è la
  // VISTA ISOLATA della UI, quella che con un filtro attivo mostra solo i binding
  // che corrispondono invece di attenuare gli altri.
  solo: boolean
  // Prefisso per gli id di clipPath: nell'HTML convivono più SVG nello stesso
  // documento e gli id devono restare unici.
  idPrefix: string
  // Livelli, diversi da quello mostrato, su cui il tasto ha altri binding.
  otherLayers: (id: string) => number[]
}

function keyToSvg(k: PlacedKey, o: KeyRenderOptions): string {
  const { def, bindings } = k
  const styled = bindings.length > 0
  const parts: string[] = []

  // Stato "libero": per un tasto senza binding è l'unico contenuto; nell'HTML
  // viene emesso anche per i tasti occupati, perché è ciò che si vede quando il
  // filtro esclude i loro binding.
  if (!styled || o.interactive) {
    parts.push(`<g class="off">${emptyKeySvg(k)}</g>`)
  }
  if (styled) {
    parts.push(`<g class="on">${boundKeySvg(k, bindings, `${o.idPrefix}-${def.id}`)}</g>`)
    if (o.solo) {
      // Un gruppo per binding: il CSS ne mostra al massimo uno, quello della mod
      // filtrata. Il colore riempie tutto il tasto, come nella UI isolata.
      bindings.forEach((b, i) => {
        parts.push(
          `<g class="solo" data-cat="${esc(b.category)}">${boundKeySvg(k, [b], `${o.idPrefix}-solo${i}-${def.id}`)}</g>`
        )
      })
    }
  }

  const extra = o.otherLayers(def.id)
  if (extra.length > 0) parts.push(foldedCornerSvg(k, styled))

  // Tooltip nativo + attributi per filtro e click (usati dall'HTML interattivo).
  // `data-b` è la lista dei binding (JSON) letta al click per la finestra di
  // dettaglio; `data-key` è la label del tasto.
  const cats = [...new Set(bindings.map((b) => b.category))]
  const title = [
    styled ? bindings.map((b) => `${b.action} — ${b.category}`).join("\n") : null,
    extra.length > 0 ? `Also on: ${extra.map((n) => `L${n}`).join(", ")}` : null,
    `(${def.label})`,
  ]
    .filter(Boolean)
    .join("\n")
  const bJson = bindings.map((b) => ({ a: b.action, m: b.category, c: b.color, l: b.layer }))

  return (
    `<g class="k${styled ? "" : " empty"}" data-cats="${esc(cats.join("|"))}" data-key="${esc(def.label)}" ` +
    `data-b="${esc(JSON.stringify(bJson))}"><title>${esc(title)}</title>${parts.join("")}</g>`
  )
}

// Etichetta di un blocco (Keyboard / Numpad / Mouse).
function blockLabel(text: string, x: number, y: number): string {
  return `<text x="${x}" y="${y}" font-size="11" fill="${MUTED}" font-family="sans-serif">${esc(text)}</text>`
}

export interface KeyboardVisualLabels {
  keyboard: string
  numpad: string
  mouse: string
}

const DEFAULT_LABELS: KeyboardVisualLabels = { keyboard: "Keyboard", numpad: "Numpad", mouse: "Mouse" }

export interface KeyboardSvgResult {
  svg: string
  width: number
  height: number
  boundCount: number
}

export interface KeyboardSvgOptions {
  // Se true, disegna sotto la tastiera una legenda (pastiglia colore → nome mod)
  // per le mod usate nella mappa. Usato per l'immagine PNG (l'HTML ha invece una
  // legenda interattiva propria).
  legend?: boolean
  legendLabel?: string // titolo della legenda (default "Legend")
  // Livello mostrato, come la lista livelli della pagina Keybinds: un numero =
  // solo i binding di quel livello (i tasti usati su altri livelli prendono
  // l'angolo piegato), "all" = tutti insieme, con i riquadri sui tasti condivisi.
  // Default "all": è il comportamento storico, quindi il PNG non cambia.
  layer?: number | "all"
  // Stati alternativi per l'HTML interattivo (vista isolata coi filtri). Vedi
  // `KeyRenderOptions`.
  interactive?: boolean
  solo?: boolean
  idPrefix?: string
  // Titolo disegnato sopra la tastiera (es. "Tech & Armi — Layer 2"). Serve alle
  // immagini dell'archivio PNG: senza, le tastiere dei vari livelli sarebbero
  // distinguibili solo dal nome del file.
  caption?: string
}

// Costruisce l'SVG della tastiera per una mappa. `labels` permette di localizzare
// le etichette dei tre blocchi (opzionale, default inglese).
export function buildKeyboardSvg(
  map: keybindMap,
  categories: keybindCategory[],
  labels: KeyboardVisualLabels = DEFAULT_LABELS,
  opts: KeyboardSvgOptions = {}
): KeyboardSvgResult {
  const colorOf = (name: string) => categories.find((c) => c.name === name)?.color ?? "#888888"
  const layer = opts.layer ?? "all"

  // Raggruppa i binding per tasto. Con un livello selezionato entrano solo i suoi
  // binding: è così che il tasto mostra un colore pieno invece dei riquadri.
  const byKey = new Map<string, Binding[]>()
  // Tutti i livelli occupati da ciascun tasto, per l'angolo piegato.
  const layersByKey = new Map<string, Set<number>>()
  for (const kb of map.keybinds) {
    const lv = layerOf(kb)
    const seen = layersByKey.get(kb.key) ?? new Set<number>()
    seen.add(lv)
    layersByKey.set(kb.key, seen)
    if (layer !== "all" && lv !== layer) continue
    const arr = byKey.get(kb.key) ?? []
    arr.push({ action: kb.action, color: colorOf(kb.category), category: kb.category, layer: lv })
    byKey.set(kb.key, arr)
  }
  const bindingsFor = (id: string) => byKey.get(id) ?? []
  const boundCount = [...byKey.values()].reduce((n, arr) => n + arr.length, 0)
  const otherLayers = (id: string): number[] =>
    layer === "all"
      ? []
      : [...(layersByKey.get(id) ?? [])].filter((n) => n !== layer).sort((a, b) => a - b)

  const renderOpts: KeyRenderOptions = {
    interactive: opts.interactive ?? false,
    solo: opts.solo ?? false,
    idPrefix: opts.idPrefix ?? "k",
    otherLayers,
  }

  // Blocchi.
  const main = placeRows(MAIN_ROWS, bindingsFor)
  const numGrid = placeRows(NUMPAD_ROWS, bindingsFor)
  const numSide = placeColumn(NUMPAD_SIDE, bindingsFor)
  const mouse = placeColumn(MOUSE_KEYS, bindingsFor)

  // Con una caption tutto scende di una riga: le etichette dei blocchi stanno
  // già a destra fino al bordo, quindi il titolo non può condividere quella riga.
  const captionH = opts.caption ? 26 : 0
  const contentTop = TITLE_H + PAD + captionH

  // Main a sinistra.
  const mainX = PAD
  const mainKeys = offset(main, mainX, contentTop)

  // Numpad (griglia + colonna laterale) a destra del main.
  const numpadX = mainX + main.width + BLOCK_GAP
  const numGridKeys = offset(numGrid, numpadX, contentTop)
  const numSideKeys = offset(numSide, numpadX + numGrid.width + GAP, contentTop)
  const numpadWidth = numGrid.width + GAP + numSide.width

  // Mouse a destra del numpad.
  const mouseX = numpadX + numpadWidth + BLOCK_GAP
  const mouseKeys = offset(mouse, mouseX, contentTop)

  const allKeys = [...mainKeys, ...numGridKeys, ...numSideKeys, ...mouseKeys]

  const keyboardHeight = Math.max(main.height, numGrid.height, numSide.height, mouse.height)
  const totalWidth = mouseX + mouse.width + PAD
  const keyboardBottom = contentTop + keyboardHeight

  // Legenda opzionale (per il PNG): pastiglia colore → nome mod, per le mod usate.
  let legendSvg = ""
  let legendBottom = keyboardBottom
  if (opts.legend) {
    const usedCats = new Set(map.keybinds.map((k) => k.category))
    const legendCats = categories.filter((c) => usedCats.has(c.name))
    if (legendCats.length) {
      const swatch = 12
      const chipH = 16
      const chipGap = 14
      const rowGap = 8
      const charW = 6.3
      const label = opts.legendLabel ?? "Legend"
      const parts: string[] = [
        `<text x="${PAD}" y="${keyboardBottom + 24}" font-size="12" font-weight="600" fill="${MUTED}">${esc(label)}</text>`,
      ]
      let lx = PAD
      let ly = keyboardBottom + 24 + 20
      for (const c of legendCats) {
        const chipW = swatch + 6 + Math.ceil(c.name.length * charW)
        if (lx + chipW > totalWidth - PAD && lx > PAD) {
          lx = PAD
          ly += chipH + rowGap
        }
        parts.push(`<rect x="${lx}" y="${ly}" width="${swatch}" height="${swatch}" rx="3" fill="${c.color}"/>`)
        parts.push(
          `<text x="${lx + swatch + 6}" y="${ly + swatch - 1}" font-size="11" fill="${FG}">${esc(c.name)}</text>`
        )
        lx += chipW + chipGap
      }
      legendSvg = parts.join("\n")
      legendBottom = ly + chipH
    }
  }

  const totalHeight = legendBottom + PAD

  const captionSvg = opts.caption
    ? `<text x="${PAD}" y="${TITLE_H}" font-size="15" font-weight="600" fill="${FG}">${esc(opts.caption)}</text>`
    : ""

  const body = [
    captionSvg,
    blockLabel(labels.keyboard, mainX, TITLE_H + captionH),
    blockLabel(labels.numpad, numpadX, TITLE_H + captionH),
    blockLabel(labels.mouse, mouseX, TITLE_H + captionH),
    ...allKeys.map((k) => keyToSvg(k, renderOpts)),
    legendSvg,
  ].join("\n")

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" ` +
    `viewBox="0 0 ${totalWidth} ${totalHeight}" font-family="sans-serif">` +
    `<rect width="${totalWidth}" height="${totalHeight}" fill="${BG}"/>` +
    body +
    `</svg>`

  return { svg, width: totalWidth, height: totalHeight, boundCount }
}

export interface KeyboardHtmlLabels extends KeyboardVisualLabels {
  title: string        // titolo della pagina/heading (es. "Keybinds — <mappa>")
  filterMods: string   // etichetta gruppo filtro mod
  filterTags: string   // etichetta gruppo filtro tag
  all: string          // voce "tutte"
  legend: string       // titolo legenda
  actions: string      // titolo della finestra di dettaglio (click su un tasto)
  layers: string       // etichetta gruppo livelli
  layer: string        // nome di un livello, con "{n}" (es. "Layer {n}")
  allLayers: string    // voce "tutti i livelli"
  isolated: string     // nota mostrata quando un filtro è attivo
}

const DEFAULT_HTML_LABELS: KeyboardHtmlLabels = {
  ...DEFAULT_LABELS,
  title: "Keybinds",
  filterMods: "Mods",
  filterTags: "Tags",
  all: "All",
  legend: "Legend",
  actions: "Actions",
  layers: "Layers",
  layer: "Layer {n}",
  allLayers: "All layers",
  isolated: "With a filter on, only the matching bindings are shown, across all layers.",
}

// Costruisce un documento HTML autonomo e interattivo (sola visualizzazione),
// allineato alla pagina Keybinds dell'app:
//  - un SVG per LIVELLO (più uno con tutti i livelli insieme) e un selettore in
//    cima: si guarda un livello per volta, come nella UI;
//  - filtri mod/tag che ISOLANO invece di attenuare — il tasto mostra solo i
//    binding che corrispondono, gli altri tornano "liberi";
//  - angolo piegato sui tasti usati anche su altri livelli;
//  - click su un tasto → finestra col dettaglio dei binding.
//
// Tutti gli stati sono pre-renderizzati e vengono scambiati dal CSS: il file non
// contiene un motore di disegno, quindi resta un artefatto statico e apribile
// offline in qualsiasi browser.
export function buildKeyboardHtml(
  map: keybindMap,
  categories: keybindCategory[],
  labels: Partial<KeyboardHtmlLabels> = {}
): string {
  const L = { ...DEFAULT_HTML_LABELS, ...labels }

  // Una vista per livello, più quella con tutti i livelli insieme. Con una mappa
  // a un solo livello la seconda è identica alla prima: si tiene solo "all" e il
  // selettore non compare (è il caso delle mappe salvate prima dei layer).
  const layerCount = layerCountOf(map)
  const layerViews: (number | "all")[] =
    layerCount > 1 ? [...Array.from({ length: layerCount }, (_, i) => i + 1), "all"] : ["all"]
  const perLayerCount = (n: number) => map.keybinds.filter((kb) => layerOf(kb) === n).length

  const views = layerViews
    .map((lv) => {
      // I gruppi "solo" (vista isolata) servono solo in "all": con un filtro
      // attivo la UI appiattisce i livelli, quindi è là che si va a guardare.
      const { svg } = buildKeyboardSvg(map, categories, L, {
        layer: lv,
        interactive: true,
        solo: lv === "all",
        idPrefix: `v${lv}`,
      })
      const active = lv === layerViews[0] ? " active" : ""
      return `<div class="view${active}" data-view="${lv}">${svg}</div>`
    })
    .join("\n")

  const layerButtons =
    layerCount > 1
      ? [
          ...Array.from({ length: layerCount }, (_, i) => i + 1).map(
            (n) =>
              `<button class="chip${n === 1 ? " active" : ""}" data-layer="${n}">${esc(
                L.layer.replace("{n}", String(n))
              )}<span class="n">${perLayerCount(n)}</span></button>`
          ),
          `<button class="chip" data-layer="all">${esc(L.allLayers)}<span class="n">${map.keybinds.length}</span></button>`,
        ].join("")
      : ""

  // Categorie effettivamente usate nella mappa (per la legenda mod).
  const usedCats = new Set(map.keybinds.map((k) => k.category))
  const legendCats = categories.filter((c) => usedCats.has(c.name))
  // Tag delle categorie usate (per la legenda tag).
  const usedTags = new Set<string>()
  for (const c of legendCats) for (const tg of c.tags ?? []) usedTags.add(tg)

  // data-tags per ogni tasto è calcolato via JS dai data-cats + la mappa cat→tag.
  const catTags: Record<string, string[]> = {}
  for (const c of categories) catTags[c.name] = c.tags ?? []

  const modButtons = [
    `<button class="chip active" data-mod="all">${esc(L.all)}</button>`,
    ...legendCats.map(
      (c) =>
        `<button class="chip" data-mod="${esc(c.name)}"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</button>`
    ),
  ].join("")

  const tagButtons = usedTags.size
    ? [
        `<button class="chip active" data-tag="all">${esc(L.all)}</button>`,
        ...[...usedTags].map((tg) => `<button class="chip" data-tag="${esc(tg)}">${esc(tg)}</button>`),
      ].join("")
    : ""

  const style = `
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; background: ${BG}; color: ${FG}; font-family: system-ui, sans-serif; padding: 24px; }
    h1 { font-size: 18px; margin: 0 0 16px; font-weight: 600; }
    .filters { margin-bottom: 16px; }
    .filters .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
    .filters .label { width: 48px; font-size: 12px; color: ${MUTED}; }
    .chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid ${KEY_BORDER};
      background: transparent; color: ${FG}; border-radius: 999px; padding: 4px 12px; font-size: 12px;
      cursor: pointer; font-family: inherit; }
    .chip.active { background: ${FG}; color: ${BG}; border-color: transparent; }
    .chip .dot { width: 10px; height: 10px; border-radius: 999px; }
    .chip .n { opacity: .55; font-size: 11px; }
    .hint { margin: 4px 0 0; font-size: 11px; color: ${MUTED}; display: none; }
    .hint.show { display: block; }
    .board { overflow-x: auto; border: 1px solid ${KEY_BORDER}; border-radius: 12px; padding: 8px; width: fit-content; max-width: 100%; }
    /* Una vista per livello: si mostra una sola alla volta (come la lista livelli
       della UI, che fa vedere un livello per volta invece di sovrapporli). */
    .view { display: none; }
    .view.active { display: block; }
    .k.clickable { cursor: pointer; }
    /* VISTA ISOLATA. Ogni tasto porta pre-renderizzati: lo stato colorato (.on),
       lo stato libero (.off) e un gruppo per binding (.solo). Col filtro attivo si
       nasconde .on e si mostra il solo che corrisponde — oppure .off se sul tasto
       non c'è nulla che corrisponde. Nessun disegno lato JS. */
    .k .off, .k .solo { display: none; }
    .k.empty .off { display: inline; }
    .k.iso .on { display: none; }
    .k.iso-off .off { display: inline; }
    .k .solo.match { display: inline; }
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: none; align-items: center; justify-content: center; z-index: 50; }
    .overlay.open { display: flex; }
    .modal { background: ${KEY_BG}; border: 1px solid ${KEY_BORDER}; border-radius: 12px; padding: 16px 20px; min-width: 260px; max-width: 90vw; max-height: 80vh; overflow: auto; box-shadow: 0 10px 40px rgba(0,0,0,.5); }
    .modal .head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
    .modal h2 { margin: 0; font-size: 15px; font-weight: 600; }
    .modal .keycap { font-size: 12px; color: ${MUTED}; }
    .modal .close { cursor: pointer; color: ${MUTED}; border: none; background: none; font-size: 20px; line-height: 1; padding: 0 4px; }
    .modal .binding { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid ${KEY_BORDER}; }
    .modal .binding:first-of-type { border-top: none; }
    .modal .binding .dot { width: 12px; height: 12px; border-radius: 3px; flex: none; }
    .modal .binding .act { font-weight: 500; }
    .modal .binding .mod { color: ${MUTED}; font-size: 12px; }
    .modal .binding .lv { margin-left: auto; padding-left: 12px; color: ${MUTED}; font-size: 11px; white-space: nowrap; }
  `.trim()

  const script = `
    (function () {
      var catTags = ${JSON.stringify(catTags)};
      var mod = 'all', tag = 'all', layer = ${layerCount > 1 ? "'1'" : "'all'"};
      var hint = document.getElementById('hint');

      // Una categoria corrisponde al filtro se passa sia il filtro mod sia quello
      // tag (AND tra i due, come nella UI).
      function catMatches(c) {
        if (mod !== 'all' && c !== mod) return false;
        if (tag !== 'all' && (catTags[c] || []).indexOf(tag) < 0) return false;
        return true;
      }

      function apply() {
        var filtered = mod !== 'all' || tag !== 'all';
        // Con un filtro attivo si guarda la vista con TUTTI i livelli: è quello
        // che fa la UI (appiattisce, perché il sottoinsieme è già piccolo).
        var view = filtered ? 'all' : layer;
        document.querySelectorAll('.view').forEach(function (v) {
          v.classList.toggle('active', v.getAttribute('data-view') === view);
        });
        if (hint) hint.classList.toggle('show', filtered);

        document.querySelectorAll('.k').forEach(function (k) {
          k.classList.remove('iso', 'iso-off');
          k.querySelectorAll('.solo').forEach(function (s) { s.classList.remove('match'); });
          if (!filtered) return;
          k.classList.add('iso');
          // Primo binding del tasto che corrisponde: il suo gruppo prende tutto il
          // tasto a colore pieno. Se due mod filtrate insieme (via tag) occupano lo
          // stesso tasto si mostra il primo — la finestra al click elenca comunque
          // tutti i binding, quindi non si perde nulla.
          var match = null;
          k.querySelectorAll('.solo').forEach(function (s) {
            if (!match && catMatches(s.getAttribute('data-cat'))) match = s;
          });
          if (match) match.classList.add('match');
          else k.classList.add('iso-off');
        });
      }

      document.querySelectorAll('[data-mod]').forEach(function (b) {
        b.addEventListener('click', function () {
          mod = b.getAttribute('data-mod');
          document.querySelectorAll('[data-mod]').forEach(function (x) { x.classList.toggle('active', x === b); });
          apply();
        });
      });
      document.querySelectorAll('[data-tag]').forEach(function (b) {
        b.addEventListener('click', function () {
          tag = b.getAttribute('data-tag');
          document.querySelectorAll('[data-tag]').forEach(function (x) { x.classList.toggle('active', x === b); });
          apply();
        });
      });
      document.querySelectorAll('[data-layer]').forEach(function (b) {
        b.addEventListener('click', function () {
          layer = b.getAttribute('data-layer');
          document.querySelectorAll('[data-layer]').forEach(function (x) { x.classList.toggle('active', x === b); });
          apply();
        });
      });

      // Click su un tasto con binding → finestra con azioni + mod (+ livello,
      // quando la mappa ne ha più di uno).
      var showLayers = ${layerCount > 1 ? "true" : "false"};
      var layerLabel = ${JSON.stringify(L.layer)};
      var overlay = document.getElementById('ov');
      var modalKey = document.getElementById('mk');
      var modalBody = document.getElementById('mb');
      function closeModal() { overlay.classList.remove('open'); }
      function openModal(keyLabel, bindings) {
        modalKey.textContent = keyLabel;
        modalBody.innerHTML = '';
        bindings.slice().sort(function (a, b) { return (a.l || 1) - (b.l || 1); }).forEach(function (b) {
          var row = document.createElement('div'); row.className = 'binding';
          var dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = b.c;
          var act = document.createElement('span'); act.className = 'act'; act.textContent = b.a;
          var owner = document.createElement('span'); owner.className = 'mod'; owner.textContent = '— ' + b.m;
          row.appendChild(dot); row.appendChild(act); row.appendChild(owner);
          if (showLayers) {
            var lv = document.createElement('span'); lv.className = 'lv';
            lv.textContent = layerLabel.replace('{n}', String(b.l || 1));
            row.appendChild(lv);
          }
          modalBody.appendChild(row);
        });
        overlay.classList.add('open');
      }
      // I binding di un tasto sono gli stessi in tutte le viste: si legge il
      // data-b del gruppo cliccato, qualunque livello si stia guardando.
      // (Niente backtick nei commenti: siamo dentro un template literal.)
      document.querySelectorAll('.k').forEach(function (k) {
        var raw = k.getAttribute('data-b'); var arr = [];
        try { arr = JSON.parse(raw || '[]'); } catch (e) {}
        if (arr.length) {
          k.classList.add('clickable');
          k.addEventListener('click', function () { openModal(k.getAttribute('data-key') || '', arr); });
        }
      });
      document.getElementById('cl').addEventListener('click', closeModal);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

      apply();
    })();
  `.trim()

  const tagRow = tagButtons
    ? `<div class="row"><span class="label">${esc(L.filterTags)}</span>${tagButtons}</div>`
    : ""
  // La riga dei livelli compare solo se la mappa ne ha più di uno: su una mappa a
  // un livello sarebbe un selettore con una voce sola.
  const layerRow = layerButtons
    ? `<div class="row"><span class="label">${esc(L.layers)}</span>${layerButtons}</div>`
    : ""

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(L.title)} — ${esc(map.name)}</title>
<style>${style}</style>
</head>
<body>
<h1>${esc(L.title)} — ${esc(map.name)}</h1>
<div class="filters">
  <div class="row"><span class="label">${esc(L.filterMods)}</span>${modButtons}</div>
  ${tagRow}
  ${layerRow}
  <p class="hint" id="hint">${esc(L.isolated)}</p>
</div>
<div class="board">${views}</div>
<div class="overlay" id="ov">
  <div class="modal">
    <div class="head">
      <h2>${esc(L.actions)} <span class="keycap" id="mk"></span></h2>
      <button class="close" id="cl" aria-label="Close">×</button>
    </div>
    <div id="mb"></div>
  </div>
</div>
<script>${script}</script>
</body>
</html>
`
}
