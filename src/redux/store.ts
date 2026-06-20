import { configureStore } from '@reduxjs/toolkit'
import { projectReducer } from './project-slice'
import { minecraftManifestReducer } from './metadata-mc-slice'
import { modLoaderManifestReducer } from './metadata-ml-slice'

export const store = configureStore({
  reducer: {
    project: projectReducer,
    minecraftManifest: minecraftManifestReducer,
    modLoaderManifest: modLoaderManifestReducer
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
export type AppStore = typeof store