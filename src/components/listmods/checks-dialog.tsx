"use client"

// Dialog "Segna come falso positivo" (colonna "Azioni" di List Mods): mostra i
// problemi rilevati dalla scansione per la mod, una sezione per COLONNA DI
// CONTROLLO della tabella (versione MC, dipendenze mancanti, avvisi), e per
// ognuno permette di correggere il valore a mano o di dichiararlo falso
// positivo, con il motivo.
//
// Granularità: dipendenze e avvisi si correggono UNO PER UNO (chiave = modId
// dichiarato / testo dell'avviso), non "tutta la colonna": così un problema
// nuovo, comparso dopo un aggiornamento del jar, resta visibile.
//
// Le modifiche vivono in una bozza locale e si applicano al salvataggio (un solo
// `updateProject`, quindi una sola comparsa della SaveBar).

import { useId, useState } from "react"
import { CircleAlertIcon, CircleCheckIcon, CircleXIcon, TriangleAlertIcon } from "lucide-react"

import { useTranslation } from "@/src/i18n/i18n-provider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { ScrollArea } from "../ui/scroll-area"
import { Switch } from "../ui/switch"
import { cn } from "../../lib/utils"
import { checkFix, mod, modChecks } from "../../model/models"
import { cleanChecks, dependencyIssues, warningIssues } from "../../lib/mod-checks"

/** Titolo di sezione: una colonna di controllo della tabella. */
function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      {children}
    </div>
  )
}

/**
 * Un singolo problema: descrizione, interruttore "falso positivo", campo del
 * valore corretto (solo dove ha senso) e nota del motivo.
 */
function IssueRow({
  code,
  mono = true,
  problem,
  solved,
  valueLabel,
  valuePlaceholder,
  fix,
  onChange,
}: {
  /** Identificatore del problema (modId, vincolo, testo dell'avviso): non tradotto. */
  code: string
  /** Monospaziato: giusto per un modId o un vincolo, non per la frase di un avviso. */
  mono?: boolean
  problem: string
  /** La correzione manuale ha risolto il controllo (feedback immediato). */
  solved?: boolean
  /** Presente = il valore si può correggere a mano. */
  valueLabel?: string
  valuePlaceholder?: string
  fix: checkFix
  onChange: (fix: checkFix) => void
}) {
  const { t } = useTranslation()
  const switchId = useId()
  const dismissed = !!fix.falsePositive
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border p-3", (dismissed || solved) && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={cn("text-xs", mono ? "font-mono break-all" : "font-medium")}>{code}</div>
          <div className={cn("text-xs", solved ? "text-emerald-500" : "text-muted-foreground")}>
            {solved ? t("listmods.fixSolved") : problem}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Switch
            id={switchId}
            checked={dismissed}
            onCheckedChange={(value: boolean) => onChange({ ...fix, falsePositive: value })}
          />
          <Label htmlFor={switchId} className="text-xs font-normal">
            {t("listmods.falsePositive")}
          </Label>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {valueLabel && (
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">{valueLabel}</Label>
            <Input
              value={fix.value ?? ""}
              onChange={(e) => onChange({ ...fix, value: e.target.value })}
              placeholder={valuePlaceholder}
              className="h-8 font-mono text-xs"
            />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("listmods.fixReason")}</Label>
          <Input
            value={fix.note ?? ""}
            onChange={(e) => onChange({ ...fix, note: e.target.value })}
            placeholder={t("listmods.fixReasonPlaceholder")}
            className="h-8"
          />
        </div>
      </div>
    </div>
  )
}

