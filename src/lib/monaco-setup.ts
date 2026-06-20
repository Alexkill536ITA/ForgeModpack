// Configura il loader di `@monaco-editor/react` perché carichi Monaco dagli asset
// locali (`public/monaco/vs`, copiati da scripts/copy-monaco.mjs) invece che dalla
// CDN: l'app Tauri gira offline. Va importato una sola volta prima di montare
// l'<Editor /> (lo facciamo nel componente code-editor).

import { loader } from "@monaco-editor/react"

let configured = false

export function setupMonacoLoader() {
  if (configured) return
  configured = true
  loader.config({ paths: { vs: "/monaco/vs" } })
}
