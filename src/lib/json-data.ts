import type { project } from "./models";

/**
 * Path supportati (notazione a punti + bracket):
 *
 *  - "metadata.name"                        -> chiave semplice annidata
 *  - "modloader.type"                       -> chiave semplice annidata
 *  - "mods[name=jei].version"               -> filtra l'array `mods` cercando l'elemento
 *                                               con `name === "jei"`, poi legge/scrive `version`
 *  - "mods[name=jei]"                       -> punta all'intero oggetto mod trovato (o lo crea)
 *  - "assetes[name=texture_pack].path"       -> stessa logica su `assetes`
 *  - "keybinds[0].combat[0].key"             -> `keybinds` è un array di keybindsMap,
 *                                               quindi: indice 0 dell'array -> chiave "combat"
 *                                               (la mappa) -> indice 0 dell'array di keybind -> "key"
 *  - "configs.workpath"                     -> chiave semplice
 *
 * IMPORTANTE: tutte le funzioni di scrittura sono IMMUTABILI.
 * Non mutano l'oggetto passato (fondamentale per lo state di React),
 * ma ritornano un NUOVO oggetto. Vanno sempre usate così:
 *
 *   const updated = setByPath(formData, "metadata.name", "X");
 *   setFormData(updated);
 */

type PathSegment =
  | { type: "key"; key: string }
  | { type: "index"; index: number }
  | { type: "filter"; key: string; value: string };

function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  const regex = /([^.\[\]]+)(\[([^\]]+)\])?/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(path)) !== null) {
    const [, key, , bracket] = match;
    if (key) segments.push({ type: "key", key });
    if (bracket) {
      if (/^\d+$/.test(bracket)) {
        segments.push({ type: "index", index: Number(bracket) });
      } else {
        const [filterKey, filterValue] = bracket.split("=");
        segments.push({ type: "filter", key: filterKey, value: filterValue });
      }
    }
  }
  return segments;
}

/** Walk di sola lettura: non crea né muta nulla, ritorna undefined se il path non esiste. */
function resolveParent(obj: any, segments: PathSegment[]): any {
  let current = obj;
  for (const seg of segments) {
    if (current == null) return undefined;

    if (seg.type === "key") {
      current = current[seg.key];
    } else if (seg.type === "index") {
      current = current[seg.index];
    } else {
      if (!Array.isArray(current)) return undefined;
      current = current.find((item) => String(item?.[seg.key]) === seg.value);
    }
  }
  return current;
}

/** Legge un valore dal project dato un path stringa. Non muta nulla. */
export function getByPath<T = unknown>(obj: project, path: string): T | undefined {
  return resolveParent(obj, parsePath(path));
}

// ---------------------------------------------------------------------------
// SET (immutabile, con upsert)
// ---------------------------------------------------------------------------

function setImmutable(current: any, segments: PathSegment[], value: unknown, upsert: boolean): any {
  if (segments.length === 0) {
    return value;
  }

  const [seg, ...rest] = segments;

  if (seg.type === "key") {
    const hasObjectBase = current != null && typeof current === "object" && !Array.isArray(current);
    if (!upsert && (!hasObjectBase || !(seg.key in current))) {
      throw new Error(`Path non risolto: chiave "${seg.key}" non trovata`);
    }
    const base = hasObjectBase ? { ...current } : {};
    base[seg.key] = setImmutable(base[seg.key], rest, value, upsert);
    return base;
  }

  if (seg.type === "index") {
    if (!Array.isArray(current)) {
      if (!upsert) throw new Error(`Atteso un array nel path`);
      current = [];
    }
    if (!upsert && current[seg.index] === undefined) {
      throw new Error(`Indice non trovato: ${seg.index}`);
    }
    const arr = [...current];
    arr[seg.index] = setImmutable(arr[seg.index], rest, value, upsert);
    return arr;
  }

  // filter
  if (!Array.isArray(current)) {
    if (!upsert) throw new Error(`Atteso un array per il filtro`);
    current = [];
  }
  const arr = [...current];
  const idx = arr.findIndex((item) => String(item?.[seg.key]) === seg.value);
  const isLast = rest.length === 0;

  if (idx === -1) {
    if (!upsert) {
      throw new Error(`Nessun elemento trovato per [${seg.key}=${seg.value}]`);
    }
    const base = { [seg.key]: seg.value };
    const newItem = isLast
      ? value !== null && typeof value === "object"
        ? { ...base, ...(value as object) }
        : { ...base, value }
      : setImmutable(base, rest, value, upsert);
    arr.push(newItem);
    return arr;
  }

  if (isLast) {
    arr[idx] =
      value !== null && typeof value === "object" ? { ...arr[idx], ...(value as object) } : value;
  } else {
    arr[idx] = setImmutable(arr[idx], rest, value, upsert);
  }
  return arr;
}

/**
 * Scrive/aggiorna un valore dato un path stringa.
 * IMMUTABILE: ritorna un NUOVO project, non muta `obj`.
 *
 * Di default fa UPSERT: se una chiave, un indice o un filtro non esistono,
 * crea automaticamente i nodi intermedi necessari. Passa `{ upsert: false }`
 * per il comportamento strict (errore se un nodo non esiste).
 */
