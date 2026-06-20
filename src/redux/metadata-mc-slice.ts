import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'
import { MinecraftManifest } from '../model/manifest-mc-ml'

// Define the initial state using that type
const initialState: MinecraftManifest = {
    latest: {
        release: '',
        snapshot: ''
    },
    versions: []
}

export const minecraftManifestSlice = createSlice({
    name: 'minecraftManifest',
    initialState,
    reducers: {
        updateMinecraftManifest: (state, action: PayloadAction<MinecraftManifest>) => {
            state.latest = action.payload.latest
            state.versions = action.payload.versions
        },
    },
})

export const { updateMinecraftManifest } = minecraftManifestSlice.actions

export const selectMinecraftManifest = (state: RootState) => state.minecraftManifest;

export const minecraftManifestReducer = minecraftManifestSlice.reducer;