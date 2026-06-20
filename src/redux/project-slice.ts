import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'
import { project } from '../model/models'

// Define a type for the slice state
interface projectState {
    project: project | null
}

// Define the initial state using that type
const initialState: projectState = {
    project: null
}

export const projectSlice = createSlice({
    name: 'project',
    initialState,
    reducers: {
        updateProject: (state, action: PayloadAction<project>) => {
            state.project = action.payload
        }
    },
})

export const { updateProject } = projectSlice.actions

export const selectProject = (state: RootState) => state.project;

export const projectReducer = projectSlice.reducer;