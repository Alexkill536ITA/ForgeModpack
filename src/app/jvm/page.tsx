"use client"

import { useCallback } from "react"
import { CopyIcon, SlidersVerticalIcon, TerminalSquareIcon } from "lucide-react"
import { toast } from "sonner"

import { useTranslation } from "@/src/i18n/i18n-provider"
import { ProjectGate } from "../../components/project-gate"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Slider } from "../../components/ui/slider"
import { cn } from "../../lib/utils"
import { useAppDispatch } from "../../redux/hooks"
import { updateProject } from "../../redux/project-slice"
import { setByPath } from "../../lib/json-data"
import { buildFlags, GC_OPTIONS } from "../../lib/jvm"
import { gcType, project, toastStyles } from "../../model/models"

// Evidenzia le parti di un flag JVM (prefisso vs valore) per leggibilità.
function colorizeFlag(flag: string) {
  const m = flag.match(/^(-X[a-z]*|-XX:[+\-]?|-D)(.*)$/)
  if (!m) return <span>{flag}</span>
  return (
    <>
      <span className="text-[#5bc8e8]">{m[1]}</span>
      <span className="text-[#a8e6b8]">{m[2]}</span>
    </>
  )
}

function JvmSettings({ project }: { project: project }) {
  const dispatch = useAppDispatch()
  const { t } = useTranslation()

  const { ramGb, gc } = project.jvm
  const flags = buildFlags(ramGb, gc)

  // Ogni modifica aggiorna il project in Redux (→ unsaved → SaveBar).
  const setRamGb = (value: number) => {
    dispatch(updateProject(setByPath(project, "jvm.ramGb", value)))
  }
  const setGc = (value: gcType) => {
    dispatch(updateProject(setByPath(project, "jvm.gc", value)))
  }

  const copyFlags = useCallback(() => {
    navigator.clipboard
      ?.writeText(flags.join(" "))
      .then(() => toast.success(t("jvm.copied"), { style: toastStyles.success }))
      .catch(() => toast.error(t("jvm.copyFailed"), { style: toastStyles.destructive }))
  }, [flags, t])

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[340px_1fr]">
      {/* Controlli */}
      <Card>
        <CardHeader>
          <div className="flex gap-3 items-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-green-500/10">
              <SlidersVerticalIcon className="size-6" />
            </div>
            <CardTitle className="text-xl uppercase">
              {t("jvm.memoryParameters")}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div>
            <label className="mb-3 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("jvm.heapAllocation")}
            </label>
            <div className="flex items-center gap-3">
              <Slider
                min={2}
                max={32}
                step={1}
                value={[ramGb]}
                onValueChange={([v]) => setRamGb(v)}
                className="flex-1"
              />
              <span className="min-w-12 text-right font-mono text-base font-bold text-emerald-400">
                {ramGb}G
              </span>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("jvm.garbageCollector")}
            </label>
            <div className="flex overflow-hidden rounded-lg border bg-muted/40">
              {GC_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setGc(key)}
                  className={cn(
                    "flex-1 py-2 text-xs font-semibold transition-colors",
                    gc === key
                      ? "bg-emerald-600/25 text-emerald-400"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Output dei flag */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex gap-3 items-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <TerminalSquareIcon className="size-6" />
            </div>
            <CardTitle className="text-xl uppercase tracking-wider">
              {t("jvm.generatedArguments")}
            </CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={copyFlags}>
            <CopyIcon className="size-4" /> {t("jvm.copy")}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap break-all rounded-lg border bg-[#0c1014] p-4 font-mono text-[12.5px] leading-7">
            {flags.map((f, i) => (
              <span key={i}>
                {colorizeFlag(f)}
                {i < flags.length - 1 && <span className="text-[#56697a]">{" \\\n"}</span>}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function JvmPage() {
  return <ProjectGate>{(project) => <JvmSettings project={project} />}</ProjectGate>
}
