"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { KeyboardIcon, MouseIcon, PlusIcon, Trash2Icon, MapIcon, XIcon, PencilIcon, SearchIcon, BoxesIcon, TagsIcon, DownloadIcon, UploadIcon, RefreshCcwIcon, ZapIcon, LayersIcon, CopyIcon } from "lucide-react"

import { ProjectGate } from "../../components/project-gate"
import { ExportDialog } from "../../components/keybinds/export-dialog"
import { ImportDialog } from "../../components/keybinds/import-dialog"
import { ImportReport, ImportIssueReason } from "../../lib/keybind-import"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { ScrollArea, ScrollBar } from "../../components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip"
import { Label } from "../../components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "../../components/ui/combobox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import {
  ColorPicker,
  ColorPickerSelection,
  ColorPickerHue,
  ColorPickerEyeDropper,
  ColorPickerOutput,
  ColorPickerFormat,
} from "../../components/ui/color-picker"
import { useAppDispatch, useAppSelector } from "../../redux/hooks"
import { updateProject } from "../../redux/project-slice"
import {
  selectKeybindActions,
  setKeybindActions,
  setKeybindActionsError,
  setKeybindActionsLoading,
} from "../../redux/keybind-actions-slice"
import { scannedMod, scannedKeybind } from "../../lib/mods-scan"
import { getModsScanForLoad, refreshModsScan } from "../../lib/mods-sync"
import { resolveScanHint } from "../../lib/forge-spec"
import { useBusy } from "../../lib/use-busy"
import { cn } from "../../lib/utils"
import { keybind, keybindCategory, keybindMap, keybindTag, macro, macroModifier, mod, project } from "../../model/models"
import {
  MAIN_ROWS,
  NUMPAD_ROWS,
  NUMPAD_SIDE,
  MOUSE_KEYS,
  ALL_KEYS,
  keyLabel,
  KeyDef,
  KeyboardItem,
  isSpacer,
} from "../../lib/keyboard-layout"
import { defaultKeybinds, defaultCategories, defaultTags, vanillaActions } from "../../lib/keybind-template"
import { useTranslation } from "@/src/i18n/i18n-provider"
import { useConfirm } from "../../providers/confirm-dialog-provider"

// Scala della tastiera. Un tasto base era 2.5rem (40px): troppo piccolo perché
// l'azione dentro il tasto stesse su due righe leggibili. Le misure della
// GRIGLIA (unità, gap, decorazioni del tasto) derivano da qui, così cambiando una
// sola costante si ingrandisce tutto insieme: scalarne solo una parte sfalserebbe
// `keyWidth` (che somma unità + gap) e i tasti larghi non starebbero più
// allineati alla griglia. I CORPI DEL TESTO restano fissi (vedi `KeyCap`): il
// tasto più grande serve a dare spazio all'azione, non a scriverla più grande.
const KEY_SCALE = 1.3
const UNIT_REM = 2.5 * KEY_SCALE
const GAP_REM = 0.25 * KEY_SCALE

/** Misura in px scalata come la griglia (decorazioni del tasto, non il testo). */
function scaledPx(base: number): string {
  return `${Math.round(base * KEY_SCALE * 100) / 100}px`
}

/** Spaziatura fra i tasti, in sync con `GAP_REM` (la usa anche `keyWidth`). */
const KEY_GAP_STYLE = { gap: `${GAP_REM}rem` }

// Mappa il motivo di scarto in import alla sotto-chiave i18n (risolta con t() al
// punto d'uso: t non può essere chiamata a livello modulo).
const REASON_KEY: Record<ImportIssueReason, string> = {
  "not-installed": "notInstalled",
  unmapped: "unmapped",
}

// Categorie NON-mod: solo queste mostrano le azioni vanilla nel dialog dei tasti
// (i default del template + la categoria "Vanilla" creata dall'import). Ogni
// altra category è trattata come una mod (azioni scansionate o input libero).
const VANILLA_CATEGORY_NAMES = new Set<string>([
  ...defaultCategories().map((c) => c.name),
  "Vanilla",
])

const DEFAULT_PALETTE = [
  "#417505", "#8c582a", "#1a6fa8", "#0e7a5c", "#e67e00", "#8b0000",
  "#c8a200", "#f39c12", "#9012ff", "#4eccc4", "#7c3aed", "#1d4ed8",
  "#be185d", "#0891b2", "#d97706",
]

function contrastText(hex: string): string {
  const c = hex.replace("#", "")
  if (c.length < 6) return "#faf9f5"
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? "#141413" : "#faf9f5"
}

function keyWidth(w: number): string {
  return `calc(${w} * ${UNIT_REM}rem + ${w - 1} * ${GAP_REM}rem)`
}

// Chip riutilizzabile (filtri mod/tag e selezione). `onEdit` mostra la matita.
function FilterChip({
  label, color, active, onClick, onEdit,
}: {
  label: string
  color?: string
  active: boolean
  onClick: () => void
  onEdit?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      style={active && color ? { background: color, color: contrastText(color), borderColor: "transparent" } : {}}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
        !active && "border-border",
        active && !color && "border-transparent bg-foreground text-background"
      )}
    >
      <button type="button" onClick={onClick} className="flex items-center gap-1.5">
        {!active && color && <span className="size-2.5 rounded-full" style={{ background: color }} />}
        {label}
      </button>
      {onEdit && (
        <button type="button" onClick={onEdit} className="-mr-1.5 ml-0.5 opacity-60 hover:opacity-100" aria-label={t("keybinds.editLabel", { label })}>
          <PencilIcon className="size-3" />
        </button>
      )}
    </div>
  )
}

/**
 * Striscia di chip su **due righe al massimo**, con scorrimento orizzontale.
 *
 * Serve alla barra dei filtri del blocco Keybinds, che sta **sopra la tastiera**:
 * lì una striscia a capo libero spingeva la tastiera fuori dallo schermo. La
 * griglia `grid-flow-col` + `grid-rows-2` riempie due righe e poi cresce **in
 * larghezza** — l'altezza è quindi limitata per costruzione, e l'eccedenza si
 * raggiunge scorrendo in orizzontale.
 *
 * Lo scorrimento è una **`ScrollArea`** (convenzione del progetto: le aree
 * scrollabili sono sempre `ScrollArea`, non `overflow-*` nativo), con la
 * `ScrollBar orientation="horizontal"` esplicita: il default del componente è
 * verticale. Il `pb-2.5` lascia alla barra lo spazio per non coprire i chip.
 *
 * NON è usata dalle card Mods/Tags in cima: quelle sono la lista di gestione del
 * progetto e vanno viste tutte in una volta, a capo libero.
 *
 * `label` e `leading` restano FUORI dall'area che scorre: l'etichetta della
 * striscia e il chip di reset ("Tutte") devono essere raggiungibili sempre, senza
 * tornare indietro con lo scroll.
 */
