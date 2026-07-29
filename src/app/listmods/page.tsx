"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { RefreshCcwIcon, PackageIcon, CircleCheckIcon, CircleSlashIcon, CircleXIcon, CircleAlertIcon, SearchIcon, LayersIcon, TriangleAlertIcon, ChevronUpIcon, ChevronDownIcon, ChevronsUpDownIcon, FilterXIcon } from "lucide-react"
import { toast } from "sonner"

import { useTranslation } from "@/src/i18n/i18n-provider"
import { ProjectGate } from "../../components/project-gate"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Badge } from "../../components/ui/badge"
import { Checkbox } from "../../components/ui/checkbox"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group"
import { cn } from "../../lib/utils"
import { useAppDispatch, useAppSelector } from "../../redux/hooks"
import { updateProject } from "../../redux/project-slice"
import { setByPath } from "../../lib/json-data"
import { scannedMod } from "../../lib/mods-scan"
import { resolveScanHint } from "../../lib/forge-spec"
import {
  datapacksDir,
  diffDatapacks,
  diffMods,
  getDatapacksScanForLoad,
  getModsScanForLoad,
  hasChanges,
  refreshDatapacksScan,
  refreshModsScan,
  toProjectDatapacks,
  toProjectMods,
} from "../../lib/mods-sync"
import { mod, modloaderTypes, project, toastStyles } from "../../model/models"
import { useBusy } from "../../lib/use-busy"

// modId "ambiente" forniti dal loader/runtime: sempre soddisfatti, non sono mod.
const RUNTIME_DEPS = new Set([
  "minecraft",
  "java",
  "forge",
  "neoforge",
  "fabricloader",
  "fabric",
  "quilt_loader",
  "quilt_base",
])

/**
 * Ritorna i modId delle dipendenze obbligatorie non soddisfatte da `installedIds`.
 * Ignora le dipendenze opzionali e quelle verso loader/runtime.
 */
function missingDependencies(target: mod, installedIds: Set<string>): string[] {
  return (target.dependencies ?? [])
    .filter((dep) => dep.mandatory)
    .map((dep) => dep.name)
    .filter((name) => {
      const id = name.toLowerCase()
      return !RUNTIME_DEPS.has(id) && !installedIds.has(id)
    })
}

/**
 * Fuzzy match "a sottosequenza": ogni carattere di `query` deve comparire in
 * `text` nello stesso ordine (non necessariamente contiguo). Ritorna un punteggio
 * (più alto = match migliore) o `null` se non combacia. Premia i caratteri
 * consecutivi e quelli a inizio parola, così i match più "compatti" salgono.
 */
function fuzzyMatch(query: string, text: string): number | null {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let score = 0
  let ti = 0
  let consecutive = 0
  for (let qi = 0; qi < q.length; qi++) {
    const found = t.indexOf(q[qi], ti)
    if (found === -1) return null
    if (found === ti) {
      // carattere immediatamente successivo al precedente match
      consecutive++
      score += 5 + consecutive
    } else {
      consecutive = 0
      score += 1
    }
    // bonus se il match cade a inizio parola
    if (found === 0 || /[\s\-_./]/.test(t[found - 1])) score += 3
    ti = found + 1
  }
  return score
}

/** Miglior punteggio fuzzy della `query` fra i campi rilevanti della mod. */
function modScore(m: mod, query: string): number | null {
  const fields = [m.name, m.filename, m.modId ?? "", ...(m.authors ?? [])]
  let best: number | null = null
  for (const f of fields) {
    const s = fuzzyMatch(query, f)
    if (s !== null && (best === null || s > best)) best = s
  }
  return best
}

// Diagnostica per jar, dalla scansione (non persistita nel project.json).
interface scanDiagnostic {
  format: string
  warnings: string[]
  /** Vincolo di versione MC dichiarato dalla mod (dialetto del suo loader). */
  mcVersion?: string | null
  /** Esito del confronto col MC del progetto; null = non verificabile. */
  mcCompatible?: boolean | null
}

/**
 * Etichetta breve del formato di metadati rilevato dalla scansione. I valori
 * arrivano da Rust (`ScannedMod.format`): "forge:mods.toml", "forge:mcmod.info",
 * "neoforge:mods.toml", "fabric:fabric.mod.json", "quilt:quilt.mod.json",
 * "unknown:manifest", "unknown", "unreadable".
 */
