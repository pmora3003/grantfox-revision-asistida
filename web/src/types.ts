export type NivelAceptacion =
  | 'cumple'
  | 'cumple_parcialmente'
  | 'no_cumple'
  | 'evidencia_insuficiente'

export type DimensionNombre =
  | 'cumplimiento_alcance'
  | 'calidad_tecnica'
  | 'riesgos_seguridad'
  | 'proporcionalidad'

export type NivelRecompensa = 'bajo' | 'medio' | 'alto' | 'spike'

export type RecomendacionValor =
  | 'aprobar'
  | 'rechazar'
  | 'ajustar_monto'
  | 'derivar_revision_humana'

export type BandaConfianza = 'alto' | 'medio' | 'bajo'
export type Supervision = 'confirmacion' | 'revision_detallada'
export type SupervisionScope =
  | 'confirmacion'
  | 'criterios_no_satisfechos'
  | 'analisis_completo'
export type Severidad = 'alta' | 'media' | 'baja'
export type ResultadoCA = 'cumple' | 'no_cumple' | 'no_verificable'
export type OutcomeAdmisibilidad = 'admisible' | 'no_admisible'

export interface FileStat {
  path: string
  additions: number
  deletions: number
}

export interface EntradaContext {
  prUrl?: string
  headSha?: string
  title?: string
  body?: string
  merged?: boolean
  state?: string
  linkedIssueTitle?: string
  linkedIssueBody?: string
  diff?: string
  truncated?: boolean
  fileStats?: FileStat[]
  ciConclusion?: 'success' | 'failure' | 'unknown'
  reviewCommentCount?: number
}

export interface Entrada {
  id: string
  context: EntradaContext
  requested_amount?: number
}

export interface ModeloInfo {
  name: string
  version: string
}

export interface CondicionAdmisibilidad {
  code: string
  result: ResultadoCA
  observed: string
  fuente?: string
  fuenteUrl?: string | null
}

export interface Admisibilidad {
  outcome: OutcomeAdmisibilidad
  stoppedAt: string | null
  conditions: CondicionAdmisibilidad[]
  version?: string | null
}

export interface ByType {
  codigo: number
  pruebas: number
  documentacion: number
  generado: number
  configuracion: number
}

export interface RealVolume {
  files: number
  additions: number
  deletions: number
}

export interface ArchivoClasificado {
  path: string
  tipo: string
}

export interface FileClassification {
  byType: ByType
  realVolume: RealVolume
  excludedFromVolume: string[]
  porArchivo?: ArchivoClasificado[] | null
}

export interface Criterio {
  code: string
  dimension: DimensionNombre
  level: NivelAceptacion
  evidence: string
  file?: string | null
  fragment?: string | null
  line?: number | null
  marco?: string
  marcoUrl?: string | null
}

export interface DimensionValoracion {
  dimension: DimensionNombre
  assessment: string
  unmetCriteria: string[]
}

export interface Reward {
  requestedAmount: number
  requestedLevel: NivelRecompensa | null
  suggestedLevel: NivelRecompensa | null
  suggestedAmount: number
  levelMismatch: boolean
}

export interface Fundamento {
  code: string
  nivel: string
  marco: string
  evidencia: string
}

export interface Recommendation {
  value: RecomendacionValor
  supportingCriteria: string[]
  justification: string
  fundamentos?: Fundamento[]
}

export interface Confidence {
  score: number
  band: BandaConfianza
  supervision: Supervision
  supervisionScope?: SupervisionScope
  reasons: string[]
}

export interface Priority {
  score: number
  unmetCount: number
  highestSeverity: Severidad
}

export interface Execution {
  durationMs: number
  truncatedInput: boolean
  instructionHash?: string
  entradaHash?: string
}

export type ModoEjecucionSalida = 'real' | 'reglas' | 'simulado'

