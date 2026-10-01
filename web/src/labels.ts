import type {
  BandaConfianza,
  DimensionNombre,
  NivelAceptacion,
  NivelRecompensa,
  RecomendacionValor,
  ResultadoCA,
  Supervision,
  SupervisionScope,
} from './types'

export function dimensionLabel(d: DimensionNombre): string {
  const map: Record<DimensionNombre, string> = {
    cumplimiento_alcance: 'Alcance',
    calidad_tecnica: 'Calidad',
    riesgos_seguridad: 'Seguridad',
    proporcionalidad: 'Proporcionalidad',
  }
  return map[d]
}

export function dimensionTitle(d: DimensionNombre): string {
  const map: Record<DimensionNombre, string> = {
    cumplimiento_alcance: 'Cumplimiento del alcance',
    calidad_tecnica: 'Calidad técnica',
    riesgos_seguridad: 'Riesgos de seguridad',
    proporcionalidad: 'Proporcionalidad de la recompensa',
  }
  return map[d]
}

export function recommendationLabel(v: RecomendacionValor): string {
  const map: Record<RecomendacionValor, string> = {
    aprobar: 'Aprobar',
    rechazar: 'Rechazar',
    ajustar_monto: 'Ajustar monto',
    derivar_revision_humana: 'Derivar a revisión humana',
  }
  return map[v]
}

export function levelLabel(l: NivelAceptacion): string {
  const map: Record<NivelAceptacion, string> = {
    cumple: 'Cumple',
    cumple_parcialmente: 'Cumple parcialmente',
    no_cumple: 'No cumple',
    evidencia_insuficiente: 'Evidencia insuficiente',
  }
  return map[l]
}

export function rewardLevelLabel(l: NivelRecompensa | null | undefined): string {
  if (!l) return 'No indicado'
  const map: Record<NivelRecompensa, string> = {
    bajo: 'Bajo',
    medio: 'Medio',
    alto: 'Alto',
    spike: 'Spike',
  }
  return map[l]
}

export function bandLabel(b: BandaConfianza): string {
  const map: Record<BandaConfianza, string> = {
    alto: 'Alto',
    medio: 'Medio',
    bajo: 'Bajo',
  }
  return map[b]
}

export function supervisionLabel(s: Supervision): string {
  const map: Record<Supervision, string> = {
    confirmacion: 'Confirmación',
    revision_detallada: 'Revisión detallada',
  }
  return map[s]
}

export function supervisionScopeLabel(s: SupervisionScope | undefined): string {
  if (!s) return ''
  const map: Record<SupervisionScope, string> = {
    confirmacion: 'Confirmación',
    criterios_no_satisfechos: 'Criterios no satisfechos',
    analisis_completo: 'Análisis completo',
  }
  return map[s]
}

export function caResultLabel(r: ResultadoCA): string {
  const map: Record<ResultadoCA, string> = {
    cumple: 'Cumple',
    no_cumple: 'No cumple',
    no_verificable: 'No verificable',
  }
  return map[r]
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function shortHash(hash: string | undefined, len = 12): string {
  if (!hash) return 'No registrado'
  if (hash.length <= len) return hash
  return `${hash.slice(0, len)}...`
}
