import type { Entrada, Salida } from '../types.ts'
import { evaluarAdmisibilidad } from './admisibilidad.ts'
import {
  agregar,
  criteriosInsuficientes,
  diffEstaCapado,
  type MetaAnalisis,
} from './agregar.ts'
import { clasificarEntrega } from './clasificar.ts'
import {
  instructionHash,
  instructionVersion,
} from './config.generada.ts'
import { normalizarRegistro } from './normalizar.ts'
import { analizarTodasReglas } from './reglas.ts'

export { normalizarRegistro } from './normalizar.ts'
export { entradaDesdePR } from './github.ts'

/** Serializacion compatible con json.dumps(..., sort_keys=True, ensure_ascii=False). */
export function dumpsPython(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null'
  if (typeof obj === 'boolean') return obj ? 'true' : 'false'
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) return JSON.stringify(String(obj))
    return String(obj)
  }
  if (typeof obj === 'string') return JSON.stringify(obj)
  if (Array.isArray(obj)) {
    return '[' + obj.map((x) => dumpsPython(x)).join(', ') + ']'
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj as object).sort()
    return (
      '{' +
      keys
        .map(
          (k) =>
            JSON.stringify(k) +
            ': ' +
            dumpsPython((obj as Record<string, unknown>)[k]),
        )
        .join(', ') +
      '}'
    )
  }
  return JSON.stringify(String(obj))
}

