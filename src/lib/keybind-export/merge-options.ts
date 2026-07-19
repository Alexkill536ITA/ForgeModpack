// Merge riga-per-riga del file options.txt di Minecraft. Funzione pura (nessun
// I/O), cuore della sicurezza anti-perdita-dati: options.txt contiene molte
// righe non-keybind (grafica/audio) che NON vanno toccate.
//
// Regole:
//  - righe non `key_*`            -> preservate invariate
//  - `key_*` presenti nel progetto -> sovrascritte col nuovo input code
//  - `key_*` non nel progetto      -> lasciate invariate (bind di mod non gestite)
//  - `key_*` nuove                 -> appese in coda
//  - line ending (LF/CRLF) esistente preservato (Windows)

/**
 * Costruisce il contenuto di options.txt.
 * @param existing contenuto attuale del file, o null se non esiste
 * @param entries  mappa translationKey (`key.forward`) -> inputCode (`key.keyboard.w`)
 */
export function buildOptionsContent(
  existing: string | null,
  entries: Map<string, string>
): string {
  const line = (tk: string, code: string) => `key_${tk}:${code}`

  if (existing === null) {
    // File assente: emetti solo le righe keybind (LF, con newline finale).
    const out = [...entries].map(([tk, code]) => line(tk, code))
    return out.length ? out.join("\n") + "\n" : ""
  }

  const eol = existing.includes("\r\n") ? "\r\n" : "\n"
  const hadTrailing = /\r?\n$/.test(existing)
  const lines = existing.split(/\r?\n/)
  // Se il file terminava con newline, split lascia una stringa vuota finale:
  // la rimuovo e la ripristino a fine ricomposizione.
  if (hadTrailing && lines[lines.length - 1] === "") lines.pop()

  const used = new Set<string>()
  const out: string[] = []
  const keyRe = /^key_(.+?):/

  for (const l of lines) {
    const m = l.match(keyRe)
    if (m) {
      const tk = m[1]
      if (entries.has(tk)) {
        out.push(line(tk, entries.get(tk)!)) // sovrascrivi
        used.add(tk)
      } else {
        out.push(l) // keybind non gestita dal progetto: invariata
      }
    } else {
      out.push(l) // riga non-keybind: preserva
    }
  }

  // Keybind nuove non ancora presenti nel file.
  for (const [tk, code] of entries) {
    if (!used.has(tk)) out.push(line(tk, code))
  }

  return out.join(eol) + (hadTrailing ? eol : "")
}
