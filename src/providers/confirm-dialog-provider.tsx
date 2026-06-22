import { createContext, useContext, useState, ReactNode } from 'react'
import { CircleQuestionMarkIcon, InfoIcon, OctagonAlertIcon, TriangleAlertIcon } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog'

export type ConfirmDialogType = 'yes/no' | 'info' | 'warning' | 'delete' | 'error' | 'cancel/continue/save'

interface ConfirmOptions {
    type?: ConfirmDialogType
    title?: string
    message?: string
    without?: boolean
}

interface ConfirmContextValue {
    confirm: (options: ConfirmOptions) => Promise<boolean | string>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export const useConfirm = () => {
    const ctx = useContext(ConfirmContext)
    if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
    return ctx
}

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {

    const [state, setState] = useState<{
        open: boolean
        options?: ConfirmOptions
        resolve?: (value: boolean | string) => void
    }>({ open: false })

    const confirm = (options: ConfirmOptions) => {
        return new Promise<boolean | string>((resolve) => {
            setState({ open: true, options, resolve })
        })
    }

    const close = (result: boolean | string) => {
        state.resolve?.(result)
        setState({ open: false })
    }

    const type = state.options?.type || 'info'

    const confirmDialogTitle = () => {
        if (state.options?.title) return state.options.title
        switch (type) {
            case 'delete':
                return 'Delete'
            case 'yes/no':
                return "Are you sure?"
            case 'warning':
                return "Warning"
            case 'error':
                return "Error"
            default:
                return 'Confirm'
        }
    };

    const message = state.options?.message || 'Are you sure you want to proceed?'

    const getIcon = () => {
        switch (type) {
            case 'warning':
                return (
                    <div className="bg-warning/10 mx-auto mb-2 flex size-12 items-center justify-center rounded-full">
                        <TriangleAlertIcon className="text-warning size-6" />
                    </div>
                )
            case 'delete':
                return (
                    <div className="bg-destructive/10 mx-auto mb-2 flex size-12 items-center justify-center rounded-full">
                        <TriangleAlertIcon className="text-destructive size-6" />
                    </div>
                )
            case 'error':
                return (
                    <div className="bg-destructive/10 mx-auto mb-2 flex size-12 items-center justify-center rounded-full">
                        <OctagonAlertIcon className="text-destructive size-6" />
                    </div>
                )
            case 'cancel/continue/save':
                return <div className="bg-blue-500/10 mx-auto mb-2 flex size-12 items-center justify-center rounded-full">
                    <CircleQuestionMarkIcon className="text-blue-500 size-6" />
                </div>
            default:
                return (
                    <div className="bg-primary/10 mx-auto mb-2 flex size-12 items-center justify-center rounded-full">
                        <InfoIcon className="text-primary size-6" />
                    </div>
                )
        }
    }

    const getActions = () => {
        switch (type) {
            case 'yes/no':
                return (
                    <>
                        <AlertDialogCancel onClick={() => close(false)}>
                            No
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={() => close(true)}>
                            Yes
                        </AlertDialogAction>
                    </>
                )
            case 'delete':
                return (
                    <>
                        <AlertDialogCancel onClick={() => close(false)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => close(true)}
                            className="bg-destructive text-white"
                        >
                            Delete
                        </AlertDialogAction>
                    </>
                )
            case 'cancel/continue/save':
                return (
                    <>
                        <AlertDialogCancel onClick={() => close(false)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={() => close("continue")}>
                            {state.options?.without ? "Without Save" : "Continue"}
                        </AlertDialogAction>
                        <AlertDialogAction onClick={() => close(true)}>
                            Save
                        </AlertDialogAction>
                    </>
                )
            default:
                return (
                    <AlertDialogCancel onClick={() => close(true)}>
                        Ok
                    </AlertDialogCancel>
                )
        }
    }

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}

            <AlertDialog open={state.open}>
                <AlertDialogContent>
                    <AlertDialogHeader className="items-center">
                        {getIcon()}
                        <AlertDialogTitle className='w-full text-center'>{confirmDialogTitle()}</AlertDialogTitle>
                        <AlertDialogDescription className="text-center">
                            {message}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>{getActions()}</AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ConfirmContext.Provider>
    )
}

// --------------------
// USO:
// --------------------
// const { confirm } = useConfirm()
// const ok = await confirm({ type: 'delete', title: 'Attenzione', message: 'Vuoi eliminare?' })
