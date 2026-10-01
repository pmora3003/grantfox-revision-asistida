import type { Entrada, FuenteCaso, ItemCola, Salida } from './types'

const STORAGE_KEY = 'grantfox-cola-agregados'
/** Tope aproximado (caracteres) para no saturar localStorage. */
const MAX_CHARS = 2_500_000

export type PersistResult =
  | { ok: true; mode: 'localStorage' }
  | { ok: true; mode: 'memoria'; aviso: string }
  | { ok: false; error: string }

type StoredItem = {
  entrada: Entrada
  salida: Salida | null
  fuente: Exclude<FuenteCaso, 'por_defecto'>
  pendienteCalculo: boolean
}

export function loadAgregados(): ItemCola[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredItem[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (x) =>
          x &&
          typeof x === 'object' &&
          x.entrada &&
          (x.fuente === 'enlace' || x.fuente === 'archivo'),
      )
      .map((x) => ({
        entrada: x.entrada,
        salida: x.salida ?? null,
        fuente: x.fuente,
        pendienteCalculo: Boolean(x.pendienteCalculo) || x.salida == null,
      }))
  } catch {
    return []
  }
}

export function saveAgregados(items: ItemCola[]): PersistResult {
  const extras = items.filter(
    (i) => i.fuente === 'enlace' || i.fuente === 'archivo',
  ) as StoredItem[]
  const payload = JSON.stringify(extras)
  if (payload.length > MAX_CHARS) {
    return {
      ok: true,
      mode: 'memoria',
      aviso:
        'Los datos agregados son demasiado grandes para guardarlos en este navegador. Se mantienen solo en memoria hasta recargar la página.',
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, payload)
    return { ok: true, mode: 'localStorage' }
  } catch {
    return {
      ok: true,
      mode: 'memoria',
      aviso:
        'No se pudo guardar en localStorage. Los datos agregados quedan solo en memoria hasta recargar la página.',
    }
  }
}

export function clearAgregados() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function fuenteLabel(f: FuenteCaso): string {
  if (f === 'por_defecto') return 'Por defecto'
  if (f === 'enlace') return 'Enlace'
  return 'Archivo'
}

export function resumenFuentes(items: ItemCola[]): string {
  let def = 0
  let enlace = 0
  let archivo = 0
  for (const i of items) {
    if (i.fuente === 'por_defecto') def++
    else if (i.fuente === 'enlace') enlace++
    else archivo++
  }
  const parts: string[] = []
  if (def > 0) parts.push(`${def} por defecto`)
  if (enlace > 0) parts.push(`${enlace} por enlace`)
  if (archivo > 0) parts.push(`${archivo} por archivo`)
  if (parts.length === 0) return 'Sin datos'
  if (parts.length === 1 && def > 0) return 'Datos por defecto'
  return parts.join(', ')
}