function formatLabel(format: string | undefined, t: (key: string) => string): string {
  if (!format) return "—"
  if (format === "unknown") return t("listmods.formatNone")
  if (format === "unknown:manifest") return "MANIFEST.MF"
  if (format === "unreadable") return t("listmods.formatUnreadable")
  const file = format.split(":")[1]
  return file || format
}

// ============================================================================
// ORDINAMENTO E FILTRI DELLA TABELLA MOD
// ============================================================================

// Colonne ordinabili. Le chiavi NON sono i nomi dei campi: "deps" ordina per
// numero di dipendenze mancanti, "active" per stato del checkbox.
type sortKey = "active" | "name" | "version" | "loader" | "mc" | "format" | "authors" | "deps"
type sortDir = "asc" | "desc"
type sortState = { key: sortKey; dir: sortDir } | null

// Chip di filtro. `active`/`inactive` sono lo STATO, gli altri sono i PROBLEMI:
// due gruppi distinti (vedi `matchesFilters`).
type filterChip = "active" | "inactive" | "missing" | "warnings" | "incompatible"

const STATUS_CHIPS: filterChip[] = ["active", "inactive"]

// Ordinamento di partenza della tabella: alfabetico per nome della mod. L'ordine
// della scansione è alfabetico per FILENAME, che non coincide col nome mostrato
// (es. "jei-1.20.1.jar" → "Just Enough Items").
const DEFAULT_SORT: NonNullable<sortState> = { key: "name", dir: "asc" }

// Confronto naturale: mette "1.10.0" DOPO "1.9.0", che un ordinamento
// alfabetico sbaglierebbe. Non si usa semver: le versioni delle mod spesso non
// lo sono ("1.20.1-forge-47.2.0", "v2b", "mc1.12.2-3.1.0").
const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })

interface sortContext {
  diagnostics: Map<string, scanDiagnostic>
  installedIds: Set<string>
  t: (key: string) => string
}

/**
 * Valore su cui ordinare una mod per la colonna richiesta. I numeri si
 * confrontano come numeri, le stringhe col collator naturale.
 */
function sortValue(m: mod, key: sortKey, ctx: sortContext): string | number {
  switch (key) {
    case "active":
      // Attive prima in ordine crescente.
      return m.active ? 0 : 1
    case "name":
      return m.name || m.filename
    case "version":
      return m.version || ""
    case "loader":
      return m.modloader || ""
    case "format":
      // Si ordina per l'etichetta MOSTRATA, non per il valore grezzo.
      return formatLabel(ctx.diagnostics.get(m.filename)?.format, ctx.t)
    case "mc": {
      // Come `deps`: in crescente prima chi va bene, i problemi in fondo (e in
      // cima invertendo l'ordine).
      const compat = ctx.diagnostics.get(m.filename)?.mcCompatible
      if (compat === true) return 0
      if (compat === false) return 2
      return 1 // non verificabile: in mezzo
    }
    case "authors":
      return (m.authors ?? []).join(", ")
    case "deps":
      return missingDependencies(m, ctx.installedIds).length
  }
}

/** Comparatore per la colonna/direzione scelte; il nome è il tie-break stabile. */
function compareMods(a: mod, b: mod, sort: NonNullable<sortState>, ctx: sortContext): number {
  const va = sortValue(a, sort.key, ctx)
  const vb = sortValue(b, sort.key, ctx)
  let diff =
    typeof va === "number" && typeof vb === "number"
      ? va - vb
      : naturalCollator.compare(String(va), String(vb))
  // A parità di colonna l'ordine resta prevedibile invece di dipendere
  // dall'ordine di scansione.
  if (diff === 0 && sort.key !== "name") {
    diff = naturalCollator.compare(a.name || a.filename, b.name || b.filename)
  }
  return sort.dir === "asc" ? diff : -diff
}

/**
 * Filtro a chip: OR dentro lo stesso gruppo, AND tra gruppi.
 * Così "Active" + "Warnings" = le mod attive che hanno avvisi, mentre
 * "Missing deps" + "Warnings" = quelle con almeno uno dei due problemi.
 * Un gruppo senza chip selezionati non filtra.
 */
