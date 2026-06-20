import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'

// File correntemente aperto nell'editor della sezione Documents. La selezione
// avviene dall'albero nella sidebar; la pagina /documents legge questo stato e
// carica/salva il contenuto su disco. È volutamente separato dal `project`:
// i file di config NON vivono nel project.json.
export interface openDocument {
    path: string
    name: string
}

interface documentsState {
    openFile: openDocument | null
}

const initialState: documentsState = {
    openFile: null
}

export const documentsSlice = createSlice({
    name: 'documents',
    initialState,
    reducers: {
        openDocument: (state, action: PayloadAction<openDocument>) => {
            state.openFile = action.payload
        },
        closeDocument: (state) => {
            state.openFile = null
        }
    },
})

export const { openDocument, closeDocument } = documentsSlice.actions

export const selectOpenDocument = (state: RootState) => state.documents.openFile

export const documentsReducer = documentsSlice.reducer
