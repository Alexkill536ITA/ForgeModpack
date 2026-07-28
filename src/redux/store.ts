import { configureStore } from '@reduxjs/toolkit'
import { projectReducer } from './project-slice'
import { minecraftManifestReducer } from './metadata-mc-slice'
import { modLoaderManifestReducer } from './metadata-ml-slice'
import { documentsReducer } from './documents-slice'
import { keybindActionsReducer } from './keybind-actions-slice'
import { busyReducer } from './busy-slice'

export const store = configureStore({
  reducer: {
    project: projectReducer,
    minecraftManifest: minecraftManifestReducer,
    modLoaderManifest: modLoaderManifestReducer,
    documents: documentsReducer,
    keybindActions: keybindActionsReducer,
    busy: busyReducer
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
export type AppStore = typeof store