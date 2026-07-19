"use client"

import { useEffect, useRef, useState } from "react"
import { KeyboardIcon, MouseIcon, PlusIcon, Trash2Icon, MapIcon, XIcon, PencilIcon, SearchIcon, BoxesIcon, TagsIcon, DownloadIcon, RefreshCcwIcon } from "lucide-react"

import { ProjectGate } from "../../components/project-gate"
import { ExportDialog } from "../../components/keybinds/export-dialog"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
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
import { getKeybindActionsCached, peekKeybindActionsCache } from "../../lib/keybind-cache"
import { cn } from "../../lib/utils"
import { keybind, keybindCategory, keybindMap, keybindTag, mod, project } from "../../model/models"
import {
  MAIN_ROWS,
  NUMPAD_ROWS,
  NUMPAD_SIDE,
  MOUSE_KEYS,
  KeyDef,
  KeyboardItem,
  isSpacer,
} from "../../lib/keyboard-layout"
import { defaultKeybinds, defaultCategories, defaultTags, vanillaActions } from "../../lib/keybind-template"

const UNIT_REM = 2.5
const GAP_REM = 0.25

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
        <button type="button" onClick={onEdit} className="-mr-1.5 ml-0.5 opacity-60 hover:opacity-100" aria-label={`Edit ${label}`}>
          <PencilIcon className="size-3" />
        </button>
      )}
    </div>
  )
}

