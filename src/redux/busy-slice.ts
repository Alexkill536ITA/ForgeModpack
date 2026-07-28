import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'

// Operazioni pesanti in corso (scansione dei jar, risoluzione keybind, export,
// download dei manifest...). Servono a mostrare l'overlay di caricamento globale
// ([`busy-overlay.tsx`](../components/busy-overlay.tsx)), che BLOCCA
// l'interazione: durante una scansione l'utente non deve poter cambiare progetto
// o pagina a metà lavoro, perché il risultato verrebbe applicato a uno stato che
// non c'è più.
//
// Stato runtime, mai persistito nel project.json. Si usa tramite l'hook
// [`useBusy`](../lib/use-busy.ts), che apre e chiude il task in un `try/finally`:
// più task contemporanei sono ammessi (es. mod e datapack in parallelo) e
// l'overlay resta visibile finché l'ultimo non termina.

export interface busyTask {
    id: string
    // Testo già tradotto (il chiamante è un componente/hook, quindi ha `t`).
    message: string
    // Riga secondaria opzionale: es. il nome della cartella scansionata.
    detail?: string
}

interface busyState {
    tasks: busyTask[]
}

const initialState: busyState = { tasks: [] }

export const busySlice = createSlice({
    name: 'busy',
    initialState,
    reducers: {
        // Inizio di un'operazione pesante. Se l'id esiste già ne aggiorna il testo
        // (rientri difensivi: un id duplicato non deve creare due overlay).
        startTask: (state, action: PayloadAction<busyTask>) => {
            const existing = state.tasks.find((t) => t.id === action.payload.id)
            if (existing) {
                existing.message = action.payload.message
                existing.detail = action.payload.detail
                return
            }
            state.tasks.push(action.payload)
        },
        // Aggiorna il testo di un task in corso (operazioni a fasi).
        updateTask: (
            state,
            action: PayloadAction<{ id: string; message?: string; detail?: string }>
        ) => {
            const task = state.tasks.find((t) => t.id === action.payload.id)
            if (!task) return
            if (action.payload.message !== undefined) task.message = action.payload.message
            task.detail = action.payload.detail
        },
        endTask: (state, action: PayloadAction<string>) => {
            state.tasks = state.tasks.filter((t) => t.id !== action.payload)
        },
    },
})

export const { startTask, updateTask, endTask } = busySlice.actions

export const selectBusyTasks = (state: RootState) => state.busy.tasks

export const busyReducer = busySlice.reducer
