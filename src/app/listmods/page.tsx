"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { RefreshCcwIcon, PackageIcon, CircleCheckIcon, CircleSlashIcon, CircleXIcon, SearchIcon, LayersIcon, TriangleAlertIcon } from "lucide-react"
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
        scanned.map((s) => [s.filename, { format: s.format ?? "", warnings: s.warnings ?? [] }])
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
  const installedIds = new Set(
    mods
      .filter((m) => m.active)
      .flatMap((m) => (m.provides?.length ? m.provides : [m.modId ?? ""]))
      .map((id) => id.toLowerCase())
  )

  const missing = mods.filter((m) => m.active && missingDependencies(m, installedIds).length > 0)
  // Mod il cui jar ha prodotto avvisi in scansione (formato inatteso, metadati
  // malformati, nessun file di lingua...): vanno guardate a occhio.
  const withWarnings = mods.filter((m) => (diagnostics.get(m.filename)?.warnings.length ?? 0) > 0)

  // Lista mostrata: senza query mantiene l'ordine originale; con query filtra
  // per match fuzzy e ordina per rilevanza (punteggio decrescente).
  const query = search.trim()
  const visibleMods = query
    ? mods
        .map((m) => ({ m, score: modScore(m, query) }))
        .filter((x): x is { m: mod; score: number } => x.score !== null)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.m)
    : mods

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
                ({query ? `${visibleMods.length}/${total}` : total})
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
              <div className="relative">
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
              {query && visibleMods.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <SearchIcon className="size-10 text-muted-foreground" />
                  <p className="text-muted-foreground">{t("listmods.noModsMatch", { query })}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">{t("listmods.on")}</TableHead>
                      <TableHead>{t("listmods.mod")}</TableHead>
                      <TableHead className="w-32">{t("listmods.version")}</TableHead>
                      <TableHead className="w-28">{t("listmods.loader")}</TableHead>
                      <TableHead className="w-40">{t("listmods.format")}</TableHead>
                      <TableHead>{t("listmods.authors")}</TableHead>
                      <TableHead className="w-40">{t("listmods.dependencies")}</TableHead>
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
