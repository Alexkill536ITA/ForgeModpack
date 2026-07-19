import { KeybindExporter } from "./types"

// ⚠️ FORMATO NON ANCORA DEFINITO.
// Placeholder per l'export verso la mod di profili/mappe multiple di keybind
// ("keyset"). È disabilitato in UI (`available: false`) finché non verrà fornito
// il formato reale del file.
//
// Quando il formato sarà noto:
//   1. implementare la serializzazione in build()
//   2. impostare available = true e defaultFileName corretto
//   3. la mod gestisce PIÙ mappe: valutare se estendere l'interfaccia con un
//      metodo opzionale buildAll(maps, ctx) per esportare tutte le keybindMaps
//      insieme (options.txt riceve invece una singola mappa).
export const keysetExporter: KeybindExporter = {
  id: "keyset",
  label: "Keyset mod (format TBD)",
  defaultFileName: "keyset.json",
  available: false,
  async build() {
    throw new Error("Keyset exporter not implemented yet: file format to be defined.")
  },
}
