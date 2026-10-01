import type {
  Admisibilidad,
  Confidence,
  Criterio,
  DimensionNombre,
  DimensionValoracion,
  Entrada,
  Priority,
  Recommendation,
  Reward,
  Severidad,
} from '../types.ts'
import {
  escala,
  nivelParaMonto,
  rangoNivel,
  type NivelNombre,
} from './config.generada.ts'
import { sanitizarTextoModelo } from './sanitizar.ts'

export const DIMENSIONES: DimensionNombre[] = [
  'cumplimiento_alcance',
  'calidad_tecnica',
  'riesgos_seguridad',
  'proporcionalidad',
]

export const CODIGOS_POR_DIMENSION: Record<DimensionNombre, string[]> = {
  cumplimiento_alcance: ['CR-001', 'CR-002', 'CR-003', 'CR-004', 'CR-005'],
  calidad_tecnica: [
    'CR-006',
    'CR-007',
    'CR-008',
    'CR-009',
    'CR-010',
    'CR-011',
    'CR-012',
  ],
  riesgos_seguridad: [
    'CR-013',
    'CR-014',
    'CR-015',
    'CR-016',
    'CR-017',
    'CR-018',
  ],
  proporcionalidad: ['CR-019', 'CR-020', 'CR-021', 'CR-022', 'CR-023'],
}

const DIFF_MAX = 60000
const NIVELES_NO_SATISFECHOS = new Set(['no_cumple', 'cumple_parcialmente'])
const NIVELES_CON_FRAGMENTO = new Set([
  'cumple',
  'cumple_parcialmente',
  'no_cumple',
])
const CODIGOS_FORZAR_TRUNCADO = new Set(['CR-013', 'CR-019'])
const ORDEN_SEVERIDAD: Record<string, number> = { alta: 3, media: 2, baja: 1 }
const RAZONES_TAREA_NO_VERIFICABLE = new Set([
  'No se pudo comprobar la correspondencia con la tarea',
])
const SUPERVISION_SCOPE: Record<string, Confidence['supervisionScope']> = {
  alto: 'confirmacion',
  medio: 'criterios_no_satisfechos',
  bajo: 'analisis_completo',
}

export interface MetaAnalisis {
  automationSignals: string[]
  tareaCorresponde: boolean | null
  suggestedLevel?: string | null
  suggestedAmount?: number | null
  dependeInformacionExterna: boolean
  motivoDependencia: string | null
  diffCapado?: boolean
  modoEjecucion?: string
  modelId?: string
}

export function diffEstaCapado(entrada: Entrada): boolean {
  const diff = entrada.context?.diff || ''
  const texto = typeof diff === 'string' ? diff : String(diff)
  return texto.length > DIFF_MAX
}

export function insumoTruncado(
  entrada: Entrada,
  meta?: Partial<MetaAnalisis> | null,
): boolean {
  return Boolean(entrada.context?.truncated) || Boolean(meta?.diffCapado)
}

export function criteriosInsuficientes(evidencia: string): Criterio[] {
  const salida: Criterio[] = []
  for (const dimension of DIMENSIONES) {
    for (const codigo of CODIGOS_POR_DIMENSION[dimension]) {
      salida.push({
        code: codigo,
        dimension,
        level: 'evidencia_insuficiente',
        evidence: evidencia,
        file: null,
        fragment: null,
        line: null,
      })
    }
  }
  return salida
}

export function postvalidarCriterios(
  criterios: Criterio[],
  entrada: Entrada,
  meta?: Partial<MetaAnalisis> | null,
): Criterio[] {
  const truncado = insumoTruncado(entrada, meta)
  const salida: Criterio[] = []
  for (const original of criterios) {
    const c: Criterio = { ...original }
    const level = c.level
    const fragment = c.fragment
    const fragmentVacio =
      fragment == null || (typeof fragment === 'string' && !fragment.trim())
    if (NIVELES_CON_FRAGMENTO.has(level) && fragmentVacio) {
      c.level = 'evidencia_insuficiente'
      const ev = c.evidence || ''
      const prefijo = 'Sin fragmento citado: '
      if (!String(ev).startsWith(prefijo)) {
        c.evidence = prefijo + String(ev)
      }
    }
    if (truncado && CODIGOS_FORZAR_TRUNCADO.has(c.code)) {
      c.level = 'evidencia_insuficiente'
      const ev = c.evidence || ''
      const prefijo = 'Insumo truncado: '
      if (!String(ev).startsWith(prefijo)) {
        c.evidence = prefijo + String(ev)
      }
    }
    salida.push(c)
  }
  return salida
}