function matchesFilters(
  m: mod,
  filters: filterChip[],
  sets: { missing: Set<string>; warnings: Set<string>; incompatible: Set<string> }
): boolean {
  const status = filters.filter((f) => STATUS_CHIPS.includes(f))
  if (status.length > 0) {
    const ok = status.some((f) => (f === "active" ? m.active : !m.active))
    if (!ok) return false
  }
  const issues = filters.filter((f) => !STATUS_CHIPS.includes(f))
  if (issues.length > 0) {
    const ok = issues.some((f) => {
      if (f === "missing") return sets.missing.has(m.filename)
      if (f === "incompatible") return sets.incompatible.has(m.filename)
      return sets.warnings.has(m.filename)
    })
    if (!ok) return false
  }
  return true
}

/** Header di colonna cliccabile: asc → desc → nessun ordinamento. */
function SortableHead({
  label,
  column,
  sort,
  onSort,
  className,
  t,
}: {
  label: string
  column: sortKey
  sort: sortState
  onSort: (column: sortKey) => void
  className?: string
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  const active = sort?.key === column
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground cursor-pointer",
          active && "text-foreground font-medium"
        )}
        aria-label={t("listmods.sortBy", { column: label })}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ChevronUpIcon className="size-3.5" />
          ) : (
            <ChevronDownIcon className="size-3.5" />
          )
        ) : (
          <ChevronsUpDownIcon className="size-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  )
}

// Colori coerenti con i loader mostrati nella home.
const LOADER_STYLES: Record<string, string> = {
  forge: "border-[#ffc24b] text-[#ffc24b]",
  neoforge: "border-[#5bc8e8] text-[#5bc8e8]",
  fabric: "border-[#b48cff] text-[#b48cff]",
  quilt: "border-[#ff8ac2] text-[#ff8ac2]",
}