// Massimo numero di binding assegnabili a un singolo tasto.
const MAX_BINDINGS = 4

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

  // Dialog Export config.
  const [exportOpen, setExportOpen] = useState(false)

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

  // Azioni keybind estratte dai jar (runtime, non nel project). NON si scansiona
  // al mount: si carica solo dalla cache SQLite se presente. La scansione vera
  // (lettura dei jar) parte dalla sezione di import (dialog Add Mod, quando non
  // c'è cache) o dal refresh manuale.
  const keybindActions = useAppSelector(selectKeybindActions)
  const workpath = project.configs.workpath
  const [scanning, setScanning] = useState(false)

  const bootstrapped = useRef<string | null>(null)
  useEffect(() => {
    if (bootstrapped.current === workpath) return
    bootstrapped.current = workpath
    if (keybindActions.workpath === workpath) return
    let cancelled = false
    ;(async () => {
      try {
        const cached = await peekKeybindActionsCache(workpath)
        if (!cancelled && cached) dispatch(setKeybindActions({ workpath, mods: cached }))
      } catch (err) {
        console.error(err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workpath, keybindActions.workpath, dispatch])

  // Scansiona le keybind dei jar (via cache SQLite). `force` = refresh manuale.
  async function scanKeybinds(force: boolean) {
    setScanning(true)
    dispatch(setKeybindActionsLoading(true))
    try {
      const mods = await getKeybindActionsCached(workpath, force)
      dispatch(setKeybindActions({ workpath, mods }))
    } catch (err) {
      console.error(err)
      dispatch(setKeybindActionsError(String(err)))
    } finally {
      setScanning(false)
    }
  }

  // Mappa nome-mod -> mod (la category dei keybind è il nome della mod).
  const modByName = new Map(project.mods.map((m) => [m.name, m]))
  // Azioni selezionabili per una category. Ritorna `null` quando la category è
  // una mod reale ma senza keybind scansionate (→ la UI mostra input libero,
  // così non si suggeriscono azioni vanilla che non le appartengono).
  function actionsForCategory(name: string): { value: string; label: string }[] | null {
    const m = modByName.get(name)
    if (m) {
      const scanned = keybindActions.byModId[m.modId]
      return scanned && scanned.length > 0
        ? scanned.map((a) => ({ value: a.key, label: a.label }))
        : null
    }
    // Categoria non-mod (es. default UI/Movimento/Inventario): azioni vanilla.
    return vanillaActions().map((a) => ({ value: a.actionKey, label: a.label }))
  }

  function commit(next: project) {
    dispatch(updateProject(next))
  }

  function commitKeybinds(keybinds: keybind[]) {
    const keybindMaps = maps.map((m, i) => (i === activeMap ? { ...m, keybinds } : m))
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
  function saveBinding() {
    if (!editing || !current) return
    // Rimuovo tutti i binding del tasto e riaggiungo quelli con azione valida.
    const kept = current.keybinds.filter((kb) => kb.key !== editing.id)
    const added: keybind[] = draftBindings
      .filter((b) => b.action.trim() && b.category)
      .slice(0, MAX_BINDINGS)
      .map((b) => ({
        key: editing.id,
        action: b.action.trim(),
        category: b.category,
        ...(b.actionKey ? { actionKey: b.actionKey } : {}),
      }))
    commitKeybinds([...kept, ...added])
    setEditing(null)
  }
  function removeBinding() {
    if (!editing || !current) return
    commitKeybinds(current.keybinds.filter((kb) => kb.key !== editing.id))
    setEditing(null)
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
              <CardTitle className="text-2xl">Mods</CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void scanKeybinds(true)}
                disabled={scanning}
                aria-label="Rescan mod keybinds"
                title="Rescan mod keybinds"
              >
                <RefreshCcwIcon className={cn(scanning && "ease-in-out animate-spin")} />
              </Button>
              <Button variant="outline" size="sm" onClick={openAddMod}><PlusIcon /> Mod</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 py-3">
            {categories.length === 0 && tags.length === 0 && (
              <p className="text-sm text-muted-foreground">Add a mod to start.</p>
            )}
            {/* Click su un chip = modifica la mod */}
            {categories.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-10 text-xs text-muted-foreground">Mods</span>
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
              <CardTitle className="text-2xl">Tag</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={openAddTag}><PlusIcon /> Tag</Button>
          </CardHeader>
          <CardContent className="space-y-2 py-3">
            {categories.length === 0 && tags.length === 0 && (
              <p className="text-sm text-muted-foreground">Add a tag to start.</p>
            )}
            {/* Click su un chip = modifica il tag */}
            {tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-10 text-xs text-muted-foreground">Tags</span>
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
          <CardTitle className="text-2xl">Keybinds</CardTitle>
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
                      <button type="button" onClick={() => openEditMap(i)} className="rounded-full p-0.5 hover:bg-black/10" aria-label="Edit map">
                        <PencilIcon className="size-3" />
                      </button>
                      <button type="button" onClick={() => removeMap(i)} className="rounded-full p-0.5 hover:bg-black/10" aria-label="Remove map">
                        <XIcon className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )
            })}
            <Button variant="ghost" size="sm" onClick={openAddMap}><PlusIcon /> Map</Button>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setExportOpen(true)}
              disabled={maps.length === 0}
            >
              <DownloadIcon /> Export
            </Button>
          </div>

          {!current ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <MapIcon className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground">No keybind maps yet.</p>
              <Button variant="outline" onClick={openAddMap}><PlusIcon /> Add map</Button>
            </div>
          ) : (
            <>
              {/* Filtri per la tastiera: ricerca azione + Tag (select) + Mod (chip) */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-48 flex-1 max-w-xs">
                    <SearchIcon className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search action..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-8 pl-8"
                    />
                  </div>
                  {tags.length > 0 && (
                    <Select value={tagFilter} onValueChange={setTagFilter}>
                      <SelectTrigger className="h-8 w-44">
                        <SelectValue placeholder="All tags" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All tags</SelectItem>
                        {tags.map((t) => (
                          <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {categories.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-10 text-xs text-muted-foreground">Mods</span>
                    <FilterChip label="All" active={modFilter === "all"} onClick={() => setModFilter("all")} />
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
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><KeyboardIcon className="size-4" /> Keyboard</p>
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <div className="space-y-1">{MAIN_ROWS.map(renderRow)}</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">Numpad</p>
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <div className="flex items-start gap-1">
                        <div className="space-y-1">{NUMPAD_ROWS.map(renderRow)}</div>
                        <div className="flex flex-col gap-1">{NUMPAD_SIDE.map(renderKey)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MouseIcon className="size-4" /> Mouse</p>
                    <div className="rounded-xl border bg-muted/30 p-4">{renderRow(MOUSE_KEYS, 0)}</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
            <p className="text-sm text-muted-foreground">No mods yet. Add a mod first.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Bindings</Label>
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
                        <Combobox
                          items={actions}
                          value={selected}
                          onValueChange={(v: { value: string; label: string } | null) =>
                            updateDraftBinding(i, { actionKey: v?.value, action: v?.label ?? "" })
                          }
                          isItemEqualToValue={(a, c) => a?.value === c?.value}
                        >
                          <ComboboxInput placeholder="Select action" />
                          <ComboboxContent>
                            <ComboboxEmpty>No actions found.</ComboboxEmpty>
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
                        placeholder="e.g. Open inventory"
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
                        <SelectValue placeholder="Mod" />
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
                      aria-label="Remove binding"
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
                <PlusIcon /> Add binding
              </Button>
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            {bindingsByKey.has(editing?.id ?? "") ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={removeBinding}><Trash2Icon /> Remove</Button>
            ) : <span />}
            <Button
              type="button"
              onClick={saveBinding}
              disabled={categories.length === 0 || draftBindings.some((b) => b.action.trim() && !b.category)}
            >
              Save
            </Button>
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
            <DialogTitle>{editingMod ? "Edit mod" : "Add mod"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mod</Label>
              <Combobox items={project.mods} value={modName} onValueChange={(value: string | null) => setModName(value ?? "")}>
                <ComboboxInput placeholder="Select a mod" />
                <ComboboxContent>
                  <ComboboxEmpty>No mods found.</ComboboxEmpty>
                  <ComboboxList>
                    {(item: mod) => (
                      <ComboboxItem key={item.filename} value={item.name}>{item.name}</ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
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
                <Label>Tags</Label>
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
              <Button type="button" variant="ghost" className="text-destructive" onClick={removeMod}><Trash2Icon /> Remove</Button>
            ) : <span />}
            <Button type="button" onClick={saveMod} disabled={!modName.trim()}>{editingMod ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Add/Edit Tag */}
      <Dialog open={tagOpen} onOpenChange={setTagOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTag ? "Edit tag" : "Add tag"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="tag-name">Name</Label>
            <Input id="tag-name" placeholder="e.g. Movement" value={tagName} onChange={(e) => setTagName(e.target.value)} autoFocus />
          </div>
          <DialogFooter className="sm:justify-between">
            {editingTag ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={removeTag}><Trash2Icon /> Remove</Button>
            ) : <span />}
            <Button type="button" onClick={saveTag} disabled={!tagName.trim()}>{editingTag ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Add/Edit Map */}
      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMapIndex !== null ? "Edit map" : "Add map"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="map-name">Name</Label>
            <Input id="map-name" placeholder="e.g. Tech & Weapons" value={mapName} onChange={(e) => setMapName(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" onClick={saveMap} disabled={!mapName.trim()}>{editingMapIndex !== null ? "Save" : "Add"}</Button>
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
    </div>
  )
}

export default function KeybindsPage() {
  return <ProjectGate>{(project) => <KeybindsBoard project={project} />}</ProjectGate>
}
