// Diff per riga tra il contenuto salvato su disco e quello correntemente
// nell'editor, usato per il "dirty diff" (marcatori nel gutter di Monaco) e per
// il conteggio modifiche nella status bar. LCS classico con backtracking, poi
// raggruppamento delle operazioni in blocchi (added / modified / deleted).

export interface LineChange {
  /** Numeri di riga (1-based, sul contenuto corrente) aggiunti. */
  added: number[]
  /** Numeri di riga (1-based, corrente) modificati. */
  modified: number[]
  /** Righe correnti (1-based) accanto a cui c'è stata una cancellazione. */
  deletedAt: number[]
  counts: { added: number; modified: number; removed: number }
}

const EMPTY: LineChange = {
  added: [],
  modified: [],
  deletedAt: [],
  counts: { added: 0, modified: 0, removed: 0 },
}

// Oltre questa soglia il DP O(n*m) costerebbe troppo: rinunciamo al dettaglio.
const MAX_CELLS = 4_000_000

export function diffLines(original: string, current: string): LineChange {
  if (original === current) return EMPTY

  const a = original.split("\n")
  const b = current.split("\n")
  const n = a.length
  const m = b.length

  if (n * m > MAX_CELLS) return EMPTY

  // dp[i][j] = lunghezza LCS di a[i..] e b[j..]
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const added: number[] = []
  const modified: number[] = []
  const deletedAt: number[] = []
  let totalDels = 0

  // Stato del blocco di modifiche corrente.
  let dels = 0
  let insLines: number[] = []
  let blockJ: number | null = null

  const flush = () => {
    if (dels === 0 && insLines.length === 0) return
    totalDels += dels
    // Le prime min(dels, ins) inserzioni accoppiate alle cancellazioni = modificate.
    const modN = Math.min(dels, insLines.length)
    insLines.forEach((ln, k) => (k < modN ? modified : added).push(ln))
    if (dels > insLines.length) {
      // Cancellazioni "pure" senza inserzione corrispondente: marcatore sulla riga.
      const mark = insLines.length > 0 ? insLines[insLines.length - 1] : Math.min((blockJ ?? 0) + 1, m)
      deletedAt.push(Math.max(mark, 1))
    }
    dels = 0
    insLines = []
    blockJ = null
  }

  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      flush()
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      if (blockJ === null) blockJ = j
      dels++
      i++
    } else {
      if (blockJ === null) blockJ = j
      insLines.push(j + 1)
      j++
    }
  }
  while (i < n) {
    if (blockJ === null) blockJ = j
    dels++
    i++
  }
  while (j < m) {
    if (blockJ === null) blockJ = j
    insLines.push(j + 1)
    j++
  }
  flush()

  return {
    added,
    modified,
    deletedAt,
    counts: {
      added: added.length,
      modified: modified.length,
      removed: totalDels - modified.length,
    },
  }
}