function ChipStrip({
  label, leading, children,
}: {
  label: string
  leading?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-10 shrink-0 pt-1 text-xs text-muted-foreground">{label}</span>
      {leading}
      <ScrollArea className="min-w-0 flex-1">
        <div className="grid w-max grid-flow-col grid-rows-2 items-center gap-2 pb-2.5">
          {children}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}

// Nessun massimo di binding per tasto: si distribuiscono sui livelli (uno per
// livello), e i livelli sono illimitati.

// ============================================================================
// LAYER (livelli della mappa)
// ============================================================================
//
// Un tasto può servire più azioni, ma mostrarle tutte insieme rende la tastiera
// illeggibile (tasti divisi in riquadri di colori diversi). I layer sono
// lucidi sovrapposti DENTRO la stessa mappa: si guarda un livello per volta e su
// ogni tasto compare un solo binding, a colore pieno. Il segno in alto a destra
// del tasto dice che lo stesso tasto è usato anche su altri livelli.

// Nessun limite al numero di livelli (né di binding per tasto): l'unico vincolo
// è che un livello parta da 1.

// Valore del selettore quando si vogliono vedere tutti i livelli insieme
// (vista "appiattita"): allora il tasto torna a dividersi in riquadri.
const ALL_LAYERS = "all" as const
type layerSelection = number | typeof ALL_LAYERS

/** Livello di un binding: assente o non valido = 1 (progetti pre-layer). */
function layerOf(binding: { layer?: number }): number {
  const n = binding.layer ?? 1
  return Number.isInteger(n) && n >= 1 ? n : 1
}

/**
 * Quanti livelli ha la mappa: il valore dichiarato, ma mai meno di quanti ne
 * servano ai binding già presenti (un import o una modifica a mano potrebbero
 * aver messo dei binding su livelli più alti di `layerCount`).
 */
function layerCountOf(map: keybindMap | undefined): number {
  if (!map) return 1
  const used = map.keybinds.reduce((max, kb) => Math.max(max, layerOf(kb)), 1)
  return Math.max(map.layerCount ?? 1, used)
}

// Riga del dialog di un tasto: come un keybind ma senza `key` (è il tasto in
// modifica) e con un `id` stabile, che serve al drag & drop tra livelli.
type draftBinding = {
  id: string
  action: string
  actionKey?: string
  category: string
  layer: number
}

// Valore della voce "nuovo livello" nella Select del livello: non è un numero,
// quindi non può collidere con un livello esistente.
const NEW_LAYER_VALUE = "new"

// I tasti modificatori non hanno senso come tasto BASE di una macro: esclusi dal
// selettore (il modificatore è scelto a parte).
const MODIFIER_KEY_IDS = new Set([
  "ctrlleft", "ctrlright", "shiftleft", "shiftright", "alt", "altgr", "winleft", "winright", "menu",
])

// Opzioni del tasto base di una macro (tutti i tasti tranne i modificatori),
// con id in coda per disambiguare le label duplicate (es. "Invio", "7").
const BASE_KEY_OPTIONS: { value: string; label: string }[] = ALL_KEYS
  .filter((k) => !MODIFIER_KEY_IDS.has(k.id))
  .map((k) => ({ value: k.id, label: `${k.label} (${k.id})` }))

// Suddivisione del tasto in riquadri, uno per binding:
//  1 → pieno; 2 → metà sopra / metà sotto; 3 → due quadranti in alto + fascia
//  intera in basso; 4 → griglia 2×2. Ritorna un rettangolo per colore.
function colorRects(colors: string[]): { top: string; left: string; width: string; height: string; background: string }[] {
  const TL = { top: "0", left: "0", width: "50%", height: "50%" }
  const TR = { top: "0", left: "50%", width: "50%", height: "50%" }
  const BL = { top: "50%", left: "0", width: "50%", height: "50%" }
  const BR = { top: "50%", left: "50%", width: "50%", height: "50%" }
  const TOP = { top: "0", left: "0", width: "100%", height: "50%" }
  const BOTTOM = { top: "50%", left: "0", width: "100%", height: "50%" }
  const FULL = { top: "0", left: "0", width: "100%", height: "100%" }

  let boxes: { top: string; left: string; width: string; height: string }[]
  switch (colors.length) {
    case 1: boxes = [FULL]; break
    case 2: boxes = [TOP, BOTTOM]; break
    case 3: boxes = [TL, TR, BOTTOM]; break
    default: boxes = [TL, TR, BL, BR]; break
  }
  return boxes.map((b, i) => ({ ...b, background: colors[i] }))
}

function KeyCap({
  def, bindings, onClick, hiddenLabel,
}: {
  def: KeyDef
  bindings: { action: string; color: string; category: string }[]
  onClick: () => void
  /**
   * Etichetta dei binding del tasto NON mostrati nella vista corrente (su un
   * altro livello, o esclusi dal filtro attivo). Presente = si disegna l'angolo
   * piegato e il testo finisce nel tooltip; assente = nessun binding nascosto.
   */
  hiddenLabel?: string
}) {
  const w = def.w ?? 1
  const styled = bindings.length > 0
  const multi = bindings.length > 1
  const rects = colorRects(bindings.map((b) => b.color))
  // Un solo binding: testo a contrasto sul colore. Più binding: testo chiaro con
  // ombra, leggibile sopra qualsiasi riquadro di colore.
  const textColor = bindings.length === 1 ? contrastText(bindings[0].color) : "#faf9f5"

  const cap = (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: keyWidth(w),
        height: def.tall ? `calc(2 * ${UNIT_REM}rem + ${GAP_REM}rem)` : `${UNIT_REM}rem`,
        ...(styled
          ? { color: textColor, borderColor: "transparent", ...(multi ? { textShadow: "0 1px 2px rgba(0,0,0,0.7)" } : {}) }
          : {}),
      }}
      className={cn(
        "relative flex shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border px-0.5 text-center transition-transform hover:z-10 hover:scale-105",
        !styled && "border-border bg-muted text-muted-foreground"
      )}
    >
      {/* Strato dei riquadri colorati (uno per binding) */}
      {styled && (
        <span aria-hidden className="pointer-events-none absolute inset-0">
          {rects.map((r, i) => (
            <span
              key={i}
              className="absolute"
              style={{ top: r.top, left: r.left, width: r.width, height: r.height, background: r.background }}
            />
          ))}
        </span>
      )}
      {/* Segno "ci sono binding nascosti": angolo piegato in alto a destra, come
          la punta di un foglio sotto. Serve a non perdere di vista i binding che
          la vista corrente non mostra (altro livello, o filtro attivo), senza
          sporcare il tasto di puntini. */}
      {hiddenLabel && (
        <span
          aria-hidden
          style={{ borderTopWidth: scaledPx(10), borderLeftWidth: scaledPx(10) }}
          className={cn(
            "pointer-events-none absolute top-0 right-0 z-20 border-l-transparent",
            styled ? "border-t-current opacity-70" : "border-t-foreground/50"
          )}
        />
      )}
      {/* Contenuto sopra i riquadri */}
      {/* I corpi del testo NON scalano con `KEY_SCALE`: il tasto più grande serve
          a dare spazio all'azione (più caratteri per riga, due righe intere), non
          a scrivere più in grande. */}
      <span className="relative z-10 flex flex-col items-center justify-center">
        {multi ? (
          <>
            <span className="text-[10px] leading-tight font-semibold">×{bindings.length}</span>
            <span className="text-[7.5px] leading-tight opacity-90">{def.label}</span>
          </>
        ) : (
          <>
            {styled && <span className="line-clamp-2 text-[9px] leading-tight font-medium">{bindings[0].action}</span>}
            <span className={cn("leading-tight", styled ? "text-[7.5px] opacity-75" : "text-[10px]")}>{def.label}</span>
          </>
        )}
      </span>
    </button>
  )

  // Tasto vuoto e senza binding nascosti: nessun tooltip, ripeterebbe soltanto
  // l'etichetta già scritta sul tasto (e sarebbero ~100 tooltip inutili).
  if (!styled && !hiddenLabel) return cap

  // Tooltip vero (Radix) invece del `title` nativo: quello arrivava dopo un
  // secondo, con il font di sistema e le righe separate da "\n", e sul tasto —
  // dove l'azione è troncata a due righe di 9px — è proprio il punto in cui serve
  // leggere per intero. Qui invece ogni binding ha il pallino del colore della
  // sua mod, così il tooltip spiega anche i riquadri del tasto.
  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>{cap}</TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="flex max-w-sm flex-col items-start gap-1.5 px-3 py-2 text-sm"
      >
        {styled && (
          <div className="flex flex-col gap-1.5">
            {bindings.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
                <span className="font-medium">{b.action}</span>
                <span className="text-xs opacity-60">{b.category}</span>
              </div>
            ))}
          </div>
        )}
        {hiddenLabel && <span className="text-xs opacity-70">{hiddenLabel}</span>}
        <span className="text-xs opacity-50">{def.label}</span>
      </TooltipContent>
    </Tooltip>
  )
}

