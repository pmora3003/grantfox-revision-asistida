import type { Admisibilidad, CondicionAdmisibilidad, Entrada, FileClassification } from '../types.ts'
import { admisibilidad as cfgAdm, parametrosCa } from './config.generada.ts'

const PREFIJO_ISSUE_RE =
  /\b(?:issue|tarea|closes?|fixes?|resolves?|refs?|related)\b/i

const REFERENCIA_TAREA_RE =
  /(?:(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s*#\d+|github\.com\/[^\s]+\/issues\/\d+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#\d+|#\d+)/gi

const ORDEN_CA = ['CA-001', 'CA-002', 'CA-003', 'CA-004'] as const
const ESTADOS_FUSIONADOS = new Set(['closed', 'merged'])

/** Equivalente a Python `repr` para cadenas y None (comillas simples). */
function pyRepr(valor: unknown): string {
  if (valor == null) return 'None'
  if (typeof valor === 'boolean') return valor ? 'True' : 'False'
  if (typeof valor === 'string') {
    return `'${valor.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  }
  return String(valor)
}

function evaluarCa001(contexto: Record<string, unknown>): CondicionAdmisibilidad {
  const merged = Boolean(contexto.merged)
  const state = contexto.state
  const stateOk =
    typeof state === 'string' && ESTADOS_FUSIONADOS.has(state.toLowerCase())
  const observed = `merged=${merged ? 'True' : 'False'}, state=${pyRepr(state)}`
  if (merged && stateOk) {
    return { code: 'CA-001', result: 'cumple', observed }
  }
  return { code: 'CA-001', result: 'no_cumple', observed }
}

function evaluarCa002(contexto: Record<string, unknown>): CondicionAdmisibilidad {
  const minArchivos = Number(parametrosCa('CA-002').min_archivos ?? 6)
  const fileStats = (contexto.fileStats as unknown[]) || []
  const cantidad = fileStats.length
  const observed = `${cantidad} archivos en fileStats`
  if (cantidad >= minArchivos) {
    return { code: 'CA-002', result: 'cumple', observed }
  }
  return { code: 'CA-002', result: 'no_cumple', observed }
}

function evaluarCa003(clasificacion: FileClassification): CondicionAdmisibilidad {
  const byType = clasificacion.byType || { codigo: 0, pruebas: 0 }
  const codigo = Number(byType.codigo ?? 0)
  const pruebas = Number(byType.pruebas ?? 0)
  const observed = `codigo=${codigo}, pruebas=${pruebas}`
  if (codigo >= 1) {
    return { code: 'CA-003', result: 'cumple', observed }
  }
  return { code: 'CA-003', result: 'no_cumple', observed }
}

function tieneReferenciaTarea(body: string): string | null {
  const re = new RegExp(REFERENCIA_TAREA_RE.source, 'gi')
  let coincidencia: RegExpExecArray | null
  while ((coincidencia = re.exec(body)) !== null) {
    const fragmento = coincidencia[0]
    if (/^#\d+$/.test(fragmento)) {
      const inicio = coincidencia.index
      const prefijo = body.slice(Math.max(0, inicio - 40), inicio)
      if (!PREFIJO_ISSUE_RE.test(prefijo)) continue
    }
    return fragmento
  }
  return null
}

function evaluarCa004(contexto: Record<string, unknown>): CondicionAdmisibilidad {
  const body = contexto.body || ''
  if (typeof body === 'string') {
    const fragmento = tieneReferenciaTarea(body)
    if (fragmento) {
      return {
        code: 'CA-004',
        result: 'cumple',
        observed: `referencia en body: ${pyRepr(fragmento)}`,
      }
    }
  }
  return {
    code: 'CA-004',
    result: 'no_cumple',
    observed: 'sin referencia a tarea en body',
  }
}

function ca005(): CondicionAdmisibilidad {
  return {
    code: 'CA-005',
    result: 'no_verificable',
    observed: 'Se verifica en la plataforma, no esta en el insumo',
  }
}

export function evaluarAdmisibilidad(
  entradaNormalizada: Entrada,
  clasificacion: FileClassification,
): Admisibilidad {
  const contexto = (entradaNormalizada.context || {}) as Record<string, unknown>
  const condiciones: CondicionAdmisibilidad[] = []
  let stoppedAt: string | null = null

  const evaluadores: Record<string, () => CondicionAdmisibilidad> = {
    'CA-001': () => evaluarCa001(contexto),
    'CA-002': () => evaluarCa002(contexto),
    'CA-003': () => evaluarCa003(clasificacion),
    'CA-004': () => evaluarCa004(contexto),
  }

  for (const codigo of ORDEN_CA) {
    const resultado = evaluadores[codigo]!()
    condiciones.push(resultado)
    if (resultado.result === 'no_cumple') {
      stoppedAt = codigo
      break
    }
  }

  condiciones.push(ca005())

  return {
    outcome: stoppedAt ? 'no_admisible' : 'admisible',
    stoppedAt,
    version: cfgAdm.version,
    conditions: condiciones,
  }
}
