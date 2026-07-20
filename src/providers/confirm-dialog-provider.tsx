import { createContext, useContext, useState, ReactNode } from 'react'
import { CircleQuestionMarkIcon, InfoIcon, OctagonAlertIcon, TriangleAlertIcon } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog'
import { useTranslation } from '@/src/i18n/i18n-provider'

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

    const { t } = useTranslation()

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
                return t("confirm.titleDelete")
            case 'yes/no':
                return t("confirm.titleAreYouSure")
            case 'warning':
                return t("confirm.titleWarning")
            case 'error':
                return t("confirm.titleError")
            default:
                return t("confirm.titleConfirm")
        }
    };

    const message = state.options?.message || t("confirm.defaultMessage")

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
                            {t("confirm.buttonNo")}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={() => close(true)}>
                            {t("confirm.buttonYes")}
                        </AlertDialogAction>
                    </>
                )
            case 'delete':
                return (
                    <>
                        <AlertDialogCancel onClick={() => close(false)}>
                            {t("confirm.buttonCancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction variant={'destructive'}
                            onClick={() => close(true)}
                            className="text-white"
                        >
                            {t("confirm.buttonDelete")}
                        </AlertDialogAction>
                    </>
                )
            case 'cancel/continue/save':
                return (
                    <>
                        <AlertDialogCancel onClick={() => close(false)}>
                            {t("confirm.buttonCancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={() => close("continue")}>
                            {state.options?.without ? t("confirm.buttonWithoutSave") : t("confirm.buttonContinue")}
                        </AlertDialogAction>
                        <AlertDialogAction onClick={() => close(true)}>
                            {t("confirm.buttonSave")}
                        </AlertDialogAction>
                    </>
                )
            default:
                return (
                    <AlertDialogCancel onClick={() => close(true)}>
                        {t("confirm.buttonOk")}
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
                        <AlertDialogDescription className="w-full text-center">
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