export function agregarDimensiones(criterios: Criterio[]): DimensionValoracion[] {
  const porDim: Record<DimensionNombre, Criterio[]> = {
    cumplimiento_alcance: [],
    calidad_tecnica: [],
    riesgos_seguridad: [],
    proporcionalidad: [],
  }
  for (const c of criterios) {
    if (c.dimension in porDim) {
      porDim[c.dimension].push(c)
    }
  }

  const salida: DimensionValoracion[] = []
  for (const dim of DIMENSIONES) {
    const items = porDim[dim]
    const unmet = items
      .filter((c) => NIVELES_NO_SATISFECHOS.has(c.level))
      .map((c) => c.code)
    const nNo = items.filter((c) => c.level === 'no_cumple').length
    const nParcial = items.filter((c) => c.level === 'cumple_parcialmente').length
    const nInsuf = items.filter((c) => c.level === 'evidencia_insuficiente').length
    const nOk = items.filter((c) => c.level === 'cumple').length
    const assessment =
      `${nOk} cumplen, ${nParcial} parciales, ${nNo} no cumplen, ` +
      `${nInsuf} con evidencia insuficiente`
    salida.push({ dimension: dim, assessment, unmetCriteria: unmet })
  }
  return salida
}

export function agregarReward(
  requestedAmount: number | null | undefined,
  meta: Partial<MetaAnalisis>,
): Reward {
  const monto = Math.trunc(Number(requestedAmount || 0))
  const requestedLevel = nivelParaMonto(monto)

  let suggestedLevel = (meta.suggestedLevel ||
    requestedLevel ||
    'bajo') as NivelNombre
  if (!['bajo', 'medio', 'alto', 'spike'].includes(suggestedLevel)) {
    suggestedLevel = (requestedLevel || 'bajo') as NivelNombre
  }

  const rango = rangoNivel(suggestedLevel)
  let suggestedAmount = meta.suggestedAmount
  if (suggestedAmount == null) {
    suggestedAmount =
      requestedLevel === suggestedLevel
        ? monto
        : rango
          ? rango[0]
          : monto
  }
  suggestedAmount = Math.trunc(Number(suggestedAmount))
  if (rango) {
    const [lo, hi] = rango
    if (hi == null) {
      suggestedAmount = Math.max(lo, suggestedAmount)
    } else {
      suggestedAmount = Math.max(lo, Math.min(hi, suggestedAmount))
    }
  }

  return {
    requestedAmount: monto,
    requestedLevel,
    suggestedLevel,
    suggestedAmount,
    levelMismatch: requestedLevel !== suggestedLevel,
  }
}

function ratioEvidenciaInsuficiente(criterios: Criterio[]): number {
  const total = criterios.length || 1
  const nInsuf = criterios.filter((c) => c.level === 'evidencia_insuficiente').length
  return nInsuf / total
}

export function agregarConfianza(
  admissibility: Admisibilidad,
  criterios: Criterio[],
  entrada: Entrada,
  meta: Partial<MetaAnalisis>,
): Confidence {
  const conf = escala.confianza as Record<string, unknown>
  const penalizaciones = (conf.penalizaciones || {}) as Record<string, number>

  if (admissibility.outcome === 'no_admisible') {
    return {
      score: 1.0,
      band: 'alto',
      supervision: 'confirmacion',
      supervisionScope: 'confirmacion',
      reasons: ['Resuelto por regla de admisibilidad'],
    }
  }

  let score = 1.0
  const reasons: string[] = []

  if (insumoTruncado(entrada, meta)) {
    score -= Number(penalizaciones.truncado ?? 0.25)
    reasons.push('Conjunto de diferencias truncado')
  }

  const tarea = meta.tareaCorresponde
  if (tarea === false || tarea == null) {
    score -= Number(penalizaciones.tarea_no_corresponde ?? 0.25)
    if (tarea === false) {
      reasons.push('La tarea vinculada no corresponde con la entrega')
    } else {
      reasons.push('No se pudo comprobar la correspondencia con la tarea')
    }
  }

  const ratio = ratioEvidenciaInsuficiente(criterios)
  const umbral = Number(conf.umbral_evidencia_insuficiente ?? 0.3)
  if (ratio > umbral) {
    score -= Number(penalizaciones.evidencia_insuficiente_excesiva ?? 0.2)
    reasons.push(
      `Proporcion de evidencia insuficiente (${ratio.toFixed(2)}) supera el umbral`,
    )
  }

  if (meta.dependeInformacionExterna) {
    score -= Number(penalizaciones.dependencia_externa ?? 0.4)
    const motivo =
      meta.motivoDependencia || 'dependencia de informacion externa'
    reasons.push(String(sanitizarTextoModelo(String(motivo)) || motivo))
  }

  if (meta.modoEjecucion === 'simulado') {
    score -= Number(penalizaciones.simulado ?? 0.15)
    reasons.push('Ejecucion simulada')
  }

  score = Math.max(0.0, Math.min(1.0, score))
  const umbralAlto = Number(conf.alto ?? 0.9)
  const umbralMedio = Number(conf.medio ?? 0.7)
  let band: Confidence['band']
  if (score >= umbralAlto) band = 'alto'
  else if (score >= umbralMedio) band = 'medio'
  else band = 'bajo'

  const supervision =
    band === 'alto' ? 'confirmacion' : 'revision_detallada'

  return {
    score: Math.round(score * 10000) / 10000,
    band,
    supervision,
    supervisionScope: SUPERVISION_SCOPE[band],
    reasons,
  }
}

