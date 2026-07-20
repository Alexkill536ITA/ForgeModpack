// Rendering VISIVO della mappa dei tasti verso SVG e HTML interattivo. Funzioni
// PURE (nessun DOM, nessun I/O): replicano l'aspetto della tastiera della pagina
// Keybinds (blocchi Tastiera + Tastierino + Mouse, riquadri colorati per binding,
// un colore per mod). L'SVG è usato sia per l'HTML (inline) sia come sorgente da
// rasterizzare in PNG lato UI.

import { keybindCategory, keybindMap } from "../../model/models"
import {
  MAIN_ROWS,
  NUMPAD_ROWS,
  NUMPAD_SIDE,
  MOUSE_KEYS,
  KeyDef,
  KeyboardItem,
  isSpacer,
} from "../keyboard-layout"

// Dimensioni in px (coerenti con UNIT_REM=2.5 / GAP_REM=0.25 a 16px/rem).
const UNIT = 40
const GAP = 4
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

function keyToSvg(k: PlacedKey): string {
  const { x, y, w, h, def, bindings } = k
  const styled = bindings.length > 0
  const multi = bindings.length > 1
  const cx = x + w / 2

  const parts: string[] = []

  // Sfondo: riquadri colorati per i binding, oppure fondo "muted" per i tasti vuoti.
  if (styled) {
    const rects = colorRectsPx(x, y, w, h, bindings.length)
    const clipId = `clip-${def.id}`
    parts.push(
      `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${RADIUS}"/></clipPath>`
    )
    parts.push(`<g clip-path="url(#${clipId})">`)
    rects.forEach((r, i) => {
      parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${bindings[i].color}"/>`)
    })
    parts.push(`</g>`)
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${RADIUS}" fill="none" stroke="rgba(0,0,0,0.25)"/>`
    )
  } else {
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${RADIUS}" fill="${KEY_BG}" stroke="${KEY_BORDER}"/>`
    )
  }

  // Testo.
  const maxChars = Math.max(3, Math.floor(w / 6))
  if (multi) {
    const tc = FG
    parts.push(
      `<text x="${cx}" y="${y + h / 2 - 2}" text-anchor="middle" font-size="11" font-weight="600" fill="${tc}" style="paint-order:stroke;stroke:rgba(0,0,0,0.7);stroke-width:2px">×${bindings.length}</text>`
    )
    parts.push(
      `<text x="${cx}" y="${y + h / 2 + 10}" text-anchor="middle" font-size="8" fill="${tc}" style="paint-order:stroke;stroke:rgba(0,0,0,0.7);stroke-width:2px">${esc(truncate(def.label, maxChars))}</text>`
    )
  } else if (styled) {
    const tc = contrastText(bindings[0].color)
    parts.push(
      `<text x="${cx}" y="${y + h / 2 - 1}" text-anchor="middle" font-size="9" font-weight="500" fill="${tc}">${esc(truncate(bindings[0].action, maxChars))}</text>`
    )
    parts.push(
      `<text x="${cx}" y="${y + h / 2 + 10}" text-anchor="middle" font-size="8" fill="${tc}" opacity="0.75">${esc(truncate(def.label, maxChars))}</text>`
    )
  } else {
    parts.push(
      `<text x="${cx}" y="${y + h / 2 + 3}" text-anchor="middle" font-size="10" fill="${MUTED}">${esc(truncate(def.label, maxChars))}</text>`
    )
  }

  // Tooltip nativo + attributi per il filtro e per il click (usati dall'HTML
  // interattivo). `data-b` è la lista dei binding (JSON) letta al click per aprire
  // la finestra di dettaglio; `data-key` è la label del tasto.
  const cats = [...new Set(bindings.map((b) => b.category))]
  const title = styled
    ? bindings.map((b) => `${b.action} — ${b.category}`).join("\n") + `\n(${def.label})`
    : def.label
  const bJson = bindings.map((b) => ({ a: b.action, m: b.category, c: b.color }))

  return (
    `<g class="k" data-cats="${esc(cats.join("|"))}" data-key="${esc(def.label)}" ` +
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

  // Raggruppa i binding per tasto (max visualizzati: come la UI, i primi trovati).
  const byKey = new Map<string, Binding[]>()
  for (const kb of map.keybinds) {
    const arr = byKey.get(kb.key) ?? []
    arr.push({ action: kb.action, color: colorOf(kb.category), category: kb.category })
    byKey.set(kb.key, arr)
  }
  const bindingsFor = (id: string) => byKey.get(id) ?? []
  const boundCount = map.keybinds.length

  // Blocchi.
  const main = placeRows(MAIN_ROWS, bindingsFor)
  const numGrid = placeRows(NUMPAD_ROWS, bindingsFor)
  const numSide = placeColumn(NUMPAD_SIDE, bindingsFor)
  const mouse = placeColumn(MOUSE_KEYS, bindingsFor)

  const contentTop = TITLE_H + PAD

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

  const body = [
    blockLabel(labels.keyboard, mainX, TITLE_H),
    blockLabel(labels.numpad, numpadX, TITLE_H),
    blockLabel(labels.mouse, mouseX, TITLE_H),
    ...allKeys.map(keyToSvg),
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
}

const DEFAULT_HTML_LABELS: KeyboardHtmlLabels = {
  ...DEFAULT_LABELS,
  title: "Keybinds",
  filterMods: "Mods",
  filterTags: "Tags",
  all: "All",
  legend: "Legend",
  actions: "Actions",
}

// Costruisce un documento HTML autonomo e interattivo (sola visualizzazione):
// tastiera inline (SVG), tooltip nativi al passaggio del mouse, e legenda
// cliccabile per filtrare i tasti per mod e per tag (attenua i non corrispondenti).
export function buildKeyboardHtml(
  map: keybindMap,
  categories: keybindCategory[],
  labels: Partial<KeyboardHtmlLabels> = {}
): string {
  const L = { ...DEFAULT_HTML_LABELS, ...labels }
  const { svg } = buildKeyboardSvg(map, categories, L)

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
    .board { overflow-x: auto; border: 1px solid ${KEY_BORDER}; border-radius: 12px; padding: 8px; width: fit-content; max-width: 100%; }
    .k { transition: opacity .15s; }
    .k.dim { opacity: .15; }
    .k.clickable { cursor: pointer; }
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
  `.trim()

  const script = `
    (function () {
      var catTags = ${JSON.stringify(catTags)};
      var keys = Array.prototype.slice.call(document.querySelectorAll('.k'));
      var mod = 'all', tag = 'all';
      function apply() {
        keys.forEach(function (k) {
          var cats = (k.getAttribute('data-cats') || '').split('|').filter(Boolean);
          var tags = [];
          cats.forEach(function (c) { (catTags[c] || []).forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); }); });
          var okMod = mod === 'all' || cats.indexOf(mod) >= 0;
          var okTag = tag === 'all' || tags.indexOf(tag) >= 0;
          k.classList.toggle('dim', !(okMod && okTag));
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

      // Click su un tasto con binding → finestra con azioni + mod.
      var overlay = document.getElementById('ov');
      var modalTitle = document.getElementById('mt');
      var modalKey = document.getElementById('mk');
      var modalBody = document.getElementById('mb');
      function closeModal() { overlay.classList.remove('open'); }
      function openModal(keyLabel, bindings) {
        modalKey.textContent = keyLabel;
        modalBody.innerHTML = '';
        bindings.forEach(function (b) {
          var row = document.createElement('div'); row.className = 'binding';
          var dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = b.c;
          var act = document.createElement('span'); act.className = 'act'; act.textContent = b.a;
          var mod = document.createElement('span'); mod.className = 'mod'; mod.textContent = '— ' + b.m;
          row.appendChild(dot); row.appendChild(act); row.appendChild(mod);
          modalBody.appendChild(row);
        });
        overlay.classList.add('open');
      }
      keys.forEach(function (k) {
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
    })();
  `.trim()

  const tagRow = tagButtons
    ? `<div class="row"><span class="label">${esc(L.filterTags)}</span>${tagButtons}</div>`
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
</div>
<div class="board">${svg}</div>
<div class="overlay" id="ov">
  <div class="modal">
    <div class="head">
      <h2>${esc(L.actions)} <span class="keycap" id="mk"></span></h2>
      <button class="close" id="cl" aria-label="Close">×</button>
    </div>
    <div id="mt"></div>
    <div id="mb"></div>
  </div>
</div>
<script>${script}</script>
</body>
</html>
`
}
