import Database from "@tauri-apps/plugin-sql";

// Nome del database SQLite. Deve combaciare con la connection string usata
// nelle migration lato Rust (src-tauri/src/lib.rs). Il file viene creato
// automaticamente in app config dir al primo `Database.load`.
const DB_NAME = "sqlite:forgemodpack.db";

// Singleton della connessione: `Database.load` viene chiamato una sola volta
// e la promise riutilizzata, così le migration girano una volta sola.
let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
    if (!dbPromise) {
        dbPromise = Database.load(DB_NAME);
    }
    return dbPromise;
}

export interface CacheEntry<T> {
    data: T;
    /** Timestamp dell'ultimo salvataggio (epoch ms). */
    updatedAt: number;
}

interface CacheRow {
    data: string;
    updated_at: number;
}

/**
 * Legge una entry dalla cache. Ritorna `null` se la chiave non esiste.
 * Il dato viene deserializzato dal JSON salvato.
 */
export async function getCache<T>(key: string): Promise<CacheEntry<T> | null> {
    const db = await getDb();
    const rows = await db.select<CacheRow[]>(
        "SELECT data, updated_at FROM manifest_cache WHERE key = $1",
        [key]
    );

    if (rows.length === 0) return null;

    return {
        data: JSON.parse(rows[0].data) as T,
        updatedAt: rows[0].updated_at,
    };
}

/**
 * Scrive (upsert) una entry nella cache serializzandola in JSON e
 * aggiornando il timestamp.
 */
export async function setCache<T>(key: string, data: T): Promise<void> {
    const db = await getDb();
    await db.execute(
        `INSERT INTO manifest_cache (key, data, updated_at) VALUES ($1, $2, $3)
         ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        [key, JSON.stringify(data), Date.now()]
    );
}