function soloRazonesTareaNoVerificable(reasons: string[]): boolean {
  if (!reasons.length) return false
  return reasons.every((r) => RAZONES_TAREA_NO_VERIFICABLE.has(r))
}

function justificacion(
  porCodigo: Record<string, Criterio>,
  codes: string[],
): string {
  const partes: string[] = []
  for (const code of codes) {
    const c = porCodigo[code] || ({} as Criterio)
    const ev = sanitizarTextoModelo(String(c.evidence || '')) || ''
    partes.push(`${code}: ${ev}`.trim())
  }
  return partes.join('; ')
}

function recomendacionAjustarMonto(
  porCodigo: Record<string, Criterio>,
  reward: Reward,
): Recommendation {
  const mismatch = Boolean(reward.levelMismatch)
  const cr022 = porCodigo['CR-022'] || ({} as Criterio)
  const cr023 = porCodigo['CR-023'] || ({} as Criterio)
  const codes: string[] = []
  if (mismatch || cr022.level === 'no_cumple') codes.push('CR-022')
  if (cr023.level === 'no_cumple') codes.push('CR-023')
  const just = codes.length
    ? justificacion(porCodigo, codes)
    : 'Desajuste de nivel de monto'
  return {
    value: 'ajustar_monto',
    supportingCriteria: codes,
    justification: just,
  }
}

export function agregarRecomendacion(
  admissibility: Admisibilidad,
  criterios: Criterio[],
  reward: Reward,
  confidence: Confidence,
  meta: Partial<MetaAnalisis>,
): Recommendation {
  const porCodigo: Record<string, Criterio> = {}
  for (const c of criterios) porCodigo[c.code] = c

  if (admissibility.outcome === 'no_admisible') {
    const stopped = admissibility.stoppedAt || 'CA'
    return {
      value: 'rechazar',
      supportingCriteria: [stopped],
      justification: `Admisibilidad no superada en ${stopped}`,
    }
  }

  if (meta.dependeInformacionExterna) {
    const motivo =
      meta.motivoDependencia || 'Depende de informacion externa'
    const just = sanitizarTextoModelo(String(motivo)) || String(motivo)
    return {
      value: 'derivar_revision_humana',
      supportingCriteria: [],
      justification: just,
    }
  }

  const altasNo: string[] = []
  const severidad = escala.severidad as Record<string, string>
  for (const [codigo, c] of Object.entries(porCodigo)) {
    if (codigo === 'CR-012') continue
    if (c.level !== 'no_cumple') continue
    if (severidad[codigo] === 'alta') altasNo.push(codigo)
  }
  if (altasNo.length) {
    return {
      value: 'rechazar',
      supportingCriteria: altasNo,
      justification: justificacion(porCodigo, altasNo),
    }
  }

  const mismatch = Boolean(reward.levelMismatch)
  const umbralInsuf = Number(
    (escala.confianza as { umbral_evidencia_insuficiente?: number })
      .umbral_evidencia_insuficiente ?? 0.3,
  )
  const ratioInsuf = ratioEvidenciaInsuficiente(criterios)

  if (confidence.band === 'bajo') {
    const reasons = [...(confidence.reasons || [])]
    if (
      mismatch &&
      meta.tareaCorresponde == null &&
      soloRazonesTareaNoVerificable(reasons) &&
      ratioInsuf < umbralInsuf
    ) {
      return recomendacionAjustarMonto(porCodigo, reward)
    }
    return {
      value: 'derivar_revision_humana',
      supportingCriteria: [],
      justification: reasons.length ? reasons.join('; ') : 'Confianza baja',
    }
  }

  const cr022 = porCodigo['CR-022'] || ({} as Criterio)
  const cr023 = porCodigo['CR-023'] || ({} as Criterio)
  if (
    mismatch ||
    cr022.level === 'no_cumple' ||
    cr023.level === 'no_cumple'
  ) {
    return recomendacionAjustarMonto(porCodigo, reward)
  }

  return {
    value: 'aprobar',
    supportingCriteria: [],
    justification: 'Ningun criterio de rechazo o ajuste aplicable',
  }
}