export function ChecksDialog({
  target,
  installedIds,
  warnings,
  mcConstraint,
  mcCompatible,
  mcTarget,
  open,
  onOpenChange,
  onSave,
}: {
  target: mod
  /** modId forniti dalle mod attive (per rivalutare le dipendenze corrette a mano). */
  installedIds: Set<string>
  /** Avvisi della scansione: runtime, non stanno nel project.json. */
  warnings: string[]
  /** Vincolo MC dichiarato dal jar (grezzo, senza correzioni). */
  mcConstraint: string | null
  /** Esito del confronto fatto dalla scansione; null = non verificabile. */
  mcCompatible: boolean | null
  /** Versione MC del progetto. */
  mcTarget: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (checks: modChecks | undefined) => void
}) {
  const { t } = useTranslation()
  // Bozza: parte dalle correzioni salvate. Il montaggio è legato alla mod scelta
  // (`key` nella pagina), quindi non serve risincronizzarla.
  const [draft, setDraft] = useState<modChecks>(target.checks ?? {})

  const setMc = (fix: checkFix) => setDraft((d) => ({ ...d, mc: fix }))
  const setDep = (name: string, fix: checkFix) =>
    setDraft((d) => ({ ...d, dependencies: { ...d.dependencies, [name]: fix } }))
  const setWarning = (text: string, fix: checkFix) =>
    setDraft((d) => ({ ...d, warnings: { ...d.warnings, [text]: fix } }))

  // Le dipendenze si rivalutano sulla BOZZA: correggendo il modId si vede subito
  // se ora risulta installato, senza salvare.
  const depIssues = dependencyIssues({ ...target, checks: draft }, installedIds)
  const warnIssues = warningIssues({ ...target, checks: draft }, warnings)
  // La sezione MC serve solo se c'è un problema (o una correzione da poter
  // togliere): "non verificabile" non è un errore della mod.
  const mcActionable = mcCompatible === false || !!draft.mc
  const nothingToFix = !mcActionable && depIssues.length === 0 && warnIssues.length === 0
  // Descrizione dell'esito della SCANSIONE (le stesse frasi del tooltip in
  // tabella): la sezione può essere aperta anche solo per togliere una vecchia
  // correzione, e in quel caso "incompatibile" sarebbe falso.
  const mcProblem = !mcConstraint
    ? t("listmods.mcUncheckable")
    : mcCompatible === false
      ? t("listmods.mcIncompatible", { constraint: mcConstraint, mc: mcTarget })
      : mcCompatible === true
        ? t("listmods.mcCompatible", { constraint: mcConstraint, mc: mcTarget })
        : t("listmods.mcUnchecked", { constraint: mcConstraint })

  function save() {
    onSave(cleanChecks(draft))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("listmods.checksTitle", { name: target.name || target.filename })}
          </DialogTitle>
          <DialogDescription>{t("listmods.checksDescription")}</DialogDescription>
        </DialogHeader>

        {nothingToFix ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CircleCheckIcon className="size-8 text-emerald-500" />
            <p className="text-sm text-muted-foreground">{t("listmods.checksNoIssues")}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="flex flex-col gap-5">
              {mcActionable && (
                <Section
                  icon={
                    <CircleAlertIcon
                      className={cn(
                        "size-4",
                        mcCompatible === false ? "text-red-500" : "text-muted-foreground"
                      )}
                    />
                  }
                  title={t("listmods.checkMc")}
                >
                  <IssueRow
                    code={mcConstraint || t("listmods.mcNoConstraint")}
                    problem={mcProblem}
                    valueLabel={t("listmods.fixMcValue")}
                    valuePlaceholder={mcConstraint ?? mcTarget}
                    fix={draft.mc ?? {}}
                    onChange={setMc}
                  />
                </Section>
              )}

              {depIssues.length > 0 && (
                <Section
                  icon={<CircleXIcon className="size-4 text-red-500" />}
                  title={t("listmods.checkDependencies")}
                >
                  {depIssues.map((issue) => (
                    <IssueRow
                      key={issue.name}
                      code={issue.name}
                      problem={t("listmods.depMissing", { name: issue.lookup })}
                      solved={issue.installed}
                      valueLabel={t("listmods.fixDepValue")}
                      valuePlaceholder={issue.name}
                      fix={issue.fix ?? {}}
                      onChange={(fix) => setDep(issue.name, fix)}
                    />
                  ))}
                </Section>
              )}

              {warnIssues.length > 0 && (
                <Section
                  icon={<TriangleAlertIcon className="size-4 text-amber-500" />}
                  title={t("listmods.checkWarnings")}
                >
                  {warnIssues.map((issue) => (
                    <IssueRow
                      key={issue.text}
                      code={issue.text}
                      mono={false}
                      problem={t("listmods.warningFromScan")}
                      fix={issue.fix ?? {}}
                      onChange={(fix) => setWarning(issue.text, fix)}
                    />
                  ))}
                </Section>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
