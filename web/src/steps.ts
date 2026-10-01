import type { DimensionNombre } from './types'

export type ManualStepId =
  | 'entrada'
  | 'admisibilidad'
  | 'clasificacion'
  | 'alcance'
  | 'calidad'
  | 'seguridad'
  | 'proporcionalidad'
  | 'agregacion'
  | 'registro'
  | 'decision'

export type ManualStepKind =
  | 'entrada'
  | 'admisibilidad'
  | 'clasificacion'
  | 'dimension'
  | 'agregacion'
  | 'registro'
  | 'decision'

export interface ManualStepDef {
  id: ManualStepId
  displayNum: string
  name: string
  processing: string
  kind: ManualStepKind
  dimension?: DimensionNombre
  omitOnAdmitFail?: boolean
}

export const MANUAL_STEPS: ManualStepDef[] = [
  {
    id: 'entrada',
    displayNum: '1',
    name: 'Entrada normalizada',
    processing: 'Normalizando título, cuerpo, diff y metadatos de la solicitud…',
    kind: 'entrada',
  },
  {
    id: 'admisibilidad',
    displayNum: '2',
    name: 'Admisibilidad',
    processing: 'Verificando condiciones de admisibilidad (CA-001 a CA-005)…',
    kind: 'admisibilidad',
  },
  {
    id: 'clasificacion',
    displayNum: '3',
    name: 'Clasificación de archivos',
    processing: 'Clasificando archivos y calculando volumen real…',
    kind: 'clasificacion',
    omitOnAdmitFail: true,
  },
  {
    id: 'alcance',
    displayNum: '4a',
    name: 'Alcance',
    processing: 'Evaluando criterios de cumplimiento del alcance…',
    kind: 'dimension',
    dimension: 'cumplimiento_alcance',
    omitOnAdmitFail: true,
  },
  {
    id: 'calidad',
    displayNum: '4b',
    name: 'Calidad técnica',
    processing: 'Evaluando criterios de calidad técnica…',
    kind: 'dimension',
    dimension: 'calidad_tecnica',
    omitOnAdmitFail: true,
  },
  {
    id: 'seguridad',
    displayNum: '4c',
    name: 'Seguridad',
    processing: 'Evaluando criterios de riesgos de seguridad…',
    kind: 'dimension',
    dimension: 'riesgos_seguridad',
    omitOnAdmitFail: true,
  },
  {
    id: 'proporcionalidad',
    displayNum: '4d',
    name: 'Proporcionalidad',
    processing: 'Evaluando criterios de proporcionalidad de la recompensa…',
    kind: 'dimension',
    dimension: 'proporcionalidad',
    omitOnAdmitFail: true,
  },
  {
    id: 'agregacion',
    displayNum: '5',
    name: 'Agregación y recomendación',
    processing: 'Agregando resultados, recompensa, confianza y prioridad…',
    kind: 'agregacion',
  },
  {
    id: 'registro',
    displayNum: '6',
    name: 'Registro de la ejecución',
    processing: 'Registrando modelo, versión de instrucción y duración…',
    kind: 'registro',
  },
  {
    id: 'decision',
    displayNum: '7',
    name: 'Decisión humana',
    processing: 'Preparando el formulario de decisión humana…',
    kind: 'decision',
  },
]

export const TOTAL_STEPS = MANUAL_STEPS.length

export type RevealedStepStatus = 'done' | 'omitted'

export interface RevealedStep {
  id: ManualStepId
  status: RevealedStepStatus
}

export type EntryProgressKind = 'pendiente' | 'en_curso' | 'completado'

export interface EntryProgress {
  revealed: RevealedStep[]
}

export function initialProgress(): EntryProgress {
  return { revealed: [{ id: 'entrada', status: 'done' }] }
}

export function stepDef(id: ManualStepId): ManualStepDef {
  const found = MANUAL_STEPS.find((s) => s.id === id)
  if (!found) throw new Error(`Paso desconocido: ${id}`)
  return found
}

export function revealedIds(progress: EntryProgress): Set<ManualStepId> {
  return new Set(progress.revealed.map((r) => r.id))
}

export function nextStep(progress: EntryProgress): ManualStepDef | null {
  const done = revealedIds(progress)
  return MANUAL_STEPS.find((s) => !done.has(s.id)) ?? null
}

export function progressKind(progress: EntryProgress): EntryProgressKind {
  const n = progress.revealed.length
  if (n <= 1) return 'pendiente'
  if (n >= TOTAL_STEPS) return 'completado'
  return 'en_curso'
}

export function hasReachedAgregacion(progress: EntryProgress): boolean {
  return progress.revealed.some((r) => r.id === 'agregacion' && r.status === 'done')
}

export function processingDelayMs(): number {
  return 600 + Math.floor(Math.random() * 301)
}