export function agregarPrioridad(criterios: Criterio[]): Priority {
  const pesos = escala.pesos_severidad as Record<string, number>
  const severidad = escala.severidad as Record<string, string>
  const unmet = criterios.filter((c) => NIVELES_NO_SATISFECHOS.has(c.level))
  if (!unmet.length) {
    return { score: 0, unmetCount: 0, highestSeverity: 'baja' }
  }

  let score = 0
  let highest: Severidad = 'baja'
  let highestRank = 0
  for (const c of unmet) {
    const sev = (severidad[c.code] || 'baja') as Severidad
    score += Number(pesos[sev] ?? 1)
    const rank = ORDEN_SEVERIDAD[sev] ?? 1
    if (rank > highestRank) {
      highestRank = rank
      highest = sev
    }
  }
  return { score, unmetCount: unmet.length, highestSeverity: highest }
}

export function agregarLimits(
  admissibility: Admisibilidad,
  entrada: Entrada,
  meta: Partial<MetaAnalisis>,
): string[] {
  const limits = [
    'CA-005 no verificable con el insumo disponible',
    'Contenido de los comentarios de revision no disponible',
  ]
  if (insumoTruncado(entrada, meta)) {
    limits.push('Conjunto de diferencias truncado')
  }
  if (meta.dependeInformacionExterna) {
    const motivo =
      meta.motivoDependencia || 'Dependencia de informacion externa'
    limits.push(String(sanitizarTextoModelo(String(motivo)) || motivo))
  }
  if (admissibility.outcome === 'no_admisible') {
    const stopped = admissibility.stoppedAt || 'condicion de admisibilidad'
    limits.push(
      `Analisis detenido en ${stopped}; los 23 criterios quedan en evidencia insuficiente`,
    )
  }
  if (meta.modoEjecucion === 'simulado') {
    limits.push(
      'Analisis simulado con reglas heuristicas, no con el modelo de lenguaje',
    )
  }
  const monto = entrada.requested_amount
  if (monto != null && escala.niveles.length) {
    const minimoEscala = Math.min(...escala.niveles.map((n) => n.minimo))
    let montoInt: number | null
    try {
      montoInt = Math.trunc(Number(monto))
      if (Number.isNaN(montoInt)) montoInt = null
    } catch {
      montoInt = null
    }
    if (montoInt != null && montoInt < minimoEscala) {
      limits.push(
        `Monto solicitado (${montoInt}) por debajo del minimo de la escala ` +
          `(${minimoEscala})`,
      )
    }
  }
  return limits
}

export function agregar(
  admissibility: Admisibilidad,
  _clasificacion: unknown,
  criterios: Criterio[],
  entrada: Entrada,
  meta: Partial<MetaAnalisis> = {},
) {
  const dimensions = agregarDimensiones(criterios)
  const reward = agregarReward(entrada.requested_amount, meta)
  const confidence = agregarConfianza(admissibility, criterios, entrada, meta)
  const recommendation = agregarRecomendacion(
    admissibility,
    criterios,
    reward,
    confidence,
    meta,
  )
  const priority = agregarPrioridad(criterios)
  const limits = agregarLimits(admissibility, entrada, meta)
  const signals = (meta.automationSignals || []).map(
    (s) => sanitizarTextoModelo(String(s)) || '',
  )

  return {
    dimensions,
    reward,
    confidence,
    recommendation,
    priority,
    limits,
    automationSignals: signals,
  }
}
