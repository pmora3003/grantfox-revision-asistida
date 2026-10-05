import type {
  Admisibilidad,
  Confidence,
  Criterio,
  DimensionNombre,
  DimensionValoracion,
  Entrada,
  Fundamento,
  Priority,
  Recommendation,
  Reward,
  Severidad,
} from '../types.ts'
import {
  escala,
  fuenteDeCondicion,
  marcoDeCriterio,
  nivelParaMonto,
  normalizarModoEjecucion,
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
const ETIQUETA_NIVEL: Record<string, string> = {
  cumple: 'cumple',
  cumple_parcialmente: 'cumple parcialmente',
  no_cumple: 'no cumple',
  evidencia_insuficiente: 'evidencia insuficiente',
  no_verificable: 'no verificable',
}
const RESUMEN_APROBAR_ORDEN: [string, string, number][] = [
  ['cumplimiento_alcance', 'Alcance', 5],
  ['calidad_tecnica', 'calidad técnica', 7],
  ['riesgos_seguridad', 'seguridad', 6],
  ['proporcionalidad', 'proporcionalidad', 5],
]

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

function anotarCriterio(c: Criterio): Criterio {
  const entrada = marcoDeCriterio(c.code)
  return {
    ...c,
    marco: entrada.marco,
    marcoUrl: entrada.url,
  }
}

export function criteriosInsuficientes(evidencia: string): Criterio[] {
  const salida: Criterio[] = []
  for (const dimension of DIMENSIONES) {
    for (const codigo of CODIGOS_POR_DIMENSION[dimension]) {
      salida.push(
        anotarCriterio({
          code: codigo,
          dimension,
          level: 'evidencia_insuficiente',
          evidence: evidencia,
          file: null,
          fragment: null,
          line: null,
        }),
      )
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
    salida.push(anotarCriterio(c))
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

function bandaConfianza(
  score: number,
  conf: Record<string, unknown>,
): Confidence['band'] {
  const umbralAlto = Number(conf.alto_desde ?? 0.85)
  const umbralMedio = Number(conf.medio_desde ?? 0.6)
  if (score >= umbralAlto) return 'alto'
  if (score >= umbralMedio) return 'medio'
  return 'bajo'
}

function esModoReglas(meta: Partial<MetaAnalisis>): boolean {
  return normalizarModoEjecucion(meta.modoEjecucion ?? null) === 'reglas'
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
      `Proporción de evidencia insuficiente (${ratio.toFixed(2)}) supera el umbral`,
    )
  }

  if (meta.dependeInformacionExterna) {
    score -= Number(penalizaciones.dependencia_externa ?? 0.4)
    const motivo =
      meta.motivoDependencia || 'dependencia de información externa'
    reasons.push(String(sanitizarTextoModelo(String(motivo)) || motivo))
  }

  if (esModoReglas(meta)) {
    score -= Number(penalizaciones.reglas ?? penalizaciones.simulado ?? 0.2)
    reasons.push('Análisis con motor de reglas, sin modelo de lenguaje')
  }

  score = Math.max(0.0, Math.min(1.0, score))
  const band = bandaConfianza(score, conf)

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

function evidenciaCorta(texto: string, maxLen = 200): string {
  const limpio = (sanitizarTextoModelo(texto) || texto).replace(/\s+/g, ' ').trim()
  if (limpio.length <= maxLen) return limpio
  return limpio.slice(0, maxLen - 1).replace(/\s+$/, '') + '...'
}

function fundamentoDeCriterio(c: Criterio): Fundamento {
  const marco = c.marco || marcoDeCriterio(c.code).marco
  return {
    code: c.code,
    nivel: c.level,
    marco,
    evidencia: evidenciaCorta(c.evidence || ''),
  }
}

function fundamentoDeCa(
  code: string,
  admissibility: Admisibilidad,
): Fundamento {
  const condicion = (admissibility.conditions || []).find((c) => c.code === code)
  let fuente = condicion?.fuente || ''
  let evidencia = condicion?.observed || ''
  let nivel = condicion?.result || 'no_cumple'
  if (!fuente) fuente = fuenteDeCondicion(code).marco
  return {
    code,
    nivel,
    marco: fuente,
    evidencia: evidenciaCorta(evidencia),
  }
}

function nCumplenDesdeAssessment(assessment: string): number {
  const m = /^(\d+) cumplen/.exec((assessment || '').trim())
  return m ? Number(m[1]) : 0
}

function fraseCriterio(c: Criterio): string {
  const nivel = ETIQUETA_NIVEL[c.level] || c.level
  const marco = c.marco || marcoDeCriterio(c.code).marco
  const evidencia = evidenciaCorta(c.evidence || '')
  if (marco) return `${c.code} ${nivel} (${marco}): ${evidencia}`
  return `${c.code} ${nivel}: ${evidencia}`
}

function justificacionParrafo(
  value: Recommendation['value'],
  codes: string[],
  porCodigo: Record<string, Criterio>,
  admissibility: Admisibilidad,
  dimensions: DimensionValoracion[] | null | undefined,
  meta: Partial<MetaAnalisis>,
  confidence: Confidence,
  reward?: Reward | null,
): string {
  if (value === 'rechazar' && admissibility.outcome === 'no_admisible') {
    const stopped = admissibility.stoppedAt || 'CA'
    const fund = fundamentoDeCa(stopped, admissibility)
    if (fund.marco) {
      return (
        `Se recomienda rechazar. Admisibilidad no superada en ${stopped} ` +
        `(${fund.marco}): ${fund.evidencia}.`
      )
    }
    return (
      `Se recomienda rechazar. Admisibilidad no superada en ${stopped}: ` +
      `${fund.evidencia}.`
    )
  }

  if (value === 'derivar_revision_humana' && meta.dependeInformacionExterna) {
    const motivo =
      meta.motivoDependencia || 'Depende de información externa'
    const just = sanitizarTextoModelo(String(motivo)) || String(motivo)
    return (
      'Se recomienda derivar a revisión humana. ' +
      'Cláusulas 4B.2 y 13.4 de los Términos y Condiciones exigen revisión ' +
      `humana previa: ${just}.`
    )
  }

  if (value === 'derivar_revision_humana') {
    const reasons = [...(confidence.reasons || [])]
    const detalle = reasons.length ? reasons.join('; ') : 'Confianza baja'
    return (
      'Se recomienda derivar a revisión humana. ' +
      'Cláusulas 4B.2 y 13.4 de los Términos y Condiciones exigen revisión ' +
      `humana previa: ${detalle}.`
    )
  }

  if (value === 'aprobar') {
    const porDim: Record<string, DimensionValoracion> = {}
    for (const d of dimensions || []) {
      porDim[d.dimension] = d
    }
    const partes: string[] = []
    RESUMEN_APROBAR_ORDEN.forEach(([dimKey, etiqueta, total], idx) => {
      const assessment = porDim[dimKey]?.assessment || ''
      const nOk = nCumplenDesdeAssessment(assessment)
      if (idx === 0) {
        partes.push(`${etiqueta}: ${nOk} de ${total} cumplen`)
      } else {
        partes.push(`${etiqueta}: ${nOk} de ${total}`)
      }
    })
    const resumen = partes.join('; ')
    const rw = reward || ({} as Reward)
    const monto = Math.trunc(Number(rw.requestedAmount || 0))
    const nivel = rw.requestedLevel || rw.suggestedLevel || 'bajo'
    const lineaReward =
      `Monto solicitado ${monto} USDC, nivel ${nivel}, ` +
      'coincide con el nivel sugerido.'
    return (
      'Se recomienda aprobar. Ningún criterio de severidad alta queda sin cumplir. ' +
      `${resumen}. ${lineaReward}`
    )
  }

  const verbos: Record<string, string> = {
    rechazar: 'Se recomienda rechazar',
    ajustar_monto: 'Se recomienda ajustar el monto',
  }
  const cabecera = verbos[value] || `Se recomienda ${value}`
  const frases = codes
    .filter((c) => porCodigo[c])
    .map((c) => fraseCriterio(porCodigo[c]!))
  if (!frases.length) return `${cabecera}.`
  return `${cabecera}. ${frases.join('. ')}.`
}

function recomendacionConFundamentos(
  value: Recommendation['value'],
  codes: string[],
  porCodigo: Record<string, Criterio>,
  admissibility: Admisibilidad,
  dimensions: DimensionValoracion[] | null | undefined,
  meta: Partial<MetaAnalisis>,
  confidence: Confidence,
  reward?: Reward | null,
): Recommendation {
  let fundamentos: Fundamento[] = []
  if (admissibility.outcome === 'no_admisible' && codes.length) {
    fundamentos = [fundamentoDeCa(codes[0]!, admissibility)]
  } else {
    for (const code of codes) {
      const c = porCodigo[code]
      if (c) fundamentos.push(fundamentoDeCriterio(c))
    }
  }
  return {
    value,
    supportingCriteria: codes,
    justification: justificacionParrafo(
      value,
      codes,
      porCodigo,
      admissibility,
      dimensions,
      meta,
      confidence,
      reward,
    ),
    fundamentos,
  }
}

function recomendacionAjustarMonto(
  porCodigo: Record<string, Criterio>,
  reward: Reward,
  admissibility: Admisibilidad,
  dimensions: DimensionValoracion[] | null | undefined,
  meta: Partial<MetaAnalisis>,
  confidence: Confidence,
): Recommendation {
  const mismatch = Boolean(reward.levelMismatch)
  const cr022 = porCodigo['CR-022'] || ({} as Criterio)
  const cr023 = porCodigo['CR-023'] || ({} as Criterio)
  const codes: string[] = []
  if (mismatch || cr022.level === 'no_cumple') codes.push('CR-022')
  if (cr023.level === 'no_cumple') codes.push('CR-023')
  if (!codes.length) codes.push('CR-022')
  return recomendacionConFundamentos(
    'ajustar_monto',
    codes,
    porCodigo,
    admissibility,
    dimensions,
    meta,
    confidence,
    reward,
  )
}

export function agregarRecomendacion(
  admissibility: Admisibilidad,
  criterios: Criterio[],
  reward: Reward,
  confidence: Confidence,
  meta: Partial<MetaAnalisis>,
  dimensions?: DimensionValoracion[] | null,
): Recommendation {
  const porCodigo: Record<string, Criterio> = {}
  for (const c of criterios) porCodigo[c.code] = c

  if (admissibility.outcome === 'no_admisible') {
    const stopped = admissibility.stoppedAt || 'CA'
    return recomendacionConFundamentos(
      'rechazar',
      [stopped],
      porCodigo,
      admissibility,
      dimensions,
      meta,
      confidence,
      reward,
    )
  }

  if (meta.dependeInformacionExterna) {
    return recomendacionConFundamentos(
      'derivar_revision_humana',
      [],
      porCodigo,
      admissibility,
      dimensions,
      meta,
      confidence,
      reward,
    )
  }

  const altasNo: string[] = []
  const severidad = escala.severidad as Record<string, string>
  for (const [codigo, c] of Object.entries(porCodigo)) {
    if (codigo === 'CR-012') continue
    if (c.level !== 'no_cumple') continue
    if (severidad[codigo] === 'alta') altasNo.push(codigo)
  }
  if (altasNo.length) {
    return recomendacionConFundamentos(
      'rechazar',
      altasNo,
      porCodigo,
      admissibility,
      dimensions,
      meta,
      confidence,
      reward,
    )
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
      return recomendacionAjustarMonto(
        porCodigo,
        reward,
        admissibility,
        dimensions,
        meta,
        confidence,
      )
    }
    return recomendacionConFundamentos(
      'derivar_revision_humana',
      [],
      porCodigo,
      admissibility,
      dimensions,
      meta,
      confidence,
      reward,
    )
  }

  const cr022 = porCodigo['CR-022'] || ({} as Criterio)
  const cr023 = porCodigo['CR-023'] || ({} as Criterio)
  if (
    mismatch ||
    cr022.level === 'no_cumple' ||
    cr023.level === 'no_cumple'
  ) {
    return recomendacionAjustarMonto(
      porCodigo,
      reward,
      admissibility,
      dimensions,
      meta,
      confidence,
    )
  }

  return recomendacionConFundamentos(
    'aprobar',
    [],
    porCodigo,
    admissibility,
    dimensions,
    meta,
    confidence,
    reward,
  )
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
    'Contenido de los comentarios de revisión no disponible',
  ]
  if (insumoTruncado(entrada, meta)) {
    limits.push('Conjunto de diferencias truncado')
  }
  if (meta.dependeInformacionExterna) {
    const motivo =
      meta.motivoDependencia || 'Dependencia de información externa'
    limits.push(String(sanitizarTextoModelo(String(motivo)) || motivo))
  }
  if (admissibility.outcome === 'no_admisible') {
    const stopped = admissibility.stoppedAt || 'condición de admisibilidad'
    limits.push(
      `Análisis detenido en ${stopped}; los 23 criterios quedan en evidencia insuficiente`,
    )
  }
  if (esModoReglas(meta)) {
    limits.push(
      'Análisis con motor de reglas deterministas; no usa el modelo de lenguaje',
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
        `Monto solicitado (${montoInt}) por debajo del mínimo de la escala ` +
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
  const metaNorm: Partial<MetaAnalisis> = { ...meta }
  const modo = normalizarModoEjecucion(metaNorm.modoEjecucion ?? null)
  if (modo != null) metaNorm.modoEjecucion = modo

  const criteriosAnotados = criterios.map(anotarCriterio)
  const dimensions = agregarDimensiones(criteriosAnotados)
  const reward = agregarReward(entrada.requested_amount, metaNorm)
  const confidence = agregarConfianza(
    admissibility,
    criteriosAnotados,
    entrada,
    metaNorm,
  )
  const recommendation = agregarRecomendacion(
    admissibility,
    criteriosAnotados,
    reward,
    confidence,
    metaNorm,
    dimensions,
  )
  const priority = agregarPrioridad(criteriosAnotados)
  const limits = agregarLimits(admissibility, entrada, metaNorm)
  const signals = (metaNorm.automationSignals || []).map(
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
    criteria: criteriosAnotados,
  }
}