function SummaryCard({
  label,
  value,
  icon,
  className,
}: {
  label: string
  value: number
  icon: React.ReactNode
  className?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 px-4">
        <div className={cn("flex size-10 items-center justify-center rounded-lg bg-muted", className)}>
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function ModsList({ project }: { project: project }) {
  const dispatch = useAppDispatch()
  const { t } = useTranslation()
  // Cambia a ogni apertura di progetto: fa scattare la rilettura dal disco.
  const loadId = useAppSelector((s) => s.project.loadId)
  // Overlay globale durante le scansioni (bloccano l'interazione).
  const busy = useBusy()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  // Ordinamento scelto dall'utente; null = nessuna scelta, si usa `DEFAULT_SORT`
  // (o la rilevanza della ricerca, vedi `effectiveSort`).
  const [sort, setSort] = useState<sortState>(null)
  const [filters, setFilters] = useState<filterChip[]>([])

  const workpath = project.configs.workpath
  const mods = project.mods
  const datapacks = project.datapacks ?? []

  // Cosa mostrare in base al loader: solo datapack se il loader è "datapack";
  // anche i mod se è un loader classico o se la modalità ibrida è attiva.
  const loaderType = project.modloader.type
  const showMods = loaderType !== modloaderTypes.DATAPACK || !!project.modloader.hybrid
  const showDatapacks = loaderType === modloaderTypes.DATAPACK

  // Diagnostica per filename (formato rilevato + warning della scansione). Vive
  // solo a runtime: si legge dalla cache di scansione, non dal project.json.
  const [diagnostics, setDiagnostics] = useState<Map<string, scanDiagnostic>>(new Map())
  const applyDiagnostics = useCallback((scanned: scannedMod[]) => {
    setDiagnostics(
      new Map(
        scanned.map((s) => [
          s.filename,
          {
            format: s.format ?? "",
            warnings: s.warnings ?? [],
            mcVersion: s.mcVersion ?? null,
            mcCompatible: s.mcCompatible ?? null,
          },
        ])
      )
    )
  }, [])

  const [dpLoading, setDpLoading] = useState(false)
  const [dpError, setDpError] = useState<string | null>(null)
  const [dpSearch, setDpSearch] = useState("")

  // Ref sempre aggiornato al progetto corrente: usato dentro le callback senza
  // doverle ricreare a ogni cambio di stato (evita loop con gli effect).
  const projectRef = useRef(project)
  projectRef.current = project

  // Scansione UNIFICATA (metadati + keybind), sempre allineata al disco: alla
  // prima lettura di ogni APERTURA di progetto (`loadId`) i jar vengono riletti,
  // anche se il progetto era già salvato con le mod dentro; dentro la stessa
  // apertura si usa la cache SQLite, così navigare tra le pagine è istantaneo.
  // `mode = "refresh"` (pulsante) forza sempre la rilettura.
  // I keybind NON vengono copiati in project.mods (restano nella cache): il
  // project.json resta leggero.
  const scan = useCallback(async (mode: "open" | "refresh" = "open") => {
    setLoading(true)
    setError(null)
    try {
      // L'hint di versione seleziona il formato di metadati/lang atteso: i mod
      // Forge <= 1.12.2 usano mcmod.info + lang .lang, dal 1.13 mods.toml + JSON.
      const hint = await resolveScanHint(projectRef.current)
      // Aprire i jar è pesante (metadati + bytecode + lang): overlay bloccante.
      const scanned = await busy(
        t("busy.scanningMods"),
        () =>
          mode === "refresh"
            ? refreshModsScan(workpath, loadId, hint)
            : getModsScanForLoad(workpath, loadId, hint),
        { detail: workpath }
      )
      applyDiagnostics(scanned)

      const current = projectRef.current
      const mapped = toProjectMods(scanned, current.mods)
      const diff = diffMods(current.mods, mapped)
      // Aggiorna il project solo se il disco dice qualcosa di diverso: così il
      // semplice aprire la pagina non fa comparire la SaveBar a vuoto.
      if (hasChanges(diff)) {
        dispatch(updateProject(setByPath(current, "mods", mapped)))
        if (mode === "refresh") {
          toast.info(t("modsSync.modsUpdated", { ...diff }), {
            position: "top-right",
            style: toastStyles.info,
          })
        }
      }
    } catch (err) {
      console.error(err)
      // Niente diagnostica "di riporto": meglio vuota che del progetto sbagliato.
      setDiagnostics(new Map())
      setError(t("listmods.modsFolderNotFound"))
    } finally {
      setLoading(false)
    }
  }, [workpath, loadId, dispatch, t, applyDiagnostics, busy])

  // Sincronizzazione a ogni apertura di progetto (e al montaggio della pagina):
  // il wrapper "per apertura" evita di riaprire i jar a ogni navigazione.
  useEffect(() => {
    if (!showMods) return
    void scan()
  }, [scan, showMods])

  function toggleActive(filename: string) {
    const current = projectRef.current
    const updated = current.mods.map((m) =>
      m.filename === filename ? { ...m, active: !m.active } : m
    )
    dispatch(updateProject(setByPath(current, "mods", updated)))
  }

  // Scansione datapack (cache SQLite `datapacks:<dir>`), con la stessa regola
  // delle mod: rilettura dal disco a ogni apertura di progetto (o al cambio
  // della cartella configurata), cache dentro la stessa apertura.
  const datapacksPath = project.configs.datapacksPath
  const scanDatapacks = useCallback(async (mode: "open" | "refresh" = "open") => {
    setDpLoading(true)
    setDpError(null)
    try {
      const dir = await datapacksDir(projectRef.current)
      const scanned = await busy(
        t("busy.scanningDatapacks"),
        () =>
          mode === "refresh"
            ? refreshDatapacksScan(dir, loadId)
            : getDatapacksScanForLoad(dir, loadId),
        { detail: dir }
      )
      const current = projectRef.current
      const mapped = toProjectDatapacks(scanned, current.datapacks ?? [])
      const diff = diffDatapacks(current.datapacks ?? [], mapped)
      if (hasChanges(diff)) {
        dispatch(updateProject(setByPath(current, "datapacks", mapped)))
        if (mode === "refresh") {
          toast.info(t("modsSync.datapacksUpdated", { ...diff }), {
            position: "top-right",
            style: toastStyles.info,
          })
        }
      }
    } catch (err) {
      console.error(err)
      setDpError(t("listmods.datapacksFolderNotFound"))
    } finally {
      setDpLoading(false)
    }
  }, [workpath, loadId, datapacksPath, dispatch, t, busy])

  useEffect(() => {
    if (!showDatapacks) return
    void scanDatapacks()
  }, [scanDatapacks, showDatapacks])

  function toggleDatapackActive(filename: string) {
    const current = projectRef.current
    const updated = (current.datapacks ?? []).map((d) =>
      d.filename === filename ? { ...d, active: !d.active } : d
    )
    dispatch(updateProject(setByPath(current, "datapacks", updated)))
  }

  const total = mods.length
  const activeCount = mods.filter((m) => m.active).length
  const inactiveCount = total - activeCount

  // Insieme dei modId disponibili dalle mod attive: include tutti i `provides`
  // (modId multipli, campo provides e dipendenze incluse via JarJar). Fallback al
  // modId per progetti salvati prima dell'introduzione di `provides`.
  // Memoizzati: sono la base del filtro/ordinamento della tabella, e ricrearli a
  // ogni render vanificherebbe la memoizzazione di `visibleMods`.
  const installedIds = useMemo(
    () =>
      new Set(
        mods
          .filter((m) => m.active)
          .flatMap((m) => (m.provides?.length ? m.provides : [m.modId ?? ""]))
          .map((id) => id.toLowerCase())
      ),
    [mods]
  )

  const missing = useMemo(
    () => mods.filter((m) => m.active && missingDependencies(m, installedIds).length > 0),
    [mods, installedIds]
  )
  // Mod il cui jar ha prodotto avvisi in scansione (formato inatteso, metadati
  // malformati, nessun file di lingua...): vanno guardate a occhio.
  const withWarnings = useMemo(
    () => mods.filter((m) => (diagnostics.get(m.filename)?.warnings.length ?? 0) > 0),
    [mods, diagnostics]
  )
  // Mod il cui vincolo di versione MC dichiarato NON copre la versione del
  // progetto. A differenza delle dipendenze mancanti si contano anche le mod
  // disattivate: il dato dipende dal jar, non dallo stato del checkbox.
  const incompatible = useMemo(
    () => mods.filter((m) => diagnostics.get(m.filename)?.mcCompatible === false),
    [mods, diagnostics]
  )

  // Lista mostrata, in tre passaggi: chip → ricerca → ordinamento.
  const query = search.trim()

  // Ordinamento effettivo: quello scelto dall'utente se c'è, altrimenti il
  // default per nome — tranne mentre si cerca, dove senza una scelta esplicita
  // conta la rilevanza fuzzy (ordinare per nome i risultati di una ricerca
  // sotterrerebbe il match migliore).
  const effectiveSort: sortState = sort ?? (query ? null : DEFAULT_SORT)
  const missingSet = useMemo(() => new Set(missing.map((m) => m.filename)), [missing])
  const warningsSet = useMemo(() => new Set(withWarnings.map((m) => m.filename)), [withWarnings])
  const incompatibleSet = useMemo(
    () => new Set(incompatible.map((m) => m.filename)),
    [incompatible]
  )

  const visibleMods = useMemo(() => {
    const byChips =
      filters.length > 0
        ? mods.filter((m) =>
            matchesFilters(m, filters, {
              missing: missingSet,
              warnings: warningsSet,
              incompatible: incompatibleSet,
            })
          )
        : mods

    const bySearch = query
      ? byChips
          .map((m) => ({ m, score: modScore(m, query) }))
          .filter((x): x is { m: mod; score: number } => x.score !== null)
          .sort((a, b) => b.score - a.score)
          .map((x) => x.m)
      : byChips

    if (!effectiveSort) return bySearch
    const ctx: sortContext = { diagnostics, installedIds, t }
    // Copia: `sort` in place muterebbe l'array derivato da Redux.
    return [...bySearch].sort((a, b) => compareMods(a, b, effectiveSort, ctx))
  }, [
    mods,
    filters,
    missingSet,
    warningsSet,
    incompatibleSet,
    query,
    effectiveSort,
    diagnostics,
    installedIds,
    t,
  ])

  const filtersActive = filters.length > 0
  // Righe nascoste da ricerca o chip: serve a distinguere "nessuna mod" da
  // "nessun risultato" e a decidere se mostrare il contatore parziale.
  const isNarrowed = !!query || filtersActive

  function toggleSort(column: sortKey) {
    setSort((current) => {
      // Il ciclo parte da ciò che l'utente VEDE, non dallo stato interno: se la
      // tabella è già ordinata per nome (default), il primo click su "Mod" deve
      // invertire l'ordine, non riapplicare il crescente.
      const active = current ?? (query ? null : DEFAULT_SORT)
      if (active?.key !== column) return { key: column, dir: "asc" }
      if (active.dir === "asc") return { key: column, dir: "desc" }
      // Terzo click: si torna al default (per nome, o alla rilevanza se si sta cercando).
      return null
    })
  }

  function clearFilters() {
    setFilters([])
    setSearch("")
  }

  // Datapack: totali + filtro semplice per nome/file.
  const dpTotal = datapacks.length
  const dpActive = datapacks.filter((d) => d.active).length
  const dpQuery = dpSearch.trim().toLowerCase()
  const visibleDatapacks = dpQuery
    ? datapacks.filter(
        (d) => d.name.toLowerCase().includes(dpQuery) || d.filename.toLowerCase().includes(dpQuery)
      )
    : datapacks

  return (
    <div className="flex flex-col gap-4">
      {showMods && (<>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        <SummaryCard
          label={t("listmods.totalMods")}
          value={total}
          icon={<PackageIcon className="size-5 text-muted-foreground" />}
        />
        <SummaryCard
          label={t("listmods.active")}
          value={activeCount}
          icon={<CircleCheckIcon className="size-5 text-emerald-500" />}
          className="bg-emerald-500/10"
        />
        <SummaryCard
          label={t("listmods.inactive")}
          value={inactiveCount}
          icon={<CircleSlashIcon className="size-5 text-amber-500" />}
          className="bg-amber-500/10"
        />
        <SummaryCard
          label={t("listmods.missingDependencies")}
          value={missing.length}
          icon={<CircleXIcon className="size-5 text-red-500" />}
          className="bg-red-500/10"
        />
        <SummaryCard
          label={t("listmods.incompatible")}
          value={incompatible.length}
          icon={<CircleAlertIcon className="size-5 text-red-500" />}
          className="bg-red-500/10"
        />
        <SummaryCard
          label={t("listmods.withWarnings")}
          value={withWarnings.length}
          icon={<TriangleAlertIcon className="size-5 text-amber-500" />}
          className="bg-amber-500/10"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-2xl">
            {t("listmods.mods")}{" "}
            {total > 0 && (
              <span className="text-muted-foreground text-base">
                ({isNarrowed ? `${visibleMods.length}/${total}` : total})
              </span>
            )}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => void scan("refresh")} disabled={loading} aria-label={t("listmods.refresh")}>
            <RefreshCcwIcon className={cn(loading && "ease-in-out animate-spin")} />
          </Button>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <PackageIcon className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground">{error}</p>
              <p className="text-xs text-muted-foreground">{t("listmods.expected", { path: `${workpath}\\mods` })}</p>
            </div>
          ) : !loading && total === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <PackageIcon className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground">{t("listmods.noMods")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-56 flex-1">
                  <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("listmods.searchModsPlaceholder")}
                    className="h-9 pl-8"
                    aria-label={t("listmods.searchMods")}
                  />
                </div>
                {/* Chip di filtro: multi-selezione, col conteggio delle mod in
                    ciascuno stato (gli stessi numeri delle card di riepilogo). */}
                <ToggleGroup
                  type="multiple"
                  value={filters}
                  onValueChange={(value: string[]) => setFilters(value as filterChip[])}
                  variant="outline"
                  size="lg"
                  className="flex-wrap"
                  aria-label={t("listmods.filters")}
                >
                  <ToggleGroupItem
                    value="active"
                    className="data-[state=on]:border-emerald-500 data-[state=on]:text-emerald-500"
                  >
                    <CircleCheckIcon className="size-3.5" />
                    {t("listmods.active")}
                    <span className="text-muted-foreground text-xs">{activeCount}</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="inactive"
                    className="data-[state=on]:border-amber-500 data-[state=on]:text-amber-500"
                  >
                    <CircleSlashIcon className="size-3.5" />
                    {t("listmods.inactive")}
                    <span className="text-muted-foreground text-xs">{inactiveCount}</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="missing"
                    className="data-[state=on]:border-red-500 data-[state=on]:text-red-500"
                  >
                    <CircleXIcon className="size-3.5" />
                    {t("listmods.missingDependencies")}
                    <span className="text-muted-foreground text-xs">{missing.length}</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="incompatible"
                    className="data-[state=on]:border-red-500 data-[state=on]:text-red-500"
                  >
                    <CircleAlertIcon className="size-3.5" />
                    {t("listmods.incompatible")}
                    <span className="text-muted-foreground text-xs">{incompatible.length}</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="warnings"
                    className="data-[state=on]:border-amber-500 data-[state=on]:text-amber-500"
                  >
                    <TriangleAlertIcon className="size-3.5" />
                    {t("listmods.withWarnings")}
                    <span className="text-muted-foreground text-xs">{withWarnings.length}</span>
                  </ToggleGroupItem>
                </ToggleGroup>
                {isNarrowed && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <FilterXIcon className="size-3.5" />
                    {t("listmods.clearFilters")}
                  </Button>
                )}
              </div>
              {isNarrowed && visibleMods.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <SearchIcon className="size-10 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    {query ? t("listmods.noModsMatch", { query }) : t("listmods.noModsMatchFilters")}
                  </p>
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    <FilterXIcon className="size-3.5" />
                    {t("listmods.clearFilters")}
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead label={t("listmods.on")} column="active" sort={effectiveSort} onSort={toggleSort} className="w-12" t={t} />
                      <SortableHead label={t("listmods.mod")} column="name" sort={effectiveSort} onSort={toggleSort} t={t} />
                      <SortableHead label={t("listmods.version")} column="version" sort={effectiveSort} onSort={toggleSort} className="w-32" t={t} />
                      <SortableHead label={t("listmods.loader")} column="loader" sort={effectiveSort} onSort={toggleSort} className="w-28" t={t} />
                      <SortableHead label={t("listmods.mcVersion")} column="mc" sort={effectiveSort} onSort={toggleSort} className="w-36" t={t} />
                      <SortableHead label={t("listmods.format")} column="format" sort={effectiveSort} onSort={toggleSort} className="w-40" t={t} />
                      <SortableHead label={t("listmods.authors")} column="authors" sort={effectiveSort} onSort={toggleSort} t={t} />
                      <SortableHead label={t("listmods.dependencies")} column="deps" sort={effectiveSort} onSort={toggleSort} className="w-40" t={t} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleMods.map((m) => (
                      <TableRow key={m.filename} className={cn(!m.active && "opacity-50")}>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={m.active}
                            onCheckedChange={() => toggleActive(m.filename)}
                            aria-label={t("listmods.enable", { name: m.name })}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{m.name}</div>
                          <div className="text-xs text-muted-foreground">{m.filename}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{m.version || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("capitalize", LOADER_STYLES[m.modloader])}>
                            {m.modloader}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            // Compatibilità col Minecraft del progetto: si mostra
                            // il vincolo dichiarato dalla mod, colorato secondo
                            // l'esito. Grigio = non verificabile (sintassi non
                            // riconosciuta): NON è un errore della mod.
                            const diag = diagnostics.get(m.filename)
                            const constraint = diag?.mcVersion
                            if (!constraint) {
                              return <span className="text-muted-foreground">—</span>
                            }
                            const compat = diag?.mcCompatible
                            const mcTarget = project.modloader.mcversion
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex cursor-default items-center gap-2">
                                    <span
                                      className={cn(
                                        "size-2.5 shrink-0 rounded-full",
                                        compat === true && "bg-emerald-500",
                                        compat === false && "bg-red-500",
                                        compat == null && "bg-muted-foreground"
                                      )}
                                    />
                                    <span
                                      className={cn(
                                        "truncate font-mono text-xs",
                                        compat === false ? "text-red-500" : "text-muted-foreground"
                                      )}
                                    >
                                      {constraint}
                                    </span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-80">
                                  {compat === false
                                    ? t("listmods.mcIncompatible", { constraint, mc: mcTarget })
                                    : compat === true
                                      ? t("listmods.mcCompatible", { constraint, mc: mcTarget })
                                      : t("listmods.mcUnchecked", { constraint })}
                                </TooltipContent>
                              </Tooltip>
                            )
                          })()}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            // Diagnostica: formato di metadati rilevato nel jar +
                            // avvisi della scansione (tooltip). Assente se la
                            // cache di scansione non c'è ancora.
                            const diag = diagnostics.get(m.filename)
                            if (!diag) return <span className="text-muted-foreground">—</span>
                            const label = formatLabel(diag.format, t)
                            const unknown = !diag.format || diag.format.startsWith("unknown") || diag.format === "unreadable"
                            return (
                              <span className="flex items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className={cn("font-mono text-[10px]", unknown && "border-muted-foreground text-muted-foreground")}
                                >
                                  {label}
                                </Badge>
                                {diag.warnings.length > 0 && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-default text-amber-500">
                                        <TriangleAlertIcon className="size-3.5" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-80">
                                      <div className="font-medium">{t("listmods.scanWarnings")}</div>
                                      <ul className="list-disc pl-4">
                                        {diag.warnings.map((w, i) => (
                                          <li key={i}>{w}</li>
                                        ))}
                                      </ul>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </span>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {m.authors && m.authors.length > 0 ? m.authors.join(", ") : "—"}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const missing = missingDependencies(m, installedIds)
                            if (missing.length === 0) {
                              return (
                                <span className="flex items-center gap-2">
                                  <span className="size-2.5 shrink-0 rounded-full bg-emerald-500" />
                                  <span className="text-xs text-muted-foreground">{t("listmods.ok")}</span>
                                </span>
                              )
                            }
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-2 cursor-default">
                                    <span className="size-2.5 shrink-0 rounded-full bg-red-500" />
                                    <span className="truncate text-xs text-red-500">{missing.join(", ")}</span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="font-medium">{t("listmods.missingDependencies")}</div>
                                  <ul className="list-disc pl-4">
                                    {missing.map((dep) => (
                                      <li key={dep}>{dep}</li>
                                    ))}
                                  </ul>
                                </TooltipContent>
                              </Tooltip>
                            )
                          })()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      </>)}

      {showDatapacks && (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
            <SummaryCard
              label={t("listmods.totalDatapacks")}
              value={dpTotal}
              icon={<LayersIcon className="size-5 text-muted-foreground" />}
            />
            <SummaryCard
              label={t("listmods.active")}
              value={dpActive}
              icon={<CircleCheckIcon className="size-5 text-emerald-500" />}
              className="bg-emerald-500/10"
            />
            <SummaryCard
              label={t("listmods.inactive")}
              value={dpTotal - dpActive}
              icon={<CircleSlashIcon className="size-5 text-amber-500" />}
              className="bg-amber-500/10"
            />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-2xl">
                {t("listmods.datapacks")}{" "}
                {dpTotal > 0 && (
                  <span className="text-muted-foreground text-base">
                    ({dpQuery ? `${visibleDatapacks.length}/${dpTotal}` : dpTotal})
                  </span>
                )}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => void scanDatapacks("refresh")} disabled={dpLoading} aria-label={t("listmods.refreshDatapacks")}>
                <RefreshCcwIcon className={cn(dpLoading && "ease-in-out animate-spin")} />
              </Button>
            </CardHeader>
            <CardContent>
              {dpError ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <LayersIcon className="size-10 text-muted-foreground" />
                  <p className="text-muted-foreground">{dpError}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("listmods.expected", { path: project.configs.datapacksPath?.trim() || `${workpath}\\datapacks` })}
                  </p>
                </div>
              ) : !dpLoading && dpTotal === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <LayersIcon className="size-10 text-muted-foreground" />
                  <p className="text-muted-foreground">{t("listmods.noDatapacks")}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="relative">
                    <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      value={dpSearch}
                      onChange={(e) => setDpSearch(e.target.value)}
                      placeholder={t("listmods.searchDatapacksPlaceholder")}
                      className="h-9 pl-8"
                      aria-label={t("listmods.searchDatapacks")}
                    />
                  </div>
                  {dpQuery && visibleDatapacks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                      <SearchIcon className="size-10 text-muted-foreground" />
                      <p className="text-muted-foreground">{t("listmods.noDatapacksMatch", { query: dpSearch.trim() })}</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-center">{t("listmods.on")}</TableHead>
                          <TableHead>{t("listmods.datapack")}</TableHead>
                          <TableHead className="w-28">{t("listmods.packFormat")}</TableHead>
                          <TableHead>{t("listmods.description")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleDatapacks.map((d) => (
                          <TableRow key={d.filename} className={cn(!d.active && "opacity-50")}>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={d.active}
                                onCheckedChange={() => toggleDatapackActive(d.filename)}
                                aria-label={t("listmods.enable", { name: d.name })}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{d.name}</div>
                              <div className="text-xs text-muted-foreground">{d.filename}</div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{d.packFormat ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground">{d.description || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

export default function ListModsPage() {
  // `key` legato all'identità del progetto (apertura + cartella): cambiare
  // progetto RIMONTA la lista, azzerando lo stato locale (diagnostica, ricerca,
  // errori). Senza questo React riusa l'istanza e resta dentro roba della
  // sessione precedente, perché ProjectGate rende sempre lo stesso componente.
  const projectKey = useAppSelector(
    (s) => `${s.project.loadId}::${s.project.project?.configs.workpath ?? ""}`
  )
  return <ProjectGate>{(project) => <ModsList key={projectKey} project={project} />}</ProjectGate>
}
