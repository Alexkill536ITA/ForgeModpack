"use client"

// Dialog della NOTA libera su una mod (colonna "Azioni" di List Mods). La nota
// vive nel project.json (`mod.note`) e in tabella compare come icona nell'angolo
// della cella del nome.

import { useState } from "react"

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
import { Textarea } from "../ui/textarea"
import { mod } from "../../model/models"

export function NoteDialog({
  target,
  open,
  onOpenChange,
  onSave,
}: {
  target: mod
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Nota da salvare; stringa vuota = nota rimossa. */
  onSave: (note: string) => void
}) {
  const { t } = useTranslation()
  // Bozza locale: si applica solo al salvataggio. Il montaggio è legato alla mod
  // scelta (`key` nella pagina), quindi partire dal valore corrente basta.
  const [draft, setDraft] = useState(target.note ?? "")

  function save(value: string) {
    onSave(value)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("listmods.noteTitle", { name: target.name || target.filename })}</DialogTitle>
          <DialogDescription>{t("listmods.noteDescription")}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("listmods.notePlaceholder")}
          className="min-h-28"
          autoFocus
        />
        <DialogFooter>
          {/* Rimuovere è un'azione a sé: azzerare il testo e salvare funziona,
              ma non si capisce che sia il modo di togliere la nota. */}
          {target.note && (
            <Button variant="ghost" className="sm:mr-auto" onClick={() => save("")}>
              {t("listmods.removeNote")}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => save(draft)}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
