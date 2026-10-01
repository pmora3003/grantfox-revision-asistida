import type { EntryProgress, RevealedStep } from './steps'
import type { RecomendacionValor, Salida } from './types'

/** Etapas de lote (batch) de una corrida. */
export interface EtapaCorridaDef {
  num: number
  id: string
  name: string
  shortName: string
  description: string
}

export const ETAPAS_CORRIDA: EtapaCorridaDef[] = [
  {
    num: 1,
    id: 'admisibilidad',
    name: 'Admisibilidad',
    shortName: 'Admisibilidad',
    description: 'Validez del PR: CA-001 a CA-004 por PR; CA-005 no verificable.',
  },
  {
    num: 2,
    id: 'clasificacion',
    name: 'Clasificación de archivos y volumen real',
    shortName: 'Clasificación',
    description: 'Clasificación de archivos y cálculo del volumen real de la entrega.',
  },
  {
    num: 3,
    id: 'dimensiones',
    name: 'Análisis por dimensión',
    shortName: 'Dimensiones',
    description: 'Alcance, calidad, seguridad y proporcionalidad (solo admisibles).',
  },
  {
    num: 4,
    id: 'agregacion',
    name: 'Agregación y recomendación',
    shortName: 'Agregación',
    description: 'Nivel de recompensa, confianza y prioridad.',
  },
  {
    num: 5,
    id: 'cola',
    name: 'Cola de revisión humana',
    shortName: 'Cola humana',
    description: 'Cola ordenada por prioridad y registro de la corrida.',
  },
]

export const TOTAL_ETAPAS = ETAPAS_CORRIDA.length

export function etapaDef(num: number): EtapaCorridaDef | null {
  return ETAPAS_CORRIDA.find((e) => e.num === num) ?? null
}

export function etiquetaEstadoCorrida(etapaActual: number): string {
  if (etapaActual <= 0) return 'Sin iniciar'
  if (etapaActual >= TOTAL_ETAPAS) return 'Completada'
  return `En curso: etapa ${etapaActual} de ${TOTAL_ETAPAS}`
}

export function stageAnimDelayMs(): number {
  return 150 + Math.floor(Math.random() * 101)
}

function isNoAdmisible(salida: Salida | null | undefined): boolean {
  return salida?.admissibility.outcome === 'no_admisible'
}

/**
 * Progreso por PR a partir de la etapa de lote alcanzada.
 * Muestra solo los paneles correspondientes a etapas ya ejecutadas.
 */
export function progressFromEtapa(
  etapa: number,
  salida: Salida | null | undefined,
): EntryProgress {
  const revealed: RevealedStep[] = [{ id: 'entrada', status: 'done' }]
  if (etapa < 1) return { revealed }

  revealed.push({ id: 'admisibilidad', status: 'done' })
  if (etapa < 2) return { revealed }

  const stopped = isNoAdmisible(salida)

  if (stopped) {
    revealed.push(
      { id: 'clasificacion', status: 'omitted' },
      { id: 'alcance', status: 'omitted' },
      { id: 'calidad', status: 'omitted' },
      { id: 'seguridad', status: 'omitted' },
      { id: 'proporcionalidad', status: 'omitted' },
    )
    if (etapa >= 4) {
      revealed.push({ id: 'agregacion', status: 'done' })
    }
    if (etapa >= 5) {
      revealed.push({ id: 'registro', status: 'done' }, { id: 'decision', status: 'done' })
    }
    return { revealed }
  }

  if (etapa >= 2) {
    revealed.push({ id: 'clasificacion', status: 'done' })
  }
  if (etapa >= 3) {
    revealed.push(
      { id: 'alcance', status: 'done' },
      { id: 'calidad', status: 'done' },
      { id: 'seguridad', status: 'done' },
      { id: 'proporcionalidad', status: 'done' },
    )
  }
  if (etapa >= 4) {
    revealed.push({ id: 'agregacion', status: 'done' })
  }
  if (etapa >= 5) {
    revealed.push({ id: 'registro', status: 'done' }, { id: 'decision', status: 'done' })
  }
  return { revealed }
}

