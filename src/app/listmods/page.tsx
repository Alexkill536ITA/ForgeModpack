"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { RefreshCcwIcon, PackageIcon, CircleCheckIcon, CircleSlashIcon, CircleXIcon, SearchIcon, LayersIcon } from "lucide-react"
import { join } from "@tauri-apps/api/path"

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
import { useAppDispatch } from "../../redux/hooks"
import { updateProject } from "../../redux/project-slice"
import { setByPath } from "../../lib/json-data"
import { getModsScanCached } from "../../lib/mods-scan"
import { getDatapacksScanCached } from "../../lib/datapacks-scan"
import { datapack, mod, modloaderTypes, project } from "../../model/models"

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

  const [dpLoading, setDpLoading] = useState(false)
  const [dpError, setDpError] = useState<string | null>(null)
  const [dpSearch, setDpSearch] = useState("")

  // Ref sempre aggiornato al progetto corrente: usato dentro le callback senza
  // doverle ricreare a ogni cambio di stato (evita loop con gli effect).
  const projectRef = useRef(project)
  projectRef.current = project

  // Scansione UNIFICATA (metadati + keybind) via cache SQLite `mods:<workpath>`:
  // salva i metadati in project.mods (preservando `active`); i keybind restano
  // nella cache e alimentano la pagina Keybinds. `force` = refresh manuale.
  const scan = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const scanned = await getModsScanCached(workpath, force)

      const current = projectRef.current
      const prevActive = new Map(current.mods.map((m) => [m.filename, m.active]))

      // I keybind NON vengono copiati in project.mods (restano nella cache): il
      // project.json resta leggero.
      const mapped: mod[] = scanned.map((s) => ({
        active: prevActive.get(s.filename) ?? true,
        filename: s.filename,
        modId: s.modId,
        name: s.name,
        modloader: s.modloader as modloaderTypes,
        version: s.version,
        provides: s.provides,
        description: s.description ?? undefined,
        authors: s.authors,
        dependencies: s.dependencies,
      }))

      dispatch(updateProject(setByPath(current, "mods", mapped)))
    } catch (err) {
      console.error(err)
      setError(t("listmods.modsFolderNotFound"))
    } finally {
      setLoading(false)
    }
  }, [workpath, dispatch, t])

  // Scansione automatica solo la prima volta per ogni workpath e solo se i mod
  // non sono già stati salvati nel progetto (così non si riscansiona di continuo).
  const initialized = useRef<string | null>(null)
  useEffect(() => {
    if (!showMods) return
    if (initialized.current === workpath) return
    initialized.current = workpath
    if (projectRef.current.mods.length === 0) void scan()
  }, [workpath, scan, showMods])

  function toggleActive(filename: string) {
    const current = projectRef.current
    const updated = current.mods.map((m) =>
      m.filename === filename ? { ...m, active: !m.active } : m
    )
    dispatch(updateProject(setByPath(current, "mods", updated)))
  }

  // Scansione datapack (cache SQLite `datapacks:<dir>`). La cartella è quella
  // configurata nel project (path assoluto) o, se assente, <workpath>/datapacks.
  const scanDatapacks = useCallback(async (force = false) => {
    setDpLoading(true)
    setDpError(null)
    try {
      const dir = projectRef.current.configs.datapacksPath?.trim() || (await join(workpath, "datapacks"))
      const scanned = await getDatapacksScanCached(dir, force)
      const current = projectRef.current
      const prevActive = new Map((current.datapacks ?? []).map((d) => [d.filename, d.active]))
      const mapped: datapack[] = scanned.map((s) => ({
        active: prevActive.get(s.filename) ?? true,
        filename: s.filename,
        name: s.name,
        description: s.description ?? undefined,
        packFormat: s.packFormat ?? undefined,
      }))
      dispatch(updateProject(setByPath(current, "datapacks", mapped)))
    } catch (err) {
      console.error(err)
      setDpError(t("listmods.datapacksFolderNotFound"))
    } finally {
      setDpLoading(false)
    }
  }, [workpath, dispatch, t])

  const dpInitialized = useRef<string | null>(null)
  useEffect(() => {
    if (!showDatapacks) return
    const key = `${workpath}::${project.configs.datapacksPath ?? ""}`
    if (dpInitialized.current === key) return
    dpInitialized.current = key
    if ((projectRef.current.datapacks?.length ?? 0) === 0) void scanDatapacks()
  }, [workpath, project.configs.datapacksPath, scanDatapacks, showDatapacks])

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
          <Button variant="ghost" size="icon" onClick={() => void scan(true)} disabled={loading} aria-label={t("listmods.refresh")}>
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
              <Button variant="ghost" size="icon" onClick={() => void scanDatapacks(true)} disabled={dpLoading} aria-label={t("listmods.refreshDatapacks")}>
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
  return <ProjectGate>{(project) => <ModsList project={project} />}</ProjectGate>
}
