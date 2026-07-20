import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'

// Azioni keybind estratte dai jar delle mod (dalla scansione UNIFICATA `scan_mods`,
// derivate via keybind-cache dalla cache SQLite `mods:<workpath>`). Vivono SOLO a
// runtime, NON nel project.json: sono voluminose, derivabili dai jar e cambiano
// quando cambia la cartella `mods`. Servono a popolare la lista di azioni
// selezionabili nel dialog dei keybind, filtrata per mod.

// Rispecchia la struct `KeybindAction` ritornata da Rust (`scan_mods`).
export interface scannedKeybindAction {
    key: string   // chiave di traduzione, es. "key.jei.toggleOverlay"
    label: string // testo leggibile (fallback: la chiave)
}

// Vista "per mod" delle keybind, derivata dalla scansione unificata (mods-scan.ts
// → keybind-cache.ts). Non è più una struct Rust a sé: i keybind arrivano dentro
// `ScannedMod.keybinds`.
export interface modKeybinds {
    filename: string
    modId: string
    keybinds: scannedKeybindAction[]
}

interface keybindActionsState {
    workpath: string | null                          // per invalidare al cambio cartella
    byModId: Record<string, scannedKeybindAction[]>  // modId -> azioni
    loading: boolean
    error: string | null
}

const initialState: keybindActionsState = {
    workpath: null,
    byModId: {},
    loading: false,
    error: null,
}

export const keybindActionsSlice = createSlice({
    name: 'keybindActions',
    initialState,
    reducers: {
        setKeybindActionsLoading: (state, action: PayloadAction<boolean>) => {
            state.loading = action.payload
            if (action.payload) state.error = null
        },
        setKeybindActionsError: (state, action: PayloadAction<string | null>) => {
            state.error = action.payload
            state.loading = false
        },
        setKeybindActions: (
            state,
            action: PayloadAction<{ workpath: string; mods: modKeybinds[] }>
        ) => {
            state.workpath = action.payload.workpath
            state.byModId = {}
            for (const m of action.payload.mods) {
                if (m.modId) state.byModId[m.modId] = m.keybinds
            }
            state.loading = false
            state.error = null
        },
    },
})

export const { setKeybindActionsLoading, setKeybindActionsError, setKeybindActions } =
    keybindActionsSlice.actions

export const selectKeybindActions = (state: RootState) => state.keybindActions

export const keybindActionsReducer = keybindActionsSlice.reducer