export type RecuentoRecomendacion = Record<RecomendacionValor, number>

export function emptyRecuento(): RecuentoRecomendacion {
  return {
    aprobar: 0,
    rechazar: 0,
    ajustar_monto: 0,
    derivar_revision_humana: 0,
  }
}

export function contarRecomendaciones(
  salidas: Array<Salida | null | undefined>,
): RecuentoRecomendacion {
  const c = emptyRecuento()
  for (const s of salidas) {
    if (!s) continue
    if (s.admissibility.outcome !== 'admisible') continue
    c[s.recommendation.value]++
  }
  return c
}

export interface ResumenEtapa {
  titulo: string
  detalle: string
}

export function resumenTrasEtapa(
  etapa: number,
  salidas: Array<Salida | null | undefined>,
): ResumenEtapa | null {
  const total = salidas.length
  const admisibles = salidas.filter((s) => s?.admissibility.outcome === 'admisible')
  const noAdm = salidas.filter((s) => s?.admissibility.outcome === 'no_admisible')

  if (etapa === 1) {
    const porCa: Record<string, number> = {}
    for (const s of noAdm) {
      const code = s?.admissibility.stoppedAt ?? 'desconocido'
      porCa[code] = (porCa[code] ?? 0) + 1
    }
    const partes = Object.entries(porCa)
      .sort((a, b) => b[1] - a[1])
      .map(([code, n]) => `${n} en ${code}`)
    const detiene =
      noAdm.length === 0
        ? 'Ninguno se detiene.'
        : `${noAdm.length} se detienen${partes.length ? `: ${partes.join(', ')}` : ''}.`
    return {
      titulo: `${admisibles.length} de ${total} PR son admisibles.`,
      detalle: detiene,
    }
  }

  if (etapa === 2) {
    const vols = admisibles.map((s) => s!.fileClassification.realVolume)
    const files = vols.reduce((a, v) => a + v.files, 0)
    const adds = vols.reduce((a, v) => a + v.additions, 0)
    return {
      titulo: `Volumen real calculado para ${admisibles.length} PR admisibles.`,
      detalle: `En conjunto: ${files} archivos con volumen real y +${adds} líneas contabilizadas. ${noAdm.length} PR no admisibles quedan fuera.`,
    }
  }

  if (etapa === 3) {
    return {
      titulo: `Análisis por dimensión completado en ${admisibles.length} PR.`,
      detalle:
        'Se valoraron alcance, calidad técnica, riesgos de seguridad y proporcionalidad. Los no admisibles permanecen detenidos.',
    }
  }

  if (etapa === 4) {
    const rec = contarRecomendaciones(salidas)
    const partes = (
      [
        ['aprobar', rec.aprobar],
        ['rechazar', rec.rechazar],
        ['ajustar_monto', rec.ajustar_monto],
        ['derivar_revision_humana', rec.derivar_revision_humana],
      ] as const
    )
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`)
    return {
      titulo: `Recomendación generada para ${admisibles.length} PR admisibles.`,
      detalle: partes.length ? `Distribución: ${partes.join(', ')}.` : 'Sin recomendaciones.',
    }
  }

  if (etapa === 5) {
    return {
      titulo: 'Cola de revisión humana lista.',
      detalle: `${admisibles.length} PR ordenados por prioridad. El registro de la corrida está disponible para descarga.`,
    }
  }

  return null
}

export interface EmbudoCounts {
  recibidos: number
  admisibles: number
  analizados: number
  conRecomendacion: number
}

export function countsEmbudo(
  etapaActual: number,
  salidas: Array<Salida | null | undefined>,
): EmbudoCounts {
  const recibidos = salidas.length
  const admisibles =
    etapaActual >= 1
      ? salidas.filter((s) => s?.admissibility.outcome === 'admisible').length
      : 0
  const analizados = etapaActual >= 3 ? admisibles : 0
  const conRecomendacion = etapaActual >= 4 ? admisibles : 0
  return { recibidos, admisibles, analizados, conRecomendacion }
}