export interface Salida {
  contributionId: string
  executedAt: string
  model: ModeloInfo
  modoEjecucion?: ModoEjecucionSalida
  instructionVersion: string
  headSha?: string | null
  admissibility: Admisibilidad
  fileClassification: FileClassification
  criteria: Criterio[]
  dimensions: DimensionValoracion[]
  reward: Reward
  recommendation: Recommendation
  confidence: Confidence
  priority: Priority
  automationSignals: string[]
  limits: string[]
  execution: Execution
}

export interface CasoRevision {
  entrada: Entrada
  salida: Salida
}

/** Origen del ítem en la cola de revisión. */
export type FuenteCaso = 'por_defecto' | 'enlace' | 'archivo'

/**
 * Ítem de la cola. `salida` puede ser null hasta que se ejecute el paso 2
 * (cálculo bajo demanda con `procesarEntrada` en el navegador).
 */
export interface ItemCola {
  entrada: Entrada
  salida: Salida | null
  fuente: FuenteCaso
  /** true = hay que calcular salida la primera vez que se necesita. */
  pendienteCalculo: boolean
}

export type DecisionFinal = RecomendacionValor

export interface DecisionHumana {
  contributionId: string
  /** Corrida a la que pertenece la decisión (si aplica). */
  corridaId?: string
  reviewerCode: string
  finalDecision: DecisionFinal
  approvedAmount: number
  justification: string
  requestedAmount: number
  recommendation: RecomendacionValor
  matchesRecommendation: boolean
  savedAt: string
}

/** Origen de una corrida (lote de PR). */
export type OrigenCorrida = 'por_defecto' | 'enlaces' | 'archivo'

/**
 * Ítem dentro de una corrida.
 * `salida` precalculada (demo) o calculada al iniciar (corridas de usuario).
 */
export interface ItemCorrida {
  id: string
  entrada: Entrada
  salida?: Salida | null
  /** Etapa de lote alcanzada por este PR (0 = sin iniciar, 5 = completada). */
  etapaAlcanzada: number
}

/**
 * Corrida (lote) de revisión asistida.
 * `etapaActual`: 0 = sin iniciar … 5 = completada.
 */
export interface Corrida {
  id: string
  nombre: string
  creadaEn: string
  origen: OrigenCorrida
  modoEjecucion: ModoEjecucionSalida
  items: ItemCorrida[]
  etapaActual: number
  iniciadaEn?: string
  finalizadaEn?: string
  /** Decisiones humanas indexadas por contributionId. */
  decisiones?: Record<string, DecisionHumana>
}

export const DIMENSION_ORDER: DimensionNombre[] = [
  'cumplimiento_alcance',
  'calidad_tecnica',
  'riesgos_seguridad',
  'proporcionalidad',
]

export const CRITERION_DIMENSION: Record<string, DimensionNombre> = {
  'CR-001': 'cumplimiento_alcance',
  'CR-002': 'cumplimiento_alcance',
  'CR-003': 'cumplimiento_alcance',
  'CR-004': 'cumplimiento_alcance',
  'CR-005': 'cumplimiento_alcance',
  'CR-006': 'calidad_tecnica',
  'CR-007': 'calidad_tecnica',
  'CR-008': 'calidad_tecnica',
  'CR-009': 'calidad_tecnica',
  'CR-010': 'calidad_tecnica',
  'CR-011': 'calidad_tecnica',
  'CR-012': 'calidad_tecnica',
  'CR-013': 'riesgos_seguridad',
  'CR-014': 'riesgos_seguridad',
  'CR-015': 'riesgos_seguridad',
  'CR-016': 'riesgos_seguridad',
  'CR-017': 'riesgos_seguridad',
  'CR-018': 'riesgos_seguridad',
  'CR-019': 'proporcionalidad',
  'CR-020': 'proporcionalidad',
  'CR-021': 'proporcionalidad',
  'CR-022': 'proporcionalidad',
  'CR-023': 'proporcionalidad',
}
