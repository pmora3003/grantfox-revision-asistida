import type { Entrada, EntradaContext, FileStat } from '../types.ts'
import { anonimizarTexto } from './sanitizar.ts'

const CAMPOS_CONTEXTO = [
  'prUrl',
  'headSha',
  'title',
  'body',
  'merged',
  'state',
  'linkedIssueTitle',
  'linkedIssueBody',
  'diff',
  'truncated',
  'fileStats',
  'ciConclusion',
  'reviewCommentCount',
] as const

const CAMPOS_TEXTO_ANONIMIZAR = new Set([
  'title',
  'body',
  'linkedIssueTitle',
  'linkedIssueBody',
  'diff',
])

/** Devuelve solo los campos de entrada del modelo, sin etiquetado. */
export function normalizarRegistro(registro: unknown): Entrada {
  const raw =
    registro && typeof registro === 'object'
      ? (registro as Record<string, unknown>)
      : {}
  const ctxOrigen =
    raw.context && typeof raw.context === 'object'
      ? (raw.context as Record<string, unknown>)
      : {}

  const contexto: Record<string, unknown> = {}
  for (const clave of CAMPOS_CONTEXTO) {
    let valor = ctxOrigen[clave]
    if (CAMPOS_TEXTO_ANONIMIZAR.has(clave) && typeof valor === 'string') {
      valor = anonimizarTexto(valor)
    }
    contexto[clave] = valor
  }

  return {
    id: String(raw.id ?? ''),
    context: contexto as EntradaContext,
    requested_amount:
      raw.requested_amount == null ? undefined : Number(raw.requested_amount),
  }
}

/** Alias alineado con el nombre Python `normalizar`. */
export function normalizar(registro: unknown): Entrada {
  return normalizarRegistro(registro)
}

export function fileStatsDe(entrada: Entrada): FileStat[] {
  const stats = entrada.context?.fileStats
  return Array.isArray(stats) ? stats : []
}