function KeybindsBoard({ project }: { project: project }) {
  const dispatch = useAppDispatch()
  const { t } = useTranslation()
  // Conferma per l'unica azione che scrive su mappe diverse da quella attiva.
  const { confirm } = useConfirm()

  const [activeMap, setActiveMap] = useState(0)
  const [modFilter, setModFilter] = useState("all")
  const [tagFilter, setTagFilter] = useState("all")
  const [search, setSearch] = useState("")
  // Livello mostrato sulla tastiera (1 = primo livello, "all" = tutti insieme).
  const [activeLayer, setActiveLayer] = useState<layerSelection>(1)

  // Dialog binding: una riga per binding con azione, mod e livello (nessun
  // massimo). `id` è stabile per il drag & drop tra livelli.
  const [editing, setEditing] = useState<KeyDef | null>(null)
  const [draftBindings, setDraftBindings] = useState<draftBinding[]>([])
  // Livelli visibili nel dialog: possono superare quelli della mappa quando
  // l'utente ne crea uno nuovo da lì (viene salvato col binding).
  const [draftLayers, setDraftLayers] = useState(1)

  // Dialog Add/Edit Mod (editingMod = nome originale in modifica, null in aggiunta).
  const [modOpen, setModOpen] = useState(false)
  const [editingMod, setEditingMod] = useState<string | null>(null)
  const [modName, setModName] = useState("")
  const [modColor, setModColor] = useState(DEFAULT_PALETTE[0])
  const [modTags, setModTags] = useState<string[]>([])

  // Dialog Add/Edit Tag.
  const [tagOpen, setTagOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [tagName, setTagName] = useState("")

  // Dialog Add/Edit Map.
  const [mapOpen, setMapOpen] = useState(false)
  const [editingMapIndex, setEditingMapIndex] = useState<number | null>(null)
  const [mapName, setMapName] = useState("")

  // Dialog Add/Edit Macro (editingMacroIndex = indice in current.macros, null in aggiunta).
  const [macroOpen, setMacroOpen] = useState(false)
  const [editingMacroIndex, setEditingMacroIndex] = useState<number | null>(null)
  const [macroMod, setMacroMod] = useState<macroModifier>("ctrl")
  const [macroKey, setMacroKey] = useState("")
  const [macroCategory, setMacroCategory] = useState("")
  const [macroAction, setMacroAction] = useState("")
  const [macroActionKey, setMacroActionKey] = useState<string | undefined>(undefined)

  // Dialog Export / Import config.
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  // Report dell'ultimo import (per la tabella dettagliata sotto Keybinds).
  const [importReport, setImportReport] = useState<ImportReport | null>(null)

  const maps = project.keybindMaps
  const categories = project.keybindCategories
  const tags = project.keybindTags
  const current = maps[activeMap] as keybindMap | undefined
  // Un tasto può avere più binding (uno per livello): raggruppo per `key`.
  const bindingsByKey = new Map<string, keybind[]>()
  for (const kb of current?.keybinds ?? []) {
    const arr = bindingsByKey.get(kb.key)
    if (arr) arr.push(kb)
    else bindingsByKey.set(kb.key, [kb])
  }
  const layerCount = layerCountOf(current)
  const categoryOf = (name: string) => categories.find((c) => c.name === name)
  const colorOf = (name: string) => categoryOf(name)?.color ?? "#888888"

  // Azioni keybind derivate dalla scansione UNIFICATA dei mod. Alla prima lettura
  // di ogni APERTURA di progetto i jar vengono riletti dal disco (così mod
  // rimosse o aggiornate si riflettono anche qui); dentro la stessa apertura si
  // usa la cache SQLite. La pagina è utilizzabile anche senza aver prima aperto
  // List Mods.
  const keybindActions = useAppSelector(selectKeybindActions)
  const loadId = useAppSelector((s) => s.project.loadId)
  const workpath = project.configs.workpath
  // Aprire tutti i jar blocca l'interazione: overlay globale (`use-busy.ts`).
  const busy = useBusy()
  const [scanning, setScanning] = useState(false)
  // Scansione UNIFICATA caricata nella pagina: è l'UNICA fonte per risolvere una
  // category alla mod + alle sue keybind (indipendente da project.mods, che può
  // essere non aggiornato). byModId dello slice resta per compatibilità.
  const [scanMods, setScanMods] = useState<scannedMod[]>([])

  // Deriva le keybind per-mod (per lo slice Redux, usato altrove).
  const toActions = (mods: scannedMod[]) =>
    mods
      .filter((m) => m.modId && m.keybinds.length > 0)
      .map((m) => ({ filename: m.filename, modId: m.modId, keybinds: m.keybinds }))

  // La guardia è controllata e impostata DOPO l'await (non prima): in dev React
  // StrictMode invoca l'effect due volte e una guardia anticipata, unita al flag
  // di cancellazione, scarterebbe l'unico lavoro avviato. Le due invocazioni
  // condividono la stessa scansione (dedup in `mods-sync.ts`) e applica la prima.
  const bootstrapped = useRef<string | null>(null)
  useEffect(() => {
    const key = `${workpath}::${loadId}`
    if (bootstrapped.current === key) return
    ;(async () => {
      setScanning(true)
      try {
        // L'hint di versione decide il formato di metadati/lang atteso (Forge
        // legacy vs moderno) e fa parte della chiave di cache.
        const hint = await resolveScanHint(project)
        // Rilettura dal disco alla prima richiesta di questa apertura, poi cache.
        const mods = await busy(
          t("busy.resolvingKeybinds"),
          () => getModsScanForLoad(workpath, loadId, hint),
          { detail: workpath }
        )
        if (bootstrapped.current === key) return
        bootstrapped.current = key
        setScanMods(mods)
        dispatch(setKeybindActions({ workpath, mods: toActions(mods) }))
      } catch (err) {
        console.error(err)
        // Meglio nessuna azione che quelle del progetto precedente.
        setScanMods([])
      } finally {
        setScanning(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workpath, loadId, dispatch, busy])

  // Scansione unificata dei jar (via cache SQLite). `force` = refresh manuale.
  async function scanKeybinds(force: boolean) {
    setScanning(true)
    dispatch(setKeybindActionsLoading(true))
    try {
      const hint = await resolveScanHint(project)
      const mods = await busy(
        t("busy.resolvingKeybinds"),
        () =>
          force
            ? refreshModsScan(workpath, loadId, hint)
            : getModsScanForLoad(workpath, loadId, hint),
        { detail: workpath }
      )
      setScanMods(mods)
      dispatch(setKeybindActions({ workpath, mods: toActions(mods) }))
    } catch (err) {
      console.error(err)
      dispatch(setKeybindActionsError(String(err)))
    } finally {
      setScanning(false)
    }
  }

  // Mappe per risolvere una category alla mod, dalla scansione unificata: la
  // category può essere il NOME della mod (Add Mod) o il modId grezzo (import).
  const modByName = new Map<string, scannedMod>(scanMods.map((m) => [m.name, m]))
  const modByModId = new Map<string, scannedMod>(scanMods.map((m) => [m.modId, m]))
  const keybindsByModId = new Map<string, scannedKeybind[]>(scanMods.map((m) => [m.modId, m.keybinds]))
  // Azioni selezionabili per una category:
  //  - categorie NON-mod ("Vanilla" ecc.) → azioni vanilla;
  //  - qualsiasi altra category = MOD → keybind scansionate se disponibili,
  //    altrimenti `null` = input libero. Mai vanilla su una mod.
  function actionsForCategory(name: string): { value: string; label: string }[] | null {
    if (VANILLA_CATEGORY_NAMES.has(name)) {
      return vanillaActions().map((a) => ({ value: a.actionKey, label: a.label }))
    }
    const m = modByName.get(name) ?? modByModId.get(name)
    const kb = keybindsByModId.get(m?.modId ?? name)
    if (!kb || kb.length === 0) return null
    // Prima le keybind CERTE (dichiarate nel bytecode del mod), poi quelle
    // riconosciute dal solo nome della chiave: le seconde possono includere
    // traduzioni che non sono keybind. Dentro i due gruppi resta l'ordine per
    // label deciso da Rust.
    const certain = kb.filter((a) => a.source === "bytecode")
    const heuristic = kb.filter((a) => a.source !== "bytecode")
    return [...certain, ...heuristic].map((a) => ({ value: a.key, label: a.label }))
  }

  function commit(next: project) {
    dispatch(updateProject(next))
  }

  function commitKeybinds(keybinds: keybind[]) {
    const keybindMaps = maps.map((m, i) => (i === activeMap ? { ...m, keybinds } : m))
    commit({ ...project, keybindMaps })
  }

  function commitMacros(macros: macro[]) {
    const keybindMaps = maps.map((m, i) => (i === activeMap ? { ...m, macros } : m))
    commit({ ...project, keybindMaps })
  }

  const query = search.trim().toLowerCase()
  // Vale sia per i keybind sia per le macro: serve solo azione + categoria. Non
  // esiste più il caso "tasto vuoto" (prima serviva per attenuarlo): nella vista
  // isolata un tasto senza binding che corrispondono resta semplicemente vuoto.
  function matchesFilters(binding: { action: string; category: string }): boolean {
    if (modFilter !== "all" && binding.category !== modFilter) return false
    if (tagFilter !== "all" && !(categoryOf(binding.category)?.tags ?? []).includes(tagFilter)) return false
    if (query && !binding.action.toLowerCase().includes(query)) return false
    return true
  }
  // Almeno un filtro attivo (mod, tag o ricerca) → la tastiera passa alla vista
  // ISOLATA: vedi `renderKey`.
  const filtersActive = modFilter !== "all" || tagFilter !== "all" || !!query

  // Mod e tag da OFFRIRE nelle barre di filtro: solo quelli davvero presenti nella
  // mappa attiva (binding o macro). Le categorie sono di progetto, quindi la lista
  // completa conteneva mod che in questa mappa non hanno un solo tasto: filtrarci
  // dava una tastiera vuota, e su un modpack grosso il chip giusto era sepolto tra
  // decine di inutili. Il valore SELEZIONATO resta sempre in lista anche se non è
  // in uso (succede cambiando mappa): un filtro attivo e invisibile non si
  // potrebbe più togliere.
  const usedInMap = new Set<string>([
    ...(current?.keybinds ?? []).map((kb) => kb.category),
    ...(current?.macros ?? []).map((mc) => mc.category),
  ])
  const filterCategories = categories.filter((c) => usedInMap.has(c.name) || c.name === modFilter)
  const filterTags = tags.filter(
    (tg) =>
      tg.name === tagFilter ||
      categories.some((c) => usedInMap.has(c.name) && (c.tags ?? []).includes(tg.name))
  )

  // --- Layer: cosa si vede sulla tastiera ---
  //
  // Livello effettivo: cambiando mappa quello selezionato può non esistere più
  // (mappe diverse hanno un numero di livelli diverso), e la tastiera
  // risulterebbe vuota senza spiegazione → si ricade sul primo.
  const effectiveLayer: layerSelection =
    activeLayer === ALL_LAYERS || activeLayer <= layerCount ? activeLayer : 1
  //
  // Con un filtro attivo i livelli si appiattiscono da soli: stai già guardando
  // un sottoinsieme piccolo (una mod, un tag, una ricerca), quindi vederlo
  // spezzato su più livelli sarebbe solo un ostacolo — e nella vista isolata il
  // tasto mostra comunque un colore solo, quindi non c'è nulla da separare.
  const flattened = effectiveLayer === ALL_LAYERS || filtersActive
  /** Binding del tasto da MOSTRARE, secondo il livello selezionato. */
  function shownBindings(all: keybind[]): keybind[] {
    return flattened ? all : all.filter((kb) => layerOf(kb) === effectiveLayer)
  }
  /** Livelli occupati da un tasto, in ordine (per il segno sul KeyCap). */
  function layersOf(all: keybind[]): number[] {
    return [...new Set(all.map(layerOf))].sort((a, b) => a - b)
  }
  const layerName = (n: number) => t("keybinds.layerN", { n })
  // Quanti binding vivono su ciascun livello della mappa (badge nella lista).
  const perLayerCount = (n: number) =>
    (current?.keybinds ?? []).filter((kb) => layerOf(kb) === n).length

  // --- Mappe ---
  function openAddMap() {
    setEditingMapIndex(null)
    setMapName("")
    setMapOpen(true)
  }

  function openEditMap(index: number) {
    setEditingMapIndex(index)
    setMapName(maps[index].name)
    setMapOpen(true)
  }

  function saveMap() {
    const name = mapName.trim()
    if (!name) return
    if (editingMapIndex !== null) {
      const keybindMaps = maps.map((m, i) => (i === editingMapIndex ? { ...m, name } : m))
      commit({ ...project, keybindMaps })
    } else {
      // Nuova mappa pre-popolata dal template (azioni + categorie di default).
      // I tag di default arrivano già con il progetto (`emptyProject`): la fusione
      // qui resta come rete di sicurezza per i progetti creati prima, che hanno
      // `keybindTags` vuoto. Il filtro sui nomi esistenti evita i duplicati.
      const keybindMaps = [...maps, { name, keybinds: defaultKeybinds() }]
      const existingCategories = new Set(categories.map((c) => c.name))
      const existingTags = new Set(tags.map((c) => c.name))
      const keybindCategories = [
        ...categories,
        ...defaultCategories().filter((c) => !existingCategories.has(c.name)),
      ]
      const keybindTags = [
        ...tags,
        ...defaultTags().filter((c) => !existingTags.has(c.name))
      ]
      commit({ ...project, keybindMaps, keybindCategories, keybindTags })
      setActiveMap(keybindMaps.length - 1)
    }
    setMapOpen(false)
  }
  function removeMap(index: number) {
    const keybindMaps = maps.filter((_, i) => i !== index)
    commit({ ...project, keybindMaps })
    setActiveMap((prev) => Math.max(0, Math.min(prev, keybindMaps.length - 1)))
  }

  // --- Binding ---
  // Contatore per gli `id` dei draft: servono stabili per il drag & drop, e
  // l'indice nell'array non lo è (cambia quando si rimuove una riga).
  const draftIdRef = useRef(0)
  const newDraftId = () => `d${++draftIdRef.current}`

  function openKey(def: KeyDef) {
    const existing = bindingsByKey.get(def.id) ?? []
    setEditing(def)
    setDraftBindings(
      existing.length > 0
        ? existing.map((kb) => ({
            id: newDraftId(),
            action: kb.action,
            actionKey: kb.actionKey,
            category: kb.category,
            layer: layerOf(kb),
          }))
        : [
            {
              id: newDraftId(),
              action: "",
              actionKey: undefined,
              category: categories[0]?.name ?? "",
              // Un binding nuovo nasce sul livello che si sta guardando: è quello
              // che l'utente si aspetta di riempire cliccando il tasto.
              layer: effectiveLayer === ALL_LAYERS ? 1 : effectiveLayer,
            },
          ]
    )
    // Nel dialog si vedono almeno i livelli della mappa (e quelli usati dal tasto).
    setDraftLayers(
      Math.max(layerCount, ...existing.map(layerOf), effectiveLayer === ALL_LAYERS ? 1 : effectiveLayer)
    )
  }
  /** Aggiunge una riga sul livello indicato (il primo libero se non specificato). */
  function addDraftBinding(layer?: number) {
    setDraftBindings((prev) => {
      const target =
        layer ??
        // Primo livello libero: evita di impilare due binding sullo stesso.
        Array.from({ length: draftLayers }, (_, i) => i + 1).find(
          (n) => !prev.some((b) => b.layer === n)
        ) ??
        // Tutti occupati: se ne apre uno in più.
        draftLayers + 1
      return [
        ...prev,
        {
          id: newDraftId(),
          action: "",
          actionKey: undefined,
          category: categories[0]?.name ?? "",
          layer: target,
        },
      ]
    })
  }
  function updateDraftBinding(
    id: string,
    patch: Partial<{ action: string; actionKey?: string; category: string; layer: number }>
  ) {
    setDraftBindings((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }
  function removeDraftBinding(id: string) {
    setDraftBindings((prev) => prev.filter((b) => b.id !== id))
  }
  /**
   * Livello scelto dalla Select. Il valore speciale `NEW_LAYER_VALUE` apre un
   * livello in più e ci sposta il binding, così non serve un bottone a parte.
   * Due binding sullo stesso livello sono ammessi (nessuno scambio automatico:
   * con una Select vedere muoversi un'altra riga sarebbe inspiegabile) e la
   * cosa viene segnalata sotto la lista.
   */
  function setDraftLayer(id: string, value: string) {
    if (value === NEW_LAYER_VALUE) {
      setDraftLayers((prev) => {
        const next = prev + 1
        setDraftBindings((rows) => rows.map((b) => (b.id === id ? { ...b, layer: next } : b)))
        return next
      })
      return
    }
    const layer = Number(value)
    if (!Number.isInteger(layer) || layer < 1) return
    updateDraftBinding(id, { layer })
  }
  // Binding validi correnti del dialog, legati al tasto in modifica.
  function draftToKeybinds(keyId: string): keybind[] {
    return draftBindings
      .filter((b) => b.action.trim() && b.category)
      .map((b) => ({
        key: keyId,
        action: b.action.trim(),
        category: b.category,
        ...(b.actionKey ? { actionKey: b.actionKey } : {}),
        // `layer` sempre scritto (anche 1): rende espliciti i dati salvati da
        // qui, mentre l'assenza resta il default dei progetti più vecchi.
        layer: b.layer,
      }))
  }
  function saveBinding() {
    if (!editing || !current) return
    // Rimuovo tutti i binding del tasto e riaggiungo quelli con azione valida.
    const kept = current.keybinds.filter((kb) => kb.key !== editing.id)
    const added = draftToKeybinds(editing.id)
    const keybinds = [...kept, ...added]
    // I livelli creati nel dialog restano nella mappa anche se ancora vuoti.
    const keybindMaps = maps.map((m, i) =>
      i === activeMap
        ? { ...m, keybinds, layerCount: Math.max(layerCountOf(m), draftLayers) }
        : m
    )
    commit({ ...project, keybindMaps })
    setEditing(null)
  }
  /**
   * Chiede conferma prima di scrivere su TUTTE le mappe: è l'unica azione della
   * pagina che tocca mappe che non stai guardando, e sovrascrive quel tasto in
   * ognuna. Senza conferma un click di troppo rende tutte le mappe uguali, e non
   * c'è un annulla.
   */
  async function confirmSaveToAllMaps() {
    if (!editing) return
    if (maps.length > 1) {
      const ok = await confirm({
        type: "warning",
        title: t("keybinds.allProfilesConfirmTitle"),
        message: t("keybinds.allProfilesConfirmMessage", {
          key: editing.label,
          maps: maps.length,
        }),
      })
      if (ok !== true) return
    }
    saveBindingToAll()
  }
  // Applica i binding correnti del tasto a TUTTE le mappe/profili (non solo a
  // quella attiva). Le categorie sono condivise a livello di progetto, quindi
  // sono valide ovunque.
  function saveBindingToAll() {
    if (!editing) return
    const added = draftToKeybinds(editing.id)
    const keybindMaps = maps.map((m) => ({
      ...m,
      keybinds: [...m.keybinds.filter((kb) => kb.key !== editing.id), ...added],
      layerCount: Math.max(layerCountOf(m), draftLayers),
    }))
    commit({ ...project, keybindMaps })
    setEditing(null)
  }
  function removeBinding() {
    if (!editing || !current) return
    commitKeybinds(current.keybinds.filter((kb) => kb.key !== editing.id))
    setEditing(null)
  }

  // --- Layer della mappa ---
  function commitLayerCount(count: number) {
    if (!current) return
    const keybindMaps = maps.map((m, i) => (i === activeMap ? { ...m, layerCount: count } : m))
    commit({ ...project, keybindMaps })
  }
  function addLayer() {
    if (!current) return
    const next = layerCount + 1
    commitLayerCount(next)
    setActiveLayer(next)
  }
  /**
   * Rimuove l'ULTIMO livello, solo se è vuoto. Cancellare un livello pieno
   * significherebbe buttare via dei binding senza che si veda cosa si perde: per
   * svuotarlo si trascinano i suoi binding altrove dall'editor del tasto.
   */
  function removeLastLayer() {
    if (!current || layerCount <= 1 || perLayerCount(layerCount) > 0) return
    const next = layerCount - 1
    commitLayerCount(next)
    if (effectiveLayer === ALL_LAYERS || effectiveLayer > next) setActiveLayer(next)
  }
  /**
   * Distribuisce sui livelli i binding che condividono lo stesso tasto: il primo
   * resta dov'è, gli altri finiscono sui livelli successivi. Serve ai progetti
   * nati prima dei layer, dove tutto sta sul livello 1 e i tasti risultano
   * divisi in riquadri ("arlecchino"): un click e la mappa diventa leggibile.
   */
  function spreadOnLayers() {
    if (!current) return
    const usedPerKey = new Map<string, number>()
    let maxLayer = 1
    const keybinds = current.keybinds.map((kb) => {
      const n = (usedPerKey.get(kb.key) ?? 0) + 1
      usedPerKey.set(kb.key, n)
      maxLayer = Math.max(maxLayer, n)
      return { ...kb, layer: n }
    })
    const keybindMaps = maps.map((m, i) =>
      i === activeMap ? { ...m, keybinds, layerCount: maxLayer } : m
    )
    commit({ ...project, keybindMaps })
    setActiveLayer(1)
  }
  // Ha senso proporre la distribuzione solo se c'è davvero un tasto con più
  // binding sullo stesso livello.
  const hasStackedBindings = (() => {
    const seen = new Set<string>()
    for (const kb of current?.keybinds ?? []) {
      const id = `${kb.key}#${layerOf(kb)}`
      if (seen.has(id)) return true
      seen.add(id)
    }
    return false
  })()

  // --- Macro (modificatore + tasto base) ---
  function openAddMacro() {
    setEditingMacroIndex(null)
    setMacroMod("ctrl")
    setMacroKey("")
    setMacroCategory(categories[0]?.name ?? "")
    setMacroAction("")
    setMacroActionKey(undefined)
    setMacroOpen(true)
  }
  function openEditMacro(index: number) {
    const mc = (current?.macros ?? [])[index]
    if (!mc) return
    setEditingMacroIndex(index)
    setMacroMod(mc.modifier)
    setMacroKey(mc.key)
    setMacroCategory(mc.category)
    setMacroAction(mc.action)
    setMacroActionKey(mc.actionKey)
    setMacroOpen(true)
  }
  function saveMacro() {
    if (!current) return
    const action = macroAction.trim()
    if (!macroKey || !action || !macroCategory) return
    const entry: macro = {
      modifier: macroMod,
      key: macroKey,
      action,
      category: macroCategory,
      ...(macroActionKey ? { actionKey: macroActionKey } : {}),
    }
    const existing = current.macros ?? []
    const next =
      editingMacroIndex !== null
        ? existing.map((m, i) => (i === editingMacroIndex ? entry : m))
        : [...existing, entry]
    commitMacros(next)
    setMacroOpen(false)
  }
  function removeMacro() {
    if (!current || editingMacroIndex === null) return
    commitMacros((current.macros ?? []).filter((_, i) => i !== editingMacroIndex))
    setMacroOpen(false)
  }

  // --- Mod (categoria) ---
  function openAddMod() {
    setEditingMod(null)
    setModName("")
    setModColor(DEFAULT_PALETTE[categories.length % DEFAULT_PALETTE.length])
    setModTags([])
    setModOpen(true)
  }
  function openEditMod(c: keybindCategory) {
    setEditingMod(c.name)
    setModName(c.name)
    setModColor(c.color)
    setModTags(c.tags)
    setModOpen(true)
  }
  function saveMod() {
    const name = modName.trim()
    if (!name) return
    const entry: keybindCategory = { name, color: modColor, tags: modTags }
    const old = editingMod

    let keybindCategories: keybindCategory[]
    if (old) {
      keybindCategories = categories.map((c) => (c.name === old ? entry : c))
    } else {
      const exists = categories.some((c) => c.name === name)
      keybindCategories = exists ? categories.map((c) => (c.name === name ? entry : c)) : [...categories, entry]
    }

    let next: project = { ...project, keybindCategories }
    // Rinomina: propaga il nuovo nome ai binding di tutte le mappe.
    if (old && old !== name) {
      next = {
        ...next,
        keybindMaps: maps.map((m) => ({
          ...m,
          keybinds: m.keybinds.map((kb) => (kb.category === old ? { ...kb, category: name } : kb)),
        })),
      }
      if (modFilter === old) setModFilter(name)
    }
    commit(next)
    setModOpen(false)

    // Dopo aver AGGIUNTO una mod (non in modifica), avvia la scansione delle sue
    // keybind se non risultano già in cache: qui è il momento dell'import, quindi
    // è corretto leggere i jar. Forza la scansione così una mod appena aggiunta
    // (magari assente da una cache precedente) viene sempre inclusa.
    if (!old) {
      const added = modByName.get(name)
      if (added && !keybindActions.byModId[added.modId]) void scanKeybinds(true)
    }
  }
  function removeMod() {
    if (!editingMod) return
    const name = editingMod
    const keybindCategories = categories.filter((c) => c.name !== name)
    const keybindMaps = maps.map((m) => ({ ...m, keybinds: m.keybinds.filter((kb) => kb.category !== name) }))
    commit({ ...project, keybindCategories, keybindMaps })
    if (modFilter === name) setModFilter("all")
    setModOpen(false)
  }

  // --- Tag ---
  function openAddTag() {
    setEditingTag(null)
    setTagName("")
    setTagOpen(true)
  }
  function openEditTag(t: keybindTag) {
    setEditingTag(t.name)
    setTagName(t.name)
    setTagOpen(true)
  }
  function saveTag() {
    const name = tagName.trim()
    if (!name) return
    const entry: keybindTag = { name }
    const old = editingTag

    let keybindTags: keybindTag[]
    if (old) {
      keybindTags = tags.map((t) => (t.name === old ? entry : t))
    } else {
      const exists = tags.some((t) => t.name === name)
      keybindTags = exists ? tags.map((t) => (t.name === name ? entry : t)) : [...tags, entry]
    }

    let next: project = { ...project, keybindTags }
    // Rinomina: aggiorna il riferimento nelle mod che usano il tag.
    if (old && old !== name) {
      next = {
        ...next,
        keybindCategories: categories.map((c) => ({
          ...c,
          tags: c.tags.map((tg) => (tg === old ? name : tg)),
        })),
      }
      if (tagFilter === old) setTagFilter(name)
    }
    commit(next)
    setTagOpen(false)
  }
  function removeTag() {
    if (!editingTag) return
    const name = editingTag
    const keybindTags = tags.filter((t) => t.name !== name)
    const keybindCategories = categories.map((c) => ({ ...c, tags: c.tags.filter((tg) => tg !== name) }))
    commit({ ...project, keybindTags, keybindCategories })
    if (tagFilter === name) setTagFilter("all")
    setTagOpen(false)
  }

  function renderKey(item: KeyDef) {
    const all = bindingsByKey.get(item.id) ?? []
    // Sulla tastiera si vedono solo i binding del livello selezionato: è questo
    // che evita il tasto diviso in riquadri di più colori.
    const inLayer = shownBindings(all)
    // Vista ISOLATA: con un filtro attivo il tasto mostra SOLO i binding che
    // corrispondono, a colore pieno. Prima i binding delle altre mod restavano
    // sul tasto (solo attenuati), quindi filtrando per una mod la tastiera
    // restava un arlecchino; così invece si guarda "il livello dedicato" a quella
    // mod, su una tastiera per il resto vuota.
    const list = filtersActive ? inLayer.filter((kb) => matchesFilters(kb)) : inLayer
    const bindings = list.map((kb) => ({ action: kb.action, color: colorOf(kb.category), category: kb.category }))
    // Binding del tasto che la vista NON mostra: su un altro livello, oppure
    // esclusi dal filtro. L'angolo piegato li ricorda, altrimenti nella vista
    // isolata un tasto già occupato da un'altra mod sembrerebbe libero.
    const hidden = all.filter((kb) => !list.includes(kb))
    const hiddenLabel =
      hidden.length === 0
        ? undefined
        : filtersActive
          ? t("keybinds.alsoUsedBy", {
              mods: [...new Set(hidden.map((kb) => kb.category))].join(", "),
            })
          : t("keybinds.alsoOnLayers", {
              layers: layersOf(hidden).map(layerName).join(", "),
            })
    return (
      <KeyCap
        key={item.id}
        def={item}
        bindings={bindings}
        onClick={() => openKey(item)}
        hiddenLabel={hiddenLabel}
      />
    )
  }

  function renderRow(row: KeyboardItem[], rowIndex: number) {
    return (
      <div key={rowIndex} className="flex items-end" style={KEY_GAP_STYLE}>
        {row.map((item, i) =>
          isSpacer(item)
            ? <div key={`sp-${i}`} style={{ width: keyWidth(item.spacer), height: keyWidth(item.spacer) }} className="shrink-0" />
            : renderKey(item)
        )}
      </div>
    )
  }

  // Macro mostrate: come la tastiera, con un filtro attivo si vedono solo quelle
  // che corrispondono invece di restare attenuate (sono colorate come i tasti, e
  // attenuate sporcherebbero la vista isolata). L'indice ORIGINALE viaggia con la
  // macro: è quello che l'editor usa per salvarla.
  const macroList = current?.macros ?? []
  const visibleMacros = macroList
    .map((mc, index) => ({ mc, index }))
    .filter(({ mc }) => !filtersActive || matchesFilters(mc))

  // Binding del dialog ordinati per livello: la lista è piatta, quindi senza
  // ordine le righe salterebbero avanti e indietro cambiando la Select.
  const sortedDrafts = [...draftBindings].sort((a, b) => a.layer - b.layer || a.id.localeCompare(b.id))
  // Livelli con più di un binding: ammessi, ma vanno detti (sono la ragione per
  // cui un tasto torna a mostrarsi diviso in riquadri).
  const sharedLayers = [
    ...new Set(
      draftBindings
        .map((b) => b.layer)
        .filter((n, i, all) => all.indexOf(n) !== i)
    ),
  ].sort((a, b) => a - b)

  // Azioni selezionabili per la macro in modifica (in base alla mod scelta) e
  // l'azione attualmente selezionata (per il Combobox controllato).
  const macroActions = actionsForCategory(macroCategory)
  const macroSelectedAction = macroActions?.find((a) => a.value === macroActionKey) ?? null

  return (
    <div className="flex flex-col gap-4">
      <div className="w-full flex items-stretch gap-4">
        {/* Box filtri (mod + tag) sempre visibile in cima */}
        <Card className="sticky top-0 z-20 w-full h-full">
          <CardHeader className="flex items-center justify-between">
            <div className="flex gap-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-green-500/20">
                <BoxesIcon className="size-6" />
              </div>
              <CardTitle className="text-2xl">{t("keybinds.modsTitle")}</CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void scanKeybinds(true)}
                disabled={scanning}
                aria-label={t("keybinds.rescan")}
                title={t("keybinds.rescan")}
              >
                <RefreshCcwIcon className={cn(scanning && "ease-in-out animate-spin")} />
              </Button>
              <Button variant="outline" size="sm" onClick={openAddMod}><PlusIcon /> {t("keybinds.modButton")}</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 py-3">
            {categories.length === 0 && tags.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("keybinds.addModToStart")}</p>
            )}
            {/* Click su un chip = modifica la mod. Qui i chip vanno a capo
                liberamente (niente `ChipStrip`): è la lista di gestione delle mod
                del progetto, la si vuole vedere tutta in una volta. */}
            {categories.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-10 text-xs text-muted-foreground">{t("keybinds.modsLabel")}</span>
                {categories.map((c) => (
                  <FilterChip key={c.name} label={c.name} color={c.color} active={false} onClick={() => openEditMod(c)} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="sticky top-0 z-20 w-full h-full">
          <CardHeader className="flex items-center justify-between">
            <div className="flex gap-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/20">
                <TagsIcon className="size-6" />
              </div>
              <CardTitle className="text-2xl">{t("keybinds.tagTitle")}</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={openAddTag}><PlusIcon /> {t("keybinds.tagButton")}</Button>
          </CardHeader>
          <CardContent className="space-y-2 py-3">
            {categories.length === 0 && tags.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("keybinds.addTagToStart")}</p>
            )}
            {/* Click su un chip = modifica il tag (a capo libero come le mod). */}
            {tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-10 text-xs text-muted-foreground">{t("keybinds.tagsLabel")}</span>
                {tags.map((t) => (
                  <FilterChip key={t.name} label={t.name} active={false} onClick={() => openEditTag(t)} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{t("keybinds.keybindsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selettore mappe */}
          <div className="flex flex-wrap items-center gap-2 border-b pb-3">
            {maps.map((m, i) => {
              const active = i === activeMap
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-0.5 rounded-full border px-1 transition-colors",
                    active ? "border-transparent bg-primary text-primary-foreground" : "border-border"
                  )}
                >
                  <button type="button" onClick={() => setActiveMap(i)} className="flex items-center gap-1.5 py-1 pl-2 text-sm font-medium">
                    <MapIcon className="size-3.5" /> {m.name}
                  </button>
                  {active && (
                    <>
                      <button type="button" onClick={() => openEditMap(i)} className="rounded-full p-0.5 hover:bg-black/10" aria-label={t("keybinds.editMap")}>
                        <PencilIcon className="size-3" />
                      </button>
                      <button type="button" onClick={() => removeMap(i)} className="rounded-full p-0.5 hover:bg-black/10" aria-label={t("keybinds.removeMap")}>
                        <XIcon className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )
            })}
            <Button variant="ghost" size="sm" onClick={openAddMap}><PlusIcon /> {t("keybinds.mapButton")}</Button>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setImportOpen(true)}
            >
              <UploadIcon /> {t("keybinds.import")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportOpen(true)}
              disabled={maps.length === 0}
            >
              <DownloadIcon /> {t("keybinds.export")}
            </Button>
          </div>

          {!current ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <MapIcon className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground">{t("keybinds.noMaps")}</p>
              <Button variant="outline" onClick={openAddMap}><PlusIcon /> {t("keybinds.addMap")}</Button>
            </div>
          ) : (
            <>
              {/* Filtri per la tastiera: ricerca azione + Tag (select) + Mod (chip) */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-48 flex-1 max-w-xs">
                    <SearchIcon className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder={t("keybinds.searchAction")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-8 pl-8"
                    />
                  </div>
                  {/* Solo i tag portati dalle mod presenti in questa mappa. */}
                  {filterTags.length > 0 && (
                    <Select value={tagFilter} onValueChange={setTagFilter}>
                      <SelectTrigger className="h-8 w-44">
                        <SelectValue placeholder={t("keybinds.allTags")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("keybinds.allTags")}</SelectItem>
                        {filterTags.map((tg) => (
                          <SelectItem key={tg.name} value={tg.name}>{tg.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {filterCategories.length > 0 && (
                  <ChipStrip
                    label={t("keybinds.modsLabel")}
                    leading={
                      // "Tutte" azzera il filtro: fuori dallo scroll, così si
                      // torna alla vista completa senza cercare il chip.
                      <div className="pt-1">
                        <FilterChip label={t("keybinds.all")} active={modFilter === "all"} onClick={() => setModFilter("all")} />
                      </div>
                    }
                  >
                    {filterCategories.map((c) => (
                      <FilterChip
                        key={c.name}
                        label={c.name}
                        color={c.color}
                        active={modFilter === c.name}
                        onClick={() => setModFilter(modFilter === c.name ? "all" : c.name)}
                      />
                    ))}
                  </ChipStrip>
                )}
              </div>

              {/* Tastiera + Numpad + Mouse, con la lista dei livelli a sinistra */}
              <div className="flex items-start gap-4">
                {/* Livelli della mappa: si guarda un livello per volta, così su
                    ogni tasto compare un solo binding a colore pieno. */}
                <div className="w-40 shrink-0 space-y-2">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <LayersIcon className="size-4" /> {t("keybinds.layers")}
                  </p>
                  <div className="space-y-1 rounded-xl border bg-muted/30 p-2">
                    {Array.from({ length: layerCount }, (_, i) => i + 1).map((n) => {
                      const active = effectiveLayer === n
                      const count = perLayerCount(n)
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setActiveLayer(n)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
                            active
                              ? "bg-primary text-primary-foreground font-medium"
                              : "hover:bg-muted text-muted-foreground"
                          )}
                        >
                          <span>{layerName(n)}</span>
                          <span className={cn("text-xs", active ? "opacity-80" : "opacity-60")}>
                            {count}
                          </span>
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => setActiveLayer(ALL_LAYERS)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
                        effectiveLayer === ALL_LAYERS
                          ? "bg-foreground text-background font-medium"
                          : "hover:bg-muted text-muted-foreground"
                      )}
                    >
                      <span>{t("keybinds.allLayers")}</span>
                      <span className="text-xs opacity-60">{current.keybinds.length}</span>
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addLayer}
                      title={t("keybinds.addLayerTitle")}
                    >
                      <PlusIcon /> {t("keybinds.addLayer")}
                    </Button>
                    {layerCount > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={removeLastLayer}
                        disabled={perLayerCount(layerCount) > 0}
                        title={
                          perLayerCount(layerCount) > 0
                            ? t("keybinds.removeLayerBlocked")
                            : t("keybinds.removeLayerTitle", { layer: layerName(layerCount) })
                        }
                      >
                        <XIcon /> {t("keybinds.removeLayer")}
                      </Button>
                    )}
                    {hasStackedBindings && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={spreadOnLayers}
                        title={t("keybinds.spreadTitle")}
                      >
                        <LayersIcon /> {t("keybinds.spread")}
                      </Button>
                    )}
                  </div>
                  {filtersActive && (
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {t("keybinds.isolatedByFilter")}
                    </p>
                  )}
                </div>

                <div className="min-w-0 flex-1 overflow-x-auto">
                {/* `flex-wrap`: alla scala attuale i tre blocchi in fila superano
                    la larghezza utile su schermi normali, e scorrere in orizzontale
                    per raggiungere il numpad è peggio che vederlo andare a capo.
                    L'`overflow-x-auto` resta per la tastiera sola, che non si
                    accorcia. */}
                <div className="flex w-full flex-wrap items-start gap-6">
                  <div className="space-y-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><KeyboardIcon className="size-4" /> {t("keybinds.keyboard")}</p>
                    <div className="rounded-xl border bg-muted/30 p-4">
                      {/* Gap verticale dal GAP_REM come quello orizzontale: è la
                          stessa griglia su cui `keyWidth` calcola i tasti larghi. */}
                      <div className="flex flex-col" style={KEY_GAP_STYLE}>{MAIN_ROWS.map(renderRow)}</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">{t("keybinds.numpad")}</p>
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <div className="flex items-start" style={KEY_GAP_STYLE}>
                        <div className="flex flex-col" style={KEY_GAP_STYLE}>{NUMPAD_ROWS.map(renderRow)}</div>
                        <div className="flex flex-col" style={KEY_GAP_STYLE}>{NUMPAD_SIDE.map(renderKey)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MouseIcon className="size-4" /> {t("keybinds.mouse")}</p>
                    <div className="rounded-xl border bg-muted/30 p-4">{renderRow(MOUSE_KEYS, 0)}</div>
                  </div>
                </div>
                </div>
              </div>

              {/* Macro: combinazioni modificatore + tasto (es. Ctrl+A) della mappa attiva */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ZapIcon className="size-4" /> {t("keybinds.macros")}</p>
                  <Button variant="outline" size="sm" onClick={openAddMacro} disabled={categories.length === 0}>
                    <PlusIcon /> {t("keybinds.macroButton")}
                  </Button>
                </div>
                <div className="rounded-xl border bg-muted/30 p-4">
                  {macroList.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("keybinds.noMacros")}
                    </p>
                  ) : visibleMacros.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("keybinds.noMacrosForFilter")}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {visibleMacros.map(({ mc, index }) => {
                        const color = colorOf(mc.category)
                        return (
                          <button
                            key={index}
                            type="button"
                            onClick={() => openEditMacro(index)}
                            title={`${mc.action} — ${mc.category}`}
                            style={{ background: color, color: contrastText(color) }}
                            className="flex items-center gap-2 rounded-md border border-transparent px-3 py-1.5 text-left transition-transform hover:z-10 hover:scale-105"
                          >
                            <span className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[11px] font-semibold whitespace-nowrap">
                              {t("keybinds.modifier." + mc.modifier)} + {keyLabel(mc.key)}
                            </span>
                            <span className="line-clamp-1 text-[11px] opacity-90">{mc.action}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Report dettagliato dell'ultimo import (sotto il blocco Keybinds). */}
      {importReport && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">{t("keybinds.importReport.title")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("keybinds.importReport.summary", { maps: importReport.maps, bindings: importReport.bindings })}
                {importReport.issues.length > 0 && t("keybinds.importReport.skipped", { count: importReport.issues.length })}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setImportReport(null)} aria-label={t("keybinds.importReport.dismiss")}>
              <XIcon />
            </Button>
          </CardHeader>
          <CardContent>
            {importReport.issues.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("keybinds.importReport.noIssues")}
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("keybinds.importReport.colMap")}</TableHead>
                      <TableHead>{t("keybinds.importReport.colAction")}</TableHead>
                      <TableHead>{t("keybinds.importReport.colKey")}</TableHead>
                      <TableHead>{t("keybinds.importReport.colProblem")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importReport.issues.map((iss, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">{iss.map}</TableCell>
                        <TableCell className="font-mono text-xs">{iss.actionKey}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {iss.keyCode ?? "—"}
                        </TableCell>
                        <TableCell className="text-destructive">{t("keybinds.reason." + REASON_KEY[iss.reason])}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog binding — non-modal + niente chiusura su interazione esterna,
          così il popup (portalato) del Combobox azioni resta cliccabile. */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)} modal={false}>
        <DialogContent className="max-w-2xl!"
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{editing?.label}</DialogTitle>
          </DialogHeader>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("keybinds.noModsYet")}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t("keybinds.bindings")}</Label>
                <span className="text-xs text-muted-foreground">{draftBindings.length}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t("keybinds.layerSelectHint")}</p>
              {/* Lista dei binding del tasto: il livello si sceglie da una Select
                  (niente trascinamento). ScrollArea perché i binding non hanno un
                  massimo e il dialog non deve crescere oltre lo schermo. */}
              <ScrollArea className="h-78! pr-3">
                <div className="space-y-2">
                  {sortedDrafts.map((b) => {
                    const color = colorOf(b.category)
                    const actions = actionsForCategory(b.category)
                    const selected = actions?.find((a) => a.value === b.actionKey) ?? null
                    return (
                      <div key={b.id} className="flex items-center gap-2">
                        <span className="size-3 shrink-0 rounded-full" style={{ background: color }} />
                        {actions ? (
                          <div className="min-w-0 flex-1">
                            {/* key per category: rimonta il Combobox quando cambi mod,
                                così non resta filtrato con il testo digitato prima. */}
                            <Combobox
                              key={b.category}
                              items={actions}
                              value={selected}
                              onValueChange={(v: { value: string; label: string } | null) =>
                                updateDraftBinding(b.id, { actionKey: v?.value, action: v?.label ?? "" })
                              }
                              isItemEqualToValue={(a, c) => a?.value === c?.value}
                            >
                              <ComboboxInput placeholder={t("keybinds.selectAction")} />
                              <ComboboxContent>
                                <ComboboxEmpty>{t("keybinds.noActionsFound")}</ComboboxEmpty>
                                <ComboboxList>
                                  {(item: { value: string; label: string }) => (
                                    <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>
                                  )}
                                </ComboboxList>
                              </ComboboxContent>
                            </Combobox>
                          </div>
                        ) : (
                          <Input
                            placeholder={t("keybinds.actionPlaceholder")}
                            value={b.action}
                            onChange={(e) => updateDraftBinding(b.id, { action: e.target.value, actionKey: undefined })}
                            className="flex-1"
                          />
                        )}
                        <Select
                          value={b.category}
                          onValueChange={(v) => updateDraftBinding(b.id, { category: v, action: "", actionKey: undefined })}
                        >
                          <SelectTrigger className="h-8 w-32 shrink-0">
                            <SelectValue placeholder={t("keybinds.modPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((c) => (
                              <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* Livello del binding: l'ultima voce ne crea uno nuovo, così
                            non serve un bottone separato per aggiungerlo. */}
                        <Select
                          value={String(b.layer)}
                          onValueChange={(v) => setDraftLayer(b.id, v)}
                        >
                          <SelectTrigger className="h-8 w-32 shrink-0">
                            <SelectValue placeholder={t("keybinds.layer")} />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: draftLayers }, (_, i) => i + 1).map((n) => (
                              <SelectItem key={n} value={String(n)}>{layerName(n)}</SelectItem>
                            ))}
                            <SelectItem value={NEW_LAYER_VALUE}>{t("keybinds.newLayer")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => removeDraftBinding(b.id)}
                          aria-label={t("keybinds.removeBinding")}
                        >
                          <XIcon />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
              {sharedLayers.length > 0 && (
                <p className="text-xs text-amber-500">
                  {t("keybinds.sameLayerWarning", { layers: sharedLayers.map(layerName).join(", ") })}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addDraftBinding()}
              >
                <PlusIcon /> {t("keybinds.addBinding")}
              </Button>
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            {bindingsByKey.has(editing?.id ?? "") ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={removeBinding}><Trash2Icon /> {t("keybinds.remove")}</Button>
            ) : <span />}
            <div className="flex gap-2">
              {maps.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void confirmSaveToAllMaps()}
                  disabled={categories.length === 0 || draftBindings.some((b) => b.action.trim() && !b.category)}
                  title={t("keybinds.allProfilesTitle")}
                >
                  <CopyIcon /> {t("keybinds.allProfiles")}
                </Button>
              )}
              <Button
                type="button"
                onClick={saveBinding}
                disabled={categories.length === 0 || draftBindings.some((b) => b.action.trim() && !b.category)}
              >
                {t("keybinds.save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Add/Edit Mod — non-modal + niente chiusura su interazione esterna,
          così il popup (portalato) della Combobox resta cliccabile. */}
      <Dialog open={modOpen} onOpenChange={setModOpen} modal={false}>
        <DialogContent
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{editingMod ? t("keybinds.editModTitle") : t("keybinds.addModTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("keybinds.modLabel")}</Label>
              <Combobox items={project.mods} value={modName} onValueChange={(value: string | null) => setModName(value ?? "")}>
                <ComboboxInput placeholder={t("keybinds.selectMod")} />
                <ComboboxContent>
                  <ComboboxEmpty>{t("keybinds.noModsFound")}</ComboboxEmpty>
                  <ComboboxList>
                    {(item: mod) => (
                      <ComboboxItem key={item.filename} value={item.name}>{item.name}</ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <div className="space-y-2">
              <Label>{t("keybinds.color")}</Label>
              <ColorPicker
                defaultValue={modColor}
                onChange={(v) => setModColor(typeof v === "string" ? v : String(v))}
                format="hex"
                className="h-auto w-full gap-3 rounded-lg border p-3"
              >
                <ColorPickerSelection className="h-32 rounded-md" />
                <div className="flex items-center gap-2">
                  <ColorPickerEyeDropper />
                  <ColorPickerHue className="flex-1" />
                </div>
                <div className="flex items-center gap-2">
                  <ColorPickerOutput />
                  <ColorPickerFormat />
                </div>
              </ColorPicker>
            </div>
            {tags.length > 0 && (
              <div className="space-y-2">
                <Label>{t("keybinds.tagsLabel")}</Label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((t) => {
                    const selected = modTags.includes(t.name)
                    return (
                      <FilterChip
                        key={t.name}
                        label={t.name}
                        active={selected}
                        onClick={() => setModTags((prev) => selected ? prev.filter((x) => x !== t.name) : [...prev, t.name])}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="sm:justify-between">
            {editingMod ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={removeMod}><Trash2Icon /> {t("keybinds.remove")}</Button>
            ) : <span />}
            <Button type="button" onClick={saveMod} disabled={!modName.trim()}>{editingMod ? t("keybinds.save") : t("keybinds.add")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Add/Edit Tag */}
      <Dialog open={tagOpen} onOpenChange={setTagOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTag ? t("keybinds.editTagTitle") : t("keybinds.addTagTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="tag-name">{t("keybinds.name")}</Label>
            <Input id="tag-name" placeholder={t("keybinds.tagPlaceholder")} value={tagName} onChange={(e) => setTagName(e.target.value)} autoFocus />
          </div>
          <DialogFooter className="sm:justify-between">
            {editingTag ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={removeTag}><Trash2Icon /> {t("keybinds.remove")}</Button>
            ) : <span />}
            <Button type="button" onClick={saveTag} disabled={!tagName.trim()}>{editingTag ? t("keybinds.save") : t("keybinds.add")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Add/Edit Map */}
      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMapIndex !== null ? t("keybinds.editMapTitle") : t("keybinds.addMapTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="map-name">{t("keybinds.name")}</Label>
            <Input id="map-name" placeholder={t("keybinds.mapPlaceholder")} value={mapName} onChange={(e) => setMapName(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" onClick={saveMap} disabled={!mapName.trim()}>{editingMapIndex !== null ? t("keybinds.save") : t("keybinds.add")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Add/Edit Macro — non-modal + niente chiusura su interazione
          esterna, così i popup portalati dei Combobox restano cliccabili. */}
      <Dialog open={macroOpen} onOpenChange={(open) => !open && setMacroOpen(false)} modal={false}>
        <DialogContent
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{editingMacroIndex !== null ? t("keybinds.editMacroTitle") : t("keybinds.addMacroTitle")}</DialogTitle>
          </DialogHeader>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("keybinds.noModsYet")}</p>
          ) : (
            <div className="space-y-4">
              {/* Combinazione: modificatore + tasto base */}
              <div className="space-y-2">
                <Label>{t("keybinds.combination")}</Label>
                <div className="flex items-center gap-2">
                  <Select value={macroMod} onValueChange={(v) => setMacroMod(v as macroModifier)}>
                    <SelectTrigger className="h-8 w-28 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ctrl">{t("keybinds.modifier.ctrl")}</SelectItem>
                      <SelectItem value="shift">{t("keybinds.modifier.shift")}</SelectItem>
                      <SelectItem value="alt">{t("keybinds.modifier.alt")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">+</span>
                  <div className="min-w-0 flex-1">
                    <Combobox
                      items={BASE_KEY_OPTIONS}
                      value={BASE_KEY_OPTIONS.find((o) => o.value === macroKey) ?? null}
                      onValueChange={(v: { value: string; label: string } | null) => setMacroKey(v?.value ?? "")}
                      isItemEqualToValue={(a, c) => a?.value === c?.value}
                    >
                      <ComboboxInput placeholder={t("keybinds.selectKey")} />
                      <ComboboxContent>
                        <ComboboxEmpty>{t("keybinds.noKeysFound")}</ComboboxEmpty>
                        <ComboboxList>
                          {(item: { value: string; label: string }) => (
                            <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  </div>
                </div>
              </div>
              {/* Mod (categoria) */}
              <div className="space-y-2">
                <Label>{t("keybinds.modLabel")}</Label>
                <Select
                  value={macroCategory}
                  onValueChange={(v) => {
                    setMacroCategory(v)
                    setMacroAction("")
                    setMacroActionKey(undefined)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("keybinds.modPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Azione */}
              <div className="space-y-2">
                <Label>{t("keybinds.action")}</Label>
                {macroActions ? (
                  <Combobox
                    key={macroCategory}
                    items={macroActions}
                    value={macroSelectedAction}
                    onValueChange={(v: { value: string; label: string } | null) => {
                      setMacroActionKey(v?.value)
                      setMacroAction(v?.label ?? "")
                    }}
                    isItemEqualToValue={(a, c) => a?.value === c?.value}
                  >
                    <ComboboxInput placeholder={t("keybinds.selectAction")} />
                    <ComboboxContent>
                      <ComboboxEmpty>{t("keybinds.noActionsFound")}</ComboboxEmpty>
                      <ComboboxList>
                        {(item: { value: string; label: string }) => (
                          <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                ) : (
                  <Input
                    placeholder={t("keybinds.macroActionPlaceholder")}
                    value={macroAction}
                    onChange={(e) => {
                      setMacroAction(e.target.value)
                      setMacroActionKey(undefined)
                    }}
                  />
                )}
              </div>
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            {editingMacroIndex !== null ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={removeMacro}><Trash2Icon /> {t("keybinds.remove")}</Button>
            ) : <span />}
            <Button
              type="button"
              onClick={saveMacro}
              disabled={categories.length === 0 || !macroKey || !macroAction.trim() || !macroCategory}
            >
              {editingMacroIndex !== null ? t("keybinds.save") : t("keybinds.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Export config — remount ad ogni apertura per riallineare i default
          (mappa attiva) via key. */}
      {exportOpen && (
        <ExportDialog
          key={activeMap}
          project={project}
          open={exportOpen}
          onOpenChange={setExportOpen}
          defaultMapIndex={activeMap}
        />
      )}

      {/* Dialog Import config — legge config/keybindprofiles.json e ricostruisce
          le mappe, ricollegando ogni binding alla mod/azione. */}
      {importOpen && (
        <ImportDialog
          project={project}
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={setImportReport}
        />
      )}
    </div>
  )
}

export default function KeybindsPage() {
  // Come in List Mods: `key` sull'identità del progetto, così cambiando progetto
  // la board si rimonta e non resta con le mod scansionate, la mappa attiva e i
  // filtri della sessione precedente.
  const projectKey = useAppSelector(
    (s) => `${s.project.loadId}::${s.project.project?.configs.workpath ?? ""}`
  )
  return (
    <ProjectGate>{(project) => <KeybindsBoard key={projectKey} project={project} />}</ProjectGate>
  )
}
