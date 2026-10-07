import type {
  CasoRevision,
  Corrida,
  DecisionHumana,
  ItemCorrida,
  ModoEjecucionSalida,
  OrigenCorrida,
} from './types'
import { modoDeSalida } from './modoEjecucion'

/** Id legado; solo para filtrar datos antiguos en localStorage. */
const LEGACY_DEMO_CORRIDA_ID = 'corrida-demo'

const STORAGE_KEY = 'grantfox-corridas-v1'
const TOUR_STEP_KEY = 'grantfox-recorrido-paso'
const MIGRATION_CORRIDA_ID = 'corrida-1'

type CorridaProgress = {
  etapaActual: number
  iniciadaEn?: string
  finalizadaEn?: string
  itemEtapas: Record<string, number>
  decisiones: Record<string, DecisionHumana>
}

type StoredPayload = {
  version: 1
  precomputed: Record<string, CorridaProgress>
  userCorridas: Corrida[]
}

function emptyCorridaProgress(): CorridaProgress {
  return {
    etapaActual: 0,
    itemEtapas: {},
    decisiones: {},
  }
}

function defaultStored(): StoredPayload {
  return {
    version: 1,
    precomputed: {},
    userCorridas: [],
  }
}

function normalizeProgress(raw: Partial<CorridaProgress> | undefined): CorridaProgress {
  return {
    etapaActual: Number(raw?.etapaActual) || 0,
    iniciadaEn: raw?.iniciadaEn,
    finalizadaEn: raw?.finalizadaEn,
    itemEtapas:
      raw?.itemEtapas && typeof raw.itemEtapas === 'object' ? { ...raw.itemEtapas } : {},
    decisiones:
      raw?.decisiones && typeof raw.decisiones === 'object' ? { ...raw.decisiones } : {},
  }
}

function migrateLegacyPayload(parsed: Record<string, unknown>): StoredPayload {
  const precomputed: Record<string, CorridaProgress> = {}

  const legacyPrecomputed = parsed.precomputed
  if (legacyPrecomputed && typeof legacyPrecomputed === 'object') {
    for (const [id, prog] of Object.entries(legacyPrecomputed as Record<string, unknown>)) {
      precomputed[id] = normalizeProgress(prog as Partial<CorridaProgress>)
    }
  }

  if (parsed.demo != null && precomputed[MIGRATION_CORRIDA_ID] === undefined) {
    precomputed[MIGRATION_CORRIDA_ID] = normalizeProgress(parsed.demo as Partial<CorridaProgress>)
  }

  const userCorridas = Array.isArray(parsed.userCorridas)
    ? (parsed.userCorridas as Corrida[]).filter(
        (c) =>
          c?.id !== LEGACY_DEMO_CORRIDA_ID &&
          c?.origen !== 'por_defecto',
      )
    : []

  return {
    version: 1,
    precomputed,
    userCorridas,
  }
}

export function loadStoredCorridas(): StoredPayload {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultStored()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || parsed.version !== 1) return defaultStored()
    return migrateLegacyPayload(parsed)
  } catch {
    return defaultStored()
  }
}

export type PersistCorridasResult =
  | { ok: true; mode: 'localStorage' }
  | { ok: true; mode: 'memoria'; aviso: string }

export function saveStoredCorridas(payload: StoredPayload): PersistCorridasResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    return { ok: true, mode: 'localStorage' }
  } catch {
    return {
      ok: true,
      mode: 'memoria',
      aviso:
        'No se pudo guardar en localStorage. Las corridas quedan solo en memoria hasta recargar la página.',
    }
  }
}

export function isPrecomputedCorrida(c: Corrida): boolean {
  return c.origen === 'por_defecto'
}

/** Corrida precalculada más reciente (recorrido guiado). */
export function pickTourCorrida(corridas: Corrida[]): Corrida | null {
  const pre = corridas.filter(isPrecomputedCorrida)
  if (pre.length === 0) return null
  return [...pre].sort((a, b) => (b.creadaEn || '').localeCompare(a.creadaEn || ''))[0]!
}

export function sortCorridasForInicio(list: Corrida[]): Corrida[] {
  const pre = list.filter(isPrecomputedCorrida)
  const user = list.filter((c) => !isPrecomputedCorrida(c))
  pre.sort((a, b) => (b.creadaEn || '').localeCompare(a.creadaEn || ''))
  user.sort((a, b) => (b.creadaEn || '').localeCompare(a.creadaEn || ''))
  return [...pre, ...user]
}

