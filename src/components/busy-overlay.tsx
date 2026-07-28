"use client"

import { useEffect, useState } from "react"
import { Loader2Icon } from "lucide-react"

import { useAppSelector } from "../redux/hooks"
import { selectBusyTasks } from "../redux/busy-slice"
import { useTranslation } from "@/src/i18n/i18n-provider"

/**
 * Ritardo prima di mostrare l'overlay: le stesse operazioni che aprono i jar la
 * prima volta, dentro la stessa apertura di progetto rispondono dalla cache
 * SQLite in pochi millisecondi. Senza questa soglia ogni navigazione tra le
 * pagine farebbe lampeggiare l'overlay.
 */
const APPEAR_DELAY_MS = 250

/**
 * Overlay di caricamento globale: compare durante le operazioni pesanti
 * (scansione dei jar, risoluzione keybind, export, download dei manifest) e
 * **blocca l'interazione**, così l'utente non può cambiare progetto o pagina a
 * metà lavoro lasciando il risultato da applicare a uno stato che non esiste più.
 *
 * Montato una sola volta nel layout. La sorgente è lo slice runtime `busy`, che si
 * alimenta con l'hook [`useBusy`](../lib/use-busy.ts). Se più operazioni sono in
 * corso mostra la prima e conta le altre.
 *
 * `z-[100]`: sopra i dialog di shadcn (`z-50`), altrimenti un'operazione lanciata
 * da un dialog resterebbe coperta.
 */
export function BusyOverlay() {
  const { t } = useTranslation()
  const tasks = useAppSelector(selectBusyTasks)
  const active = tasks.length > 0

  // La dipendenza è il solo booleano: se cambia il task ma il lavoro continua, il
  // timer non si azzera (nessun flicker tra due operazioni consecutive).
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }
    const timer = setTimeout(() => setVisible(true), APPEAR_DELAY_MS)
    return () => clearTimeout(timer)
  }, [active])

  const current = tasks[0]
  if (!current || !visible) return null
  const others = tasks.length - 1

  return (
    <div
      className="fixed inset-0 z-[100] flex cursor-wait items-center justify-center bg-background/70 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex min-w-64 max-w-md flex-col items-center gap-3 rounded-xl border bg-card px-8 py-6 text-center shadow-lg">
        <Loader2Icon className="size-8 animate-spin text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{current.message}</p>
          {current.detail && (
            <p className="max-w-full truncate text-xs text-muted-foreground" title={current.detail}>
              {current.detail}
            </p>
          )}
          <p className="text-xs text-muted-foreground/80 animate-pulse">{t("busy.pleaseWait")}</p>
          {others > 0 && (
            <p className="text-xs text-muted-foreground">{t("busy.otherTasks", { count: others })}</p>
          )}
        </div>
      </div>
    </div>
  )
}