async function sha256Hex(texto: string): Promise<string> {
  const data = new TextEncoder().encode(texto)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function formatearExecutedAt(fecha: Date): string {
  const iso = fecha.toISOString()
  // Python: %Y-%m-%dT%H:%M:%SZ (sin milisegundos)
  return iso.replace(/\.\d{3}Z$/, 'Z')
}

export interface ProcesarOpciones {
  ahora?: Date
}

/** Pipeline de reglas: misma forma que Python escribe en seccion 9. */
export async function procesarEntrada(
  registro: unknown,
  opciones?: ProcesarOpciones,
): Promise<Salida> {
  const inicio = performance.now()
  const entrada = normalizarRegistro(registro)
  const entradaHash = await sha256Hex(dumpsPython(entrada))
  const ctx = entrada.context || {}
  let headSha = ctx.headSha
  if (headSha != null) headSha = String(headSha)

  const clasificacion = clasificarEntrega(ctx.fileStats || [])
  const admissibility = evaluarAdmisibilidad(entrada, clasificacion)

  let criterios
  const meta: MetaAnalisis = {
    automationSignals: [],
    tareaCorresponde: null,
    suggestedLevel: null,
    suggestedAmount: null,
    dependeInformacionExterna: false,
    motivoDependencia: null,
    diffCapado: diffEstaCapado(entrada),
    modoEjecucion: 'reglas',
  }

  if (admissibility.outcome === 'no_admisible') {
    criterios = criteriosInsuficientes(
      `Analisis detenido por admisibilidad (${admissibility.stoppedAt})`,
    )
  } else {
    const [criteriosSim, , metaModelo] = analizarTodasReglas(
      entrada,
      clasificacion,
    )
    criterios = criteriosSim
    Object.assign(meta, metaModelo)
    meta.modoEjecucion = 'reglas'
  }

  const agregado = agregar(
    admissibility,
    clasificacion,
    criterios,
    entrada,
    meta,
  )
  criterios = agregado.criteria || criterios

  const durationMs = Math.trunc(performance.now() - inicio)
  const executedAt = formatearExecutedAt(opciones?.ahora ?? new Date())
  const truncatedInput =
    Boolean(ctx.truncated) || Boolean(meta.diffCapado)

  return {
    contributionId: String(entrada.id || (registro as { id?: string })?.id || ''),
    executedAt,
    model: { name: 'motor-reglas', version: 'reglas-v1' },
    instructionVersion,
    headSha: headSha ?? null,
    modoEjecucion: 'reglas',
    admissibility: {
      outcome: admissibility.outcome,
      stoppedAt: admissibility.stoppedAt,
      conditions: admissibility.conditions,
      version: admissibility.version,
    },
    fileClassification: {
      byType: clasificacion.byType,
      realVolume: clasificacion.realVolume,
      excludedFromVolume: clasificacion.excludedFromVolume,
      porArchivo: clasificacion.porArchivo,
    },
    criteria: criterios,
    dimensions: agregado.dimensions,
    reward: agregado.reward,
    recommendation: agregado.recommendation,
    confidence: agregado.confidence,
    priority: agregado.priority,
    automationSignals: agregado.automationSignals,
    limits: agregado.limits,
    execution: {
      durationMs,
      truncatedInput,
      instructionHash,
      entradaHash,
    },
  }
}

export type ItemCasoEntrada = {
  tipo: 'entradas'
  items: Array<{ ok: true; entrada: Entrada } | { ok: false; error: string; indice: number }>
}

export type ItemCasoResultado = {
  tipo: 'resultados'
  items: Array<
    | { ok: true; entrada: Entrada; salida: Salida }
    | { ok: false; error: string; indice: number }
  >
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function validarEntradaMinima(
  raw: unknown,
  indice: number,
): { ok: true; entrada: Entrada } | { ok: false; error: string; indice: number } {
  if (!esObjeto(raw)) {
    return {
      ok: false,
      indice,
      error: `Item ${indice}: se esperaba un objeto con id y context`,
    }
  }
  if (typeof raw.id !== 'string' || !raw.id.trim()) {
    return {
      ok: false,
      indice,
      error: `Item ${indice}: falta el campo obligatorio "id" (cadena no vacia)`,
    }
  }
  if (!esObjeto(raw.context)) {
    return {
      ok: false,
      indice,
      error: `Item ${indice}: falta el campo obligatorio "context" (objeto)`,
    }
  }
  if (
    raw.requested_amount != null &&
    (typeof raw.requested_amount !== 'number' ||
      Number.isNaN(raw.requested_amount))
  ) {
    return {
      ok: false,
      indice,
      error: `Item ${indice}: "requested_amount" debe ser numerico si esta presente`,
    }
  }
  return { ok: true, entrada: normalizarRegistro(raw) }
}

function validarResultado(
  raw: unknown,
  indice: number,
):
  | { ok: true; entrada: Entrada; salida: Salida }
  | { ok: false; error: string; indice: number } {
  if (!esObjeto(raw)) {
    return {
      ok: false,
      indice,
      error: `Item ${indice}: se esperaba {entrada, salida}`,
    }
  }
  if (!esObjeto(raw.entrada)) {
    return {
      ok: false,
      indice,
      error: `Item ${indice}: falta "entrada" (objeto)`,
    }
  }
  if (!esObjeto(raw.salida)) {
    return {
      ok: false,
      indice,
      error: `Item ${indice}: falta "salida" (objeto)`,
    }
  }
  const entradaCheck = validarEntradaMinima(raw.entrada, indice)
  if (!entradaCheck.ok) return entradaCheck
  const salida = raw.salida as unknown as Salida
  if (typeof salida.contributionId !== 'string') {
    return {
      ok: false,
      indice,
      error: `Item ${indice}: salida.contributionId debe ser cadena`,
    }
  }
  if (!esObjeto(salida.recommendation as unknown)) {
    return {
      ok: false,
      indice,
      error: `Item ${indice}: salida.recommendation debe ser objeto`,
    }
  }
  return { ok: true, entrada: entradaCheck.entrada, salida }
}

function parseContenido(texto: string): unknown[] {
  const trimmed = texto.trim()
  if (!trimmed) {
    throw new Error('El archivo esta vacio')
  }

  // JSON array u objeto unico
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) return parsed
      return [parsed]
    } catch {
      // puede ser JSONL que empieza por {
    }
  }

  // JSONL
  const items: unknown[] = []
  const lineas = trimmed.split(/\r?\n/)
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]!.trim()
    if (!linea) continue
    try {
      items.push(JSON.parse(linea))
    } catch {
      throw new Error(`Linea ${i + 1}: JSON invalido`)
    }
  }
  if (!items.length) {
    throw new Error('No se encontraron registros en el archivo')
  }
  return items
}

function detectarTipo(
  items: unknown[],
): 'entradas' | 'resultados' {
  const primero = items.find((x) => esObjeto(x))
  if (!primero) return 'entradas'
  if ('entrada' in primero && 'salida' in primero) return 'resultados'
  return 'entradas'
}

/**
 * Lee JSONL / JSON array / objeto unico de entradas golden o de {entrada, salida}.
 */
export function leerArchivoCasos(
  texto: string,
): ItemCasoEntrada | ItemCasoResultado {
  const rawItems = parseContenido(texto)
  const tipo = detectarTipo(rawItems)

  if (tipo === 'resultados') {
    const items = rawItems.map((raw, i) => validarResultado(raw, i))
    return { tipo: 'resultados', items }
  }

  const items = rawItems.map((raw, i) => validarEntradaMinima(raw, i))
  return { tipo: 'entradas', items }
}