export function buildPrecomputedCorrida(opts: {
  id: string
  nombre: string
  casos: CasoRevision[]
  generadaEn?: string
  motor?: string
  modelo?: string
  progress?: CorridaProgress
}): Corrida {
  const p = opts.progress ?? emptyCorridaProgress()
  const items: ItemCorrida[] = [...opts.casos]
    .sort((a, b) => b.salida.priority.score - a.salida.priority.score)
    .map((c) => ({
      id: c.entrada.id,
      entrada: c.entrada,
      salida: c.salida,
      etapaAlcanzada: p.itemEtapas[c.entrada.id] ?? (p.etapaActual > 0 ? p.etapaActual : 0),
    }))

  const modos = items.map((i) => (i.salida ? modoDeSalida(i.salida) : 'reglas'))
  const modoEjecucion: ModoEjecucionSalida = modos.every((m) => m === 'real')
    ? 'real'
    : 'reglas'

  const motorPrecomputado =
    opts.motor ??
    (modoEjecucion === 'real' ? 'real' : 'reglas')
  const modeloPrecomputado =
    opts.modelo ?? opts.casos[0]?.salida.model?.name

  return {
    id: opts.id,
    nombre: opts.nombre,
    creadaEn:
      opts.generadaEn ??
      opts.casos[0]?.salida.executedAt ??
      new Date().toISOString(),
    origen: 'por_defecto',
    modoEjecucion,
    items,
    etapaActual: Math.min(5, Math.max(0, p.etapaActual)),
    iniciadaEn: p.iniciadaEn,
    finalizadaEn: p.finalizadaEn,
    decisiones: { ...p.decisiones },
    motorPrecomputado,
    modeloPrecomputado,
  }
}

export function corridaToProgress(c: Corrida): CorridaProgress {
  const itemEtapas: Record<string, number> = {}
  for (const it of c.items) {
    itemEtapas[it.id] = it.etapaAlcanzada
  }
  return {
    etapaActual: c.etapaActual,
    iniciadaEn: c.iniciadaEn,
    finalizadaEn: c.finalizadaEn,
    itemEtapas,
    decisiones: { ...(c.decisiones ?? {}) },
  }
}

export function resetCorridaProgress(): CorridaProgress {
  return emptyCorridaProgress()
}

export function etiquetaMotorPrecomputado(motor: string | undefined, modelo?: string): string {
  if (motor === 'real') {
    if (modelo === 'claude-sonnet-5-5') return 'Claude Sonnet 5.5'
    if (modelo) return modelo
    return 'Modelo'
  }
  return 'Motor de reglas'
}

export function newCorridaId(): string {
  return `corrida-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function defaultCorridaNombre(date = new Date()): string {
  const fecha = new Intl.DateTimeFormat('es-CR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  return `Corrida ${fecha}`
}

export function createUserCorrida(opts: {
  nombre: string
  origen: Exclude<OrigenCorrida, 'por_defecto'>
  items: ItemCorrida[]
  modoEjecucion?: ModoEjecucionSalida
}): Corrida {
  return {
    id: newCorridaId(),
    nombre: opts.nombre.trim() || defaultCorridaNombre(),
    creadaEn: new Date().toISOString(),
    origen: opts.origen,
    modoEjecucion: opts.modoEjecucion ?? 'reglas',
    items: opts.items.map((i) => ({
      ...i,
      etapaAlcanzada: 0,
    })),
    etapaActual: 0,
    decisiones: {},
  }
}

export function persistSnapshot(corridas: Corrida[]): PersistCorridasResult {
  const precomputed: Record<string, CorridaProgress> = {}
  for (const c of corridas) {
    if (isPrecomputedCorrida(c)) {
      precomputed[c.id] = corridaToProgress(c)
    }
  }
  const userCorridas = corridas.filter((c) => !isPrecomputedCorrida(c))
  const payload: StoredPayload = {
    version: 1,
    precomputed,
    userCorridas,
  }
  return saveStoredCorridas(payload)
}

export function loadTourStep(): number {
  try {
    const raw = localStorage.getItem(TOUR_STEP_KEY)
    if (!raw) return 0
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 0) return 0
    return n
  } catch {
    return 0
  }
}

export function saveTourStep(step: number) {
  try {
    localStorage.setItem(TOUR_STEP_KEY, String(step))
  } catch {
    /* ignore */
  }
}

export function origenLabel(o: OrigenCorrida): string {
  if (o === 'por_defecto') return 'Por defecto'
  if (o === 'enlaces') return 'Enlaces'
  return 'Archivo'
}

export function formatFechaCorta(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-CR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
