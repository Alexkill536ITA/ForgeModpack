"use client"

import { useCallback } from "react"

import { useAppDispatch } from "../redux/hooks"
import { endTask, startTask, updateTask } from "../redux/busy-slice"

// Hook per eseguire un'operazione pesante mostrando l'overlay di caricamento
// globale (che blocca l'interazione). Il task viene chiuso in `finally`, quindi
// l'overlay non resta appeso nemmeno in caso di errore o di eccezione dentro il
// lavoro. Il messaggio va già tradotto dal chiamante (che è un componente).
//
//   const busy = useBusy()
//   await busy(t("busy.scanningMods"), async () => { ... }, { detail: workpath })
//
// Il callback riceve `setMessage` per le operazioni a fasi (es. "scansione" →
// "risoluzione keybind") senza aprire un secondo task.

let counter = 0

export interface busyOptions {
    detail?: string
}

export type busyRunner = <T>(
    message: string,
    work: (setMessage: (message: string, detail?: string) => void) => Promise<T>,
    options?: busyOptions
) => Promise<T>

export function useBusy(): busyRunner {
    const dispatch = useAppDispatch()

    return useCallback(
        async (message, work, options) => {
            const id = `busy-${++counter}`
            dispatch(startTask({ id, message, detail: options?.detail }))
            try {
                return await work((nextMessage, nextDetail) =>
                    dispatch(updateTask({ id, message: nextMessage, detail: nextDetail }))
                )
            } finally {
                dispatch(endTask(id))
            }
        },
        [dispatch]
    )
}