export function setByPath<T extends object = project>(
  obj: T,
  path: string,
  value: unknown,
  options: { upsert?: boolean } = {}
): T {
  const { upsert = true } = options;
  const segments = parsePath(path);
  if (segments.length === 0) throw new Error("Path vuoto");
  return setImmutable(obj, segments, value, upsert) as T;
}

// ---------------------------------------------------------------------------
// ADD (immutabile)
// ---------------------------------------------------------------------------

function addImmutable(current: any, segments: PathSegment[], value: unknown): any {
  if (segments.length === 0) {
    if (!Array.isArray(current)) throw new Error("Il path non punta a un array");
    return [...current, value];
  }

  const [seg, ...rest] = segments;

  if (seg.type === "key") {
    const base = current != null && typeof current === "object" && !Array.isArray(current) ? { ...current } : {};
    base[seg.key] = addImmutable(base[seg.key], rest, value);
    return base;
  }

  if (seg.type === "index") {
    if (!Array.isArray(current)) throw new Error("Atteso un array nel path");
    const arr = [...current];
    arr[seg.index] = addImmutable(arr[seg.index], rest, value);
    return arr;
  }

  // filter
  if (!Array.isArray(current)) throw new Error("Atteso un array per il filtro");
  const arr = [...current];
  const idx = arr.findIndex((item) => String(item?.[seg.key]) === seg.value);
  if (idx === -1) throw new Error(`Nessun elemento trovato per [${seg.key}=${seg.value}]`);
  arr[idx] = addImmutable(arr[idx], rest, value);
  return arr;
}

/**
 * Aggiunge un nuovo elemento in coda all'array individuato dal path.
 * IMMUTABILE: ritorna un NUOVO project.
 *
 * Es: const updated = addByPath(data, "mods", { name: "jei", version: "11.6.0" });
 */
export function addByPath<T extends object = project>(obj: T, path: string, value: unknown): T {
  const segments = parsePath(path);
  if (segments.length === 0) throw new Error("Path vuoto");
  return addImmutable(obj, segments, value) as T;
}

// ---------------------------------------------------------------------------
// REMOVE (immutabile)
// ---------------------------------------------------------------------------

function removeImmutable(
  current: any,
  segments: PathSegment[]
): { result: any; removed: boolean } {
  const [seg, ...rest] = segments;
  const isLast = rest.length === 0;

  if (seg.type === "key") {
    if (current == null || typeof current !== "object" || Array.isArray(current) || !(seg.key in current)) {
      return { result: current, removed: false };
    }
    if (isLast) {
      const { [seg.key]: _omit, ...remainder } = current;
      return { result: remainder, removed: true };
    }
    const { result: childResult, removed } = removeImmutable(current[seg.key], rest);
    if (!removed) return { result: current, removed: false };
    return { result: { ...current, [seg.key]: childResult }, removed: true };
  }

  if (seg.type === "index") {
    if (!Array.isArray(current) || current[seg.index] === undefined) {
      return { result: current, removed: false };
    }
    if (isLast) {
      const arr = [...current];
      arr.splice(seg.index, 1);
      return { result: arr, removed: true };
    }
    const { result: childResult, removed } = removeImmutable(current[seg.index], rest);
    if (!removed) return { result: current, removed: false };
    const arr = [...current];
    arr[seg.index] = childResult;
    return { result: arr, removed: true };
  }

  // filter
  if (!Array.isArray(current)) return { result: current, removed: false };
  const idx = current.findIndex((item) => String(item?.[seg.key]) === seg.value);
  if (idx === -1) return { result: current, removed: false };

  if (isLast) {
    const arr = [...current];
    arr.splice(idx, 1);
    return { result: arr, removed: true };
  }
  const { result: childResult, removed } = removeImmutable(current[idx], rest);
  if (!removed) return { result: current, removed: false };
  const arr = [...current];
  arr[idx] = childResult;
  return { result: arr, removed: true };
}

/**
 * Rimuove una chiave, un elemento per indice, o l'elemento di un array
 * che matcha il filtro. IMMUTABILE: ritorna { data, removed }.
 *
 * Es: const { data, removed } = removeByPath(project, "mods[name=jei]");
 *     if (removed) setProject(data);
 */
export function removeByPath<T extends object = project>(
  obj: T,
  path: string
): { data: T; removed: boolean } {
  const segments = parsePath(path);
  if (segments.length === 0) throw new Error("Path vuoto");
  const { result, removed } = removeImmutable(obj, segments);
  return { data: result as T, removed };
}

// ---------------------------------------------------------------------------
// DEEP UPDATE (già immutabile, invariato)
// ---------------------------------------------------------------------------

export function deepUpdate(
  data: unknown,
  visitor: (key: string | number, value: unknown, path: (string | number)[]) => unknown,
  path: (string | number)[] = []
): unknown {
  if (Array.isArray(data)) {
    return data.map((item, index) => {
      const newPath = [...path, index];
      const result = visitor(index, item, newPath);
      const value = result !== undefined ? result : item;
      return deepUpdate(value, visitor, newPath);
    });
  }

  if (data !== null && typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const newPath = [...path, key];
      const updated = visitor(key, value, newPath);
      const newValue = updated !== undefined ? updated : value;
      result[key] = deepUpdate(newValue, visitor, newPath);
    }
    return result;
  }

  return data;
}