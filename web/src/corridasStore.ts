import type {
  CasoRevision,
  Corrida,
  DecisionHumana,
  ItemCorrida,
  ModoEjecucionSalida,
  OrigenCorrida,
} from './types'
import { modoDeSalida } from './modoEjecucion'

export const DEMO_CORRIDA_ID = 'corrida-demo'
export const DEMO_CORRIDA_NOMBRE = 'Corrida de demostración'

const STORAGE_KEY = 'grantfox-corridas-v1'
const TOUR_STEP_KEY = 'grantfox-recorrido-paso'

type DemoProgress = {
  etapaActual: number
  iniciadaEn?: string
  finalizadaEn?: string
  itemEtapas: Record<string, number>
  decisiones: Record<string, DecisionHumana>
}

type StoredPayload = {
  version: 1
  demo: DemoProgress
  userCorridas: Corrida[]
}

function emptyDemoProgress(): DemoProgress {
  return {
    etapaActual: 0,
    itemEtapas: {},
    decisiones: {},
  }
}

function defaultStored(): StoredPayload {
  return {
    version: 1,
    demo: emptyDemoProgress(),
    userCorridas: [],
  }
}

export function loadStoredCorridas(): StoredPayload {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultStored()
    const parsed = JSON.parse(raw) as StoredPayload
    if (!parsed || parsed.version !== 1) return defaultStored()
    return {
      version: 1,
      demo: {
        etapaActual: Number(parsed.demo?.etapaActual) || 0,
        iniciadaEn: parsed.demo?.iniciadaEn,
        finalizadaEn: parsed.demo?.finalizadaEn,
        itemEtapas:
          parsed.demo?.itemEtapas && typeof parsed.demo.itemEtapas === 'object'
            ? parsed.demo.itemEtapas
            : {},
        decisiones:
          parsed.demo?.decisiones && typeof parsed.demo.decisiones === 'object'
            ? parsed.demo.decisiones
            : {},
      },
      userCorridas: Array.isArray(parsed.userCorridas) ? parsed.userCorridas : [],
    }
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

export function buildDemoCorrida(casos: CasoRevision[], progress?: DemoProgress): Corrida {
  const p = progress ?? emptyDemoProgress()
  const items: ItemCorrida[] = [...casos]
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

  return {
    id: DEMO_CORRIDA_ID,
    nombre: DEMO_CORRIDA_NOMBRE,
    creadaEn: casos[0]?.salida.executedAt ?? new Date().toISOString(),
    origen: 'por_defecto',
    modoEjecucion,
    items,
    etapaActual: Math.min(5, Math.max(0, p.etapaActual)),
    iniciadaEn: p.iniciadaEn,
    finalizadaEn: p.finalizadaEn,
    decisiones: { ...p.decisiones },
  }
}

export function corridaToDemoProgress(c: Corrida): DemoProgress {
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

export function resetDemoProgress(): DemoProgress {
  return emptyDemoProgress()
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
  const demo = corridas.find((c) => c.id === DEMO_CORRIDA_ID)
  const userCorridas = corridas.filter((c) => c.id !== DEMO_CORRIDA_ID)
  const payload: StoredPayload = {
    version: 1,
    demo: demo ? corridaToDemoProgress(demo) : emptyDemoProgress(),
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
  if (o === 'por_defecto') return 'Demostración'
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
