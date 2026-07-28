"use client"

import { useEffect, useRef, useState } from "react"
import { KeyboardIcon, MouseIcon, PlusIcon, Trash2Icon, MapIcon, XIcon, PencilIcon, SearchIcon, BoxesIcon, TagsIcon, DownloadIcon, UploadIcon, RefreshCcwIcon, ZapIcon, LayersIcon } from "lucide-react"

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
import { getModsScanCached, peekModsScanCache, scannedMod, scannedKeybind } from "../../lib/mods-scan"
import { resolveScanHint } from "../../lib/forge-spec"
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

const UNIT_REM = 2.5
const GAP_REM = 0.25

// Mappa il motivo di scarto in import alla sotto-chiave i18n (risolta con t() al
// punto d'uso: t non può essere chiamata a livello modulo).
const REASON_KEY: Record<ImportIssueReason, string> = {
  "not-installed": "notInstalled",
  unmapped: "unmapped",
  overflow: "overflow",
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
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
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

// Massimo numero di binding assegnabili a un singolo tasto.
const MAX_BINDINGS = 4

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
  def, bindings, dimmed, onClick,
}: {
  def: KeyDef
  bindings: { action: string; color: string; category: string }[]
  dimmed: boolean
  onClick: () => void
}) {
  const w = def.w ?? 1
  const styled = bindings.length > 0
  const multi = bindings.length > 1
  const rects = colorRects(bindings.map((b) => b.color))
  // Un solo binding: testo a contrasto sul colore. Più binding: testo chiaro con
  // ombra, leggibile sopra qualsiasi riquadro di colore.
  const textColor = bindings.length === 1 ? contrastText(bindings[0].color) : "#faf9f5"
  const title = styled
    ? `${bindings.map((b) => `${b.action} — ${b.category}`).join("\n")}\n(${def.label})`
    : def.label

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        width: keyWidth(w),
        height: def.tall ? `calc(2 * ${UNIT_REM}rem + ${GAP_REM}rem)` : `${UNIT_REM}rem`,
        ...(styled
          ? { color: textColor, borderColor: "transparent", ...(multi ? { textShadow: "0 1px 2px rgba(0,0,0,0.7)" } : {}) }
          : {}),
      }}
      className={cn(
        "relative flex shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border px-0.5 text-center transition-transform hover:z-10 hover:scale-105",
        !styled && "border-border bg-muted text-muted-foreground",
        dimmed && "opacity-20"
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
      {/* Contenuto sopra i riquadri */}
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
}

function KeybindsBoard({ project }: { project: project }) {
  const dispatch = useAppDispatch()
  const { t } = useTranslation()

  const [activeMap, setActiveMap] = useState(0)
  const [modFilter, setModFilter] = useState("all")
  const [tagFilter, setTagFilter] = useState("all")
  const [search, setSearch] = useState("")

  // Dialog binding: lista di righe (fino a MAX_BINDINGS) azione + mod.
  const [editing, setEditing] = useState<KeyDef | null>(null)
  const [draftBindings, setDraftBindings] = useState<
    { action: string; actionKey?: string; category: string }[]
  >([])

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
  // Un tasto può avere più binding: raggruppo per `key` (max MAX_BINDINGS).
  const bindingsByKey = new Map<string, keybind[]>()
  for (const kb of current?.keybinds ?? []) {
    const arr = bindingsByKey.get(kb.key)
    if (arr) arr.push(kb)
    else bindingsByKey.set(kb.key, [kb])
  }
  const categoryOf = (name: string) => categories.find((c) => c.name === name)
  const colorOf = (name: string) => categoryOf(name)?.color ?? "#888888"

  // Azioni keybind derivate dalla scansione UNIFICATA dei mod (cache SQLite
  // `mods:<workpath>`). Al mount: se la cache è presente la si carica subito;
  // se è assente si esegue la scansione (metadati + keybind in un colpo), così
  // la pagina è utilizzabile anche senza aver prima aperto List Mods.
  const keybindActions = useAppSelector(selectKeybindActions)
  const workpath = project.configs.workpath
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

  const bootstrapped = useRef<string | null>(null)
  useEffect(() => {
    if (bootstrapped.current === workpath) return
    bootstrapped.current = workpath
    let cancelled = false
    ;(async () => {
      try {
        // L'hint di versione decide il formato di metadati/lang atteso (Forge
        // legacy vs moderno) e fa parte della chiave di cache.
        const hint = await resolveScanHint(project)
        if (cancelled) return
        let mods = await peekModsScanCache(workpath, hint)
        if (cancelled) return
        if (!mods) {
          // Nessuna cache: scansione unificata (una sola apertura dei jar).
          setScanning(true)
          mods = await getModsScanCached(workpath, false, hint)
        }
        if (cancelled) return
        setScanMods(mods)
        dispatch(setKeybindActions({ workpath, mods: toActions(mods) }))
      } catch (err) {
        console.error(err)
      } finally {
        if (!cancelled) setScanning(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workpath, dispatch])

  // Scansione unificata dei jar (via cache SQLite). `force` = refresh manuale.
  async function scanKeybinds(force: boolean) {
    setScanning(true)
    dispatch(setKeybindActionsLoading(true))
    try {
      const mods = await getModsScanCached(workpath, force, await resolveScanHint(project))
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
    return kb && kb.length > 0
      ? kb.map((a) => ({ value: a.key, label: a.label }))
      : null
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
  function matchesFilters(binding?: keybind): boolean {
    if (!binding) return modFilter === "all" && tagFilter === "all" && !query
    if (modFilter !== "all" && binding.category !== modFilter) return false
    if (tagFilter !== "all" && !(categoryOf(binding.category)?.tags ?? []).includes(tagFilter)) return false
    if (query && !binding.action.toLowerCase().includes(query)) return false
    return true
  }

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
  function openKey(def: KeyDef) {
    const existing = bindingsByKey.get(def.id) ?? []
    setEditing(def)
    setDraftBindings(
      existing.length > 0
        ? existing.map((kb) => ({ action: kb.action, actionKey: kb.actionKey, category: kb.category }))
        : [{ action: "", actionKey: undefined, category: categories[0]?.name ?? "" }]
    )
  }
  function addDraftBinding() {
    setDraftBindings((prev) =>
      prev.length >= MAX_BINDINGS
        ? prev
        : [...prev, { action: "", actionKey: undefined, category: categories[0]?.name ?? "" }]
    )
  }
  function updateDraftBinding(
    index: number,
    patch: Partial<{ action: string; actionKey?: string; category: string }>
  ) {
    setDraftBindings((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)))
  }
  function removeDraftBinding(index: number) {
    setDraftBindings((prev) => prev.filter((_, i) => i !== index))
  }
  // Binding validi correnti del dialog, legati al tasto in modifica.
  function draftToKeybinds(keyId: string): keybind[] {
    return draftBindings
      .filter((b) => b.action.trim() && b.category)
      .slice(0, MAX_BINDINGS)
      .map((b) => ({
        key: keyId,
        action: b.action.trim(),
        category: b.category,
        ...(b.actionKey ? { actionKey: b.actionKey } : {}),
      }))
  }
  function saveBinding() {
    if (!editing || !current) return
    // Rimuovo tutti i binding del tasto e riaggiungo quelli con azione valida.
    const kept = current.keybinds.filter((kb) => kb.key !== editing.id)
    commitKeybinds([...kept, ...draftToKeybinds(editing.id)])
    setEditing(null)
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
    }))
    commit({ ...project, keybindMaps })
    setEditing(null)
  }
  function removeBinding() {
    if (!editing || !current) return
    commitKeybinds(current.keybinds.filter((kb) => kb.key !== editing.id))
    setEditing(null)
  }

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
    const list = bindingsByKey.get(item.id) ?? []
    const bindings = list.map((kb) => ({ action: kb.action, color: colorOf(kb.category), category: kb.category }))
    // Il tasto è "attivo" se almeno un binding matcha i filtri (o è vuoto).
    const dimmed = list.length === 0 ? !matchesFilters(undefined) : !list.some((kb) => matchesFilters(kb))
    return (
      <KeyCap
        key={item.id}
        def={item}
        bindings={bindings}
        dimmed={dimmed}
        onClick={() => openKey(item)}
      />
    )
  }

  function renderRow(row: KeyboardItem[], rowIndex: number) {
    return (
      <div key={rowIndex} className="flex items-end gap-1">
        {row.map((item, i) =>
          isSpacer(item)
            ? <div key={`sp-${i}`} style={{ width: keyWidth(item.spacer), height: keyWidth(item.spacer) }} className="shrink-0" />
            : renderKey(item)
        )}
      </div>
    )
  }

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
            {/* Click su un chip = modifica la mod */}
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
            {/* Click su un chip = modifica il tag */}
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
                  {tags.length > 0 && (
                    <Select value={tagFilter} onValueChange={setTagFilter}>
                      <SelectTrigger className="h-8 w-44">
                        <SelectValue placeholder={t("keybinds.allTags")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("keybinds.allTags")}</SelectItem>
                        {tags.map((t) => (
                          <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {categories.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-10 text-xs text-muted-foreground">{t("keybinds.modsLabel")}</span>
                    <FilterChip label={t("keybinds.all")} active={modFilter === "all"} onClick={() => setModFilter("all")} />
                    {categories.map((c) => (
                      <FilterChip
                        key={c.name}
                        label={c.name}
                        color={c.color}
                        active={modFilter === c.name}
                        onClick={() => setModFilter(modFilter === c.name ? "all" : c.name)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Tastiera + Numpad + Mouse */}
              <div className="overflow-x-auto">
                <div className="flex w-fit items-start gap-6">
                  <div className="space-y-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><KeyboardIcon className="size-4" /> {t("keybinds.keyboard")}</p>
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <div className="space-y-1">{MAIN_ROWS.map(renderRow)}</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">{t("keybinds.numpad")}</p>
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <div className="flex items-start gap-1">
                        <div className="space-y-1">{NUMPAD_ROWS.map(renderRow)}</div>
                        <div className="flex flex-col gap-1">{NUMPAD_SIDE.map(renderKey)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MouseIcon className="size-4" /> {t("keybinds.mouse")}</p>
                    <div className="rounded-xl border bg-muted/30 p-4">{renderRow(MOUSE_KEYS, 0)}</div>
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
                  {(current.macros ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("keybinds.noMacros")}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(current.macros ?? []).map((mc, i) => {
                        const color = colorOf(mc.category)
                        const dimmed = !matchesFilters(mc)
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => openEditMacro(i)}
                            title={`${mc.action} — ${mc.category}`}
                            style={{ background: color, color: contrastText(color) }}
                            className={cn(
                              "flex items-center gap-2 rounded-md border border-transparent px-3 py-1.5 text-left transition-transform hover:z-10 hover:scale-105",
                              dimmed && "opacity-20"
                            )}
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
        <DialogContent className="max-w-xl!"
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
                <span className="text-xs text-muted-foreground">{draftBindings.length}/{MAX_BINDINGS}</span>
              </div>
              {draftBindings.map((b, i) => {
                const color = colorOf(b.category)
                const actions = actionsForCategory(b.category)
                const selected = actions?.find((a) => a.value === b.actionKey) ?? null
                return (
                  <div key={i} className="flex items-center gap-2">
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
                            updateDraftBinding(i, { actionKey: v?.value, action: v?.label ?? "" })
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
                        onChange={(e) => updateDraftBinding(i, { action: e.target.value, actionKey: undefined })}
                        autoFocus={i === 0}
                        className="flex-1"
                      />
                    )}
                    <Select
                      value={b.category}
                      onValueChange={(v) => updateDraftBinding(i, { category: v, action: "", actionKey: undefined })}
                    >
                      <SelectTrigger className="h-8 w-36 shrink-0">
                        <SelectValue placeholder={t("keybinds.modPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => removeDraftBinding(i)}
                      aria-label={t("keybinds.removeBinding")}
                    >
                      <XIcon />
                    </Button>
                  </div>
                )
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addDraftBinding}
                disabled={draftBindings.length >= MAX_BINDINGS}
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
                  onClick={saveBindingToAll}
                  disabled={categories.length === 0 || draftBindings.some((b) => b.action.trim() && !b.category)}
                  title={t("keybinds.allProfilesTitle")}
                >
                  <LayersIcon /> {t("keybinds.allProfiles")}
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
  return <ProjectGate>{(project) => <KeybindsBoard project={project} />}</ProjectGate>
}
