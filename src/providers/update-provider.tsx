"use client"

// Provider del check aggiornamenti: tiene lo stato del controllo e rende il
// dialog, così la sidebar (o qualsiasi altro componente) può lanciarlo con
// `useUpdateCheck().checkNow()` senza possedere la UI.
//
// Due modalità:
//  - AUTOMATICA all'avvio: silenziosa, apre il dialog SOLO se c'è una versione
//    nuova (un errore di rete all'avvio non deve disturbare: l'app funziona
//    offline, è un manager di file locali);
//  - MANUALE dal menu: apre subito il dialog, che mostra anche "sei aggiornato"
//    o l'errore, perché l'utente sta aspettando una risposta.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { DownloadIcon, RefreshCwIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"
import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { Checkbox } from "../components/ui/checkbox"
import { Label } from "../components/ui/label"
import { ScrollArea } from "../components/ui/scroll-area"
import { Spinner } from "../components/ui/spinner"
import { useTranslation } from "../i18n/i18n-provider"
import {
  AppRelease,
  RELEASES_PAGE_URL,
  UpdateCheckResult,
  checkForUpdate,
  formatReleaseNotes,
  getIncludePrerelease,
  setIncludePrerelease,
} from "../lib/update-check"

type UpdatePhase = "idle" | "checking" | "available" | "uptodate" | "error"

interface UpdateContextValue {
  /** Apre il dialog e (ri)esegue il controllo. */
  checkNow: () => void
  /** True quando l'ultimo controllo ha trovato una versione più recente. */
  updateAvailable: boolean
  /** Versione trovata, per il badge nel menu. */
  latestVersion: string | null
}

const UpdateContext = createContext<UpdateContextValue | null>(null)

export function useUpdateCheck(): UpdateContextValue {
  const ctx = useContext(UpdateContext)
  if (!ctx) throw new Error("useUpdateCheck must be used inside UpdateProvider")
  return ctx
}

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()

  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<UpdatePhase>("idle")
  const [result, setResult] = useState<UpdateCheckResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Parte da false per non divergere in hydration (SSG): la preferenza salvata
  // si legge al mount, come fa il provider i18n con la lingua.
  const [includePrerelease, setIncludePrereleaseState] = useState(false)

  // Esegue il controllo. `silent` = non aprire il dialog se non c'è nulla di
  // nuovo (usato all'avvio).
  const runCheck = useCallback(
    async (options: { silent: boolean; withPrerelease?: boolean }) => {
      const withPrerelease = options.withPrerelease ?? getIncludePrerelease()
      setPhase("checking")
      setErrorMessage(null)
      try {
        const res = await checkForUpdate(withPrerelease)
        setResult(res)
        setPhase(res.hasUpdate ? "available" : "uptodate")
        if (res.hasUpdate || !options.silent) setOpen(true)
      } catch (error) {
        console.error("Update check failed", error)
        setResult(null)
        setErrorMessage(error instanceof Error ? error.message : String(error))
        setPhase("error")
        if (!options.silent) setOpen(true)
      }
    },
    []
  )

  // Avvio: legge la preferenza e fa il controllo automatico una volta sola.
  // La guardia sta prima dell'await perché qui NON c'è lavoro da riprendere:
  // in StrictMode la seconda invocazione dell'effect deve solo evitare la
  // doppia chiamata all'API GitHub (rate limit 60 richieste/ora).
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    const saved = getIncludePrerelease()
    setIncludePrereleaseState(saved)
    void runCheck({ silent: true, withPrerelease: saved })
  }, [runCheck])

  const checkNow = useCallback(() => {
    setOpen(true)
    void runCheck({ silent: false })
  }, [runCheck])

  // Cambiando l'opzione beta il risultato precedente non vale più: si ricontrolla.
  const togglePrerelease = useCallback(
    (next: boolean) => {
      setIncludePrereleaseState(next)
      setIncludePrerelease(next)
      void runCheck({ silent: false, withPrerelease: next })
    },
    [runCheck]
  )

  const latest: AppRelease | null = result?.latest ?? null
  const hasUpdate = phase === "available" && latest !== null

  const openDownloadPage = useCallback(async () => {
    try {
      await openUrl(latest?.url ?? RELEASES_PAGE_URL)
    } catch (error) {
      console.error("Could not open the releases page", error)
    }
  }, [latest])

  const value = useMemo<UpdateContextValue>(
    () => ({
      checkNow,
      updateAvailable: hasUpdate,
      latestVersion: hasUpdate ? latest.version : null,
    }),
    [checkNow, hasUpdate, latest]
  )

  const title = (): string => {
    switch (phase) {
      case "checking":
        return t("updates.titleChecking")
      case "available":
        return t("updates.titleAvailable")
      case "uptodate":
        return t("updates.titleUpToDate")
      case "error":
        return t("updates.titleError")
      default:
        return t("updates.menu")
    }
  }

  return (
    <UpdateContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {phase === "checking" && <Spinner />}
              {phase === "uptodate" && <CircleCheckIcon className="size-4 text-green-500" />}
              {phase === "error" && <TriangleAlertIcon className="size-4 text-destructive" />}
              {phase === "available" && <DownloadIcon className="size-4 text-primary" />}
              {title()}
            </DialogTitle>
            <DialogDescription>
              {phase === "checking" && t("updates.checking")}
              {phase === "uptodate" &&
                t("updates.upToDate", { version: result?.current ?? "" })}
              {phase === "error" && t("updates.errorBody")}
              {phase === "available" && t("updates.availableBody")}
            </DialogDescription>
          </DialogHeader>

          {phase === "available" && latest && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-sm">
                <div className="flex flex-col">
                  <span className="text-muted-foreground text-xs">
                    {t("updates.currentVersion")}
                  </span>
                  <span className="font-mono">{result?.current}</span>
                </div>
                <span className="text-muted-foreground">→</span>
                <div className="flex flex-col">
                  <span className="text-muted-foreground text-xs">{t("updates.newVersion")}</span>
                  <span className="font-mono font-medium">{latest.version}</span>
                </div>
                {latest.prerelease && (
                  <Badge variant="outline" className="ml-auto">
                    {t("updates.prereleaseBadge")}
                  </Badge>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">{t("updates.notes")}</span>
                <ScrollArea className="h-40 rounded-md border p-3">
                  <p className="text-sm whitespace-pre-wrap">
                    {latest.notes ? formatReleaseNotes(latest.notes) : t("updates.noNotes")}
                  </p>
                </ScrollArea>
              </div>
            </div>
          )}

          {phase === "error" && errorMessage && (
            <p className="text-muted-foreground font-mono text-xs break-all">{errorMessage}</p>
          )}

          {/* L'opzione beta resta visibile in ogni stato: è l'unico posto da cui
              si attiva, e da "sei aggiornato" serve proprio per cercare le beta. */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="updates-include-prerelease"
              checked={includePrerelease}
              disabled={phase === "checking"}
              onCheckedChange={(checked) => togglePrerelease(checked === true)}
            />
            <Label htmlFor="updates-include-prerelease" className="text-muted-foreground text-xs">
              {t("updates.includePrerelease")}
            </Label>
          </div>

          <DialogFooter>
            {phase !== "checking" && phase !== "available" && (
              <Button variant="outline" onClick={() => void runCheck({ silent: false })}>
                <RefreshCwIcon className="size-4" />
                {t("updates.recheck")}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {hasUpdate ? t("updates.later") : t("common.close")}
            </Button>
            {hasUpdate && (
              <Button onClick={openDownloadPage}>
                <DownloadIcon className="size-4" />
                {t("updates.download")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UpdateContext.Provider>
  )
}
