import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'
import { FabricGameVersionsResponse, FabricLoaderVersionsResponse, ForgeMavenMetadata, ModLoaderManifest, NeoForgeVersions, QuiltGameVersionsResponse, QuiltLoaderVersionsResponse } from '../model/manifest-mc-ml'

// Define the initial state using that type
const initialState: ModLoaderManifest = {
    forge: null,
    neoforge: null,
    fabric: {
        loader: null,
        game: null
    },
    quilt: {
        loader: null,
        game: null
    }
}

export const modLoaderManifestSlice = createSlice({
    name: 'modLoaderManifest',
    initialState,
    reducers: {
        loadManifest: (state, action: PayloadAction<ModLoaderManifest>) => {
            state.forge = action.payload.forge
            state.neoforge = action.payload.neoforge
            state.fabric.loader = action.payload.fabric.loader
            state.fabric.game = action.payload.fabric.game
            state.quilt.loader = action.payload.quilt.loader
            state.quilt.game = action.payload.quilt.game
        },
        updateForgeManifest: (state, action: PayloadAction<ForgeMavenMetadata>) => {
            state.forge = action.payload
        },
        updateNeoManifest: (state, action: PayloadAction<NeoForgeVersions>) => {
            state.neoforge = action.payload
        },
        updateFabricManifest: (state, action: PayloadAction<FabricLoaderVersionsResponse>) => {
            state.fabric.loader = action.payload
        },
        updateFabricGameManifest: (state, action: PayloadAction<FabricGameVersionsResponse>) => {
            state.fabric.game = action.payload
        },
        updateQuiltManifest: (state, action: PayloadAction<QuiltLoaderVersionsResponse>) => {
            state.quilt.loader = action.payload
        },
        updateQuiltGameManifest: (state, action: PayloadAction<QuiltGameVersionsResponse>) => {
            state.quilt.game = action.payload
        },
    },
})

export const { loadManifest, updateForgeManifest, updateNeoManifest, updateFabricManifest, updateFabricGameManifest, updateQuiltManifest, updateQuiltGameManifest } = modLoaderManifestSlice.actions

export const selectModLoaderManifest = (state: RootState) => state.modLoaderManifest;

export const modLoaderManifestReducer = modLoaderManifestSlice.reducer;