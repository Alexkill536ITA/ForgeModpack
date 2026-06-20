"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { join } from "@tauri-apps/api/path"
import { RefreshCcwIcon, PackageIcon, CircleCheckIcon, CircleSlashIcon } from "lucide-react"

import { ProjectGate } from "../../components/project-gate"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
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
import { mod, modloaderTypes, project } from "../../model/models"

// Rispecchia la struct `ScannedMod` ritornata dal comando Rust `scan_mods`.
interface ScannedMod {
  filename: string
  modId: string
  name: string
  modloader: string
  version: string
  description: string | null
  authors: string[]
  dependencies: { name: string; version: string; mandatory: boolean }[]
  provides: string[]
}

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
      <CardContent className="flex items-center gap-3 py-4">
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const workpath = project.configs.workpath
  const mods = project.mods

  // Ref sempre aggiornato al progetto corrente: usato dentro le callback senza
  // doverle ricreare a ogni cambio di stato (evita loop con gli effect).
  const projectRef = useRef(project)
  projectRef.current = project

  // Apre ogni .jar di <workpath>/mods come ZIP (lato Rust), ne legge i metadati
  // e li salva in project.mods, preservando il flag `active` già impostato.
  const scan = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const modsDir = await join(workpath, "mods")
      const scanned = await invoke<ScannedMod[]>("scan_mods", { dir: modsDir })

      const current = projectRef.current
      const prevActive = new Map(current.mods.map((m) => [m.filename, m.active]))

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
      setError("Mods folder not found in the project directory.")
    } finally {
      setLoading(false)
    }
  }, [workpath, dispatch])

  // Scansione automatica solo la prima volta per ogni workpath e solo se i mod
  // non sono già stati salvati nel progetto (così non si riscansiona di continuo).
  const initialized = useRef<string | null>(null)
  useEffect(() => {
    if (initialized.current === workpath) return
    initialized.current = workpath
    if (projectRef.current.mods.length === 0) void scan()
  }, [workpath, scan])

  function toggleActive(filename: string) {
    const current = projectRef.current
    const updated = current.mods.map((m) =>
      m.filename === filename ? { ...m, active: !m.active } : m
    )
    dispatch(updateProject(setByPath(current, "mods", updated)))
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

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        <SummaryCard
          label="Total mods"
          value={total}
          icon={<PackageIcon className="size-5 text-muted-foreground" />}
        />
        <SummaryCard
          label="Active"
          value={activeCount}
          icon={<CircleCheckIcon className="size-5 text-emerald-500" />}
          className="bg-emerald-500/10"
        />
        <SummaryCard
          label="Inactive"
          value={inactiveCount}
          icon={<CircleSlashIcon className="size-5 text-amber-500" />}
          className="bg-amber-500/10"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-2xl">
            Mods {total > 0 && <span className="text-muted-foreground text-base">({total})</span>}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => void scan()} disabled={loading} aria-label="Refresh">
            <RefreshCcwIcon className={cn(loading && "ease-in-out animate-spin")} />
          </Button>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <PackageIcon className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground">{error}</p>
              <p className="text-xs text-muted-foreground">Expected: {workpath}\mods</p>
            </div>
          ) : !loading && total === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <PackageIcon className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground">No mods found in this modpack.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">On</TableHead>
                  <TableHead>Mod</TableHead>
                  <TableHead className="w-32">Version</TableHead>
                  <TableHead className="w-28">Loader</TableHead>
                  <TableHead>Authors</TableHead>
                  <TableHead className="w-40">Dependencies</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mods.map((m) => (
                  <TableRow key={m.filename} className={cn(!m.active && "opacity-50")}>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={m.active}
                        onCheckedChange={() => toggleActive(m.filename)}
                        aria-label={`Enable ${m.name}`}
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
                              <span className="text-xs text-muted-foreground">OK</span>
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
                              <div className="font-medium">Missing dependencies</div>
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
        </CardContent>
      </Card>
    </div>
  )
}

export default function ListModsPage() {
  return <ProjectGate>{(project) => <ModsList project={project} />}</ProjectGate>
}
