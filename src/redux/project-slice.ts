import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'
import { project } from '../model/models'

// Define a type for the slice state
interface projectState {
    project: project | null
    // true quando ci sono modifiche non ancora salvate su file
    unsaved: boolean
    // Contatore delle APERTURE di progetto (create/open/close): incrementato da
    // `loadProject`, NON persistito nel file. Serve a chi deriva dati dal disco
    // (scansione mod/datapack) per capire che c'è stata una nuova apertura e
    // rileggere i file invece di fidarsi della cache. Vedi `lib/mods-sync.ts`.
    loadId: number
}

// Define the initial state using that type
const initialState: projectState = {
    project: null,
    unsaved: false,
    loadId: 0
}

export const projectSlice = createSlice({
    name: 'project',
    initialState,
    reducers: {
        // Carica/crea un progetto: stato "pulito", nessuna modifica da salvare.
        // Incrementa `loadId`: le liste derivate dal disco vanno ri-scansionate.
        loadProject: (state, action: PayloadAction<project | null>) => {
            state.project = action.payload
            state.unsaved = false
            state.loadId += 1
        },
        // Modifica il progetto: segna che ci sono cambiamenti da salvare.
        updateProject: (state, action: PayloadAction<project>) => {
            state.project = action.payload
            state.unsaved = true
        },
        // Da chiamare dopo aver scritto il progetto su file.
        markSaved: (state) => {
            state.unsaved = false
        }
    },
})

export const { loadProject, updateProject, markSaved } = projectSlice.actions

export const selectProject = (state: RootState) => state.project;

export const projectReducer = projectSlice.reducer;
