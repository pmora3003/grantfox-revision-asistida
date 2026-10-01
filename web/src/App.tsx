import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CasoRevision, ItemCola } from './types'
import type { EntryProgress, ManualStepId, RevealedStep } from './steps'
import {
  hasReachedAgregacion,
  initialProgress,
  MANUAL_STEPS,
  nextStep,
  processingDelayMs,
  revealedIds,
  stepDef,
} from './steps'
import { procesarEntrada } from './motor'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { ReviewQueue } from './components/ReviewQueue'
import { ResultCard } from './components/ResultCard'
import { StepPipeline } from './components/StepContent'
import { CaseStickyBar, MobileActionBar } from './components/CaseStickyBar'
import { AddContributionsModal } from './components/AddContributionsModal'
import {
  clearAgregados,
  loadAgregados,
  saveAgregados,
} from './colaPersistencia'
import { applyTheme, loadThemePref, saveThemePref, type ThemePref } from './theme'
import './styles.css'

function sortDefaults(cases: CasoRevision[]): CasoRevision[] {
  return [...cases].sort((a, b) => b.salida.priority.score - a.salida.priority.score)
}

function toDefaultItems(cases: CasoRevision[]): ItemCola[] {
  return sortDefaults(cases).map((c) => ({
    entrada: c.entrada,
    salida: c.salida,
    fuente: 'por_defecto' as const,
    pendienteCalculo: false,
  }))
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function admitFailed(item: ItemCola): boolean {
  return item.salida?.admissibility.outcome === 'no_admisible'
}

function applySkipToAgregacion(progress: EntryProgress): EntryProgress {
  const done = revealedIds(progress)
  const added: RevealedStep[] = []
  for (const s of MANUAL_STEPS) {
    if (done.has(s.id)) continue
    if (s.omitOnAdmitFail) {
      added.push({ id: s.id, status: 'omitted' })
    } else if (s.id === 'agregacion') {
      added.push({ id: s.id, status: 'done' })
      break
    }
  }
  return { revealed: [...progress.revealed, ...added] }
}

export default function App() {
  const [items, setItems] = useState<ItemCola[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [progressById, setProgressById] = useState<Record<string, EntryProgress>>({})
  const [processingId, setProcessingId] = useState<ManualStepId | null>(null)
  const [processingText, setProcessingText] = useState('')
  const [busy, setBusy] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [persistAviso, setPersistAviso] = useState<string | null>(null)
  const [themePref, setThemePref] = useState<ThemePref>(() => loadThemePref())
  const cancelRun = useRef(false)
  const lastPanelRef = useRef<HTMLElement | null>(null)
  const itemsRef = useRef(items)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    applyTheme(themePref)
    saveThemePref(themePref)
  }, [themePref])

  useEffect(() => {
    if (themePref !== 'sistema') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('sistema')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [themePref])

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}datos.json`
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: CasoRevision[]) => {
        const defaults = toDefaultItems(data)
        const extras = loadAgregados()
        const merged = [...defaults, ...extras]
        setItems(merged)
        const initial: Record<string, EntryProgress> = {}
        for (const c of merged) {
          initial[c.entrada.id] = initialProgress()
        }
        setProgressById(initial)
      })
      .catch((e: Error) => setLoadError(e.message ?? 'Error al cargar datos'))
      .finally(() => setLoading(false))
  }, [])

  const persistExtras = useCallback((next: ItemCola[]) => {
    const result = saveAgregados(next)
    if (result.ok && result.mode === 'memoria') {
      setPersistAviso(result.aviso)
    } else {
      setPersistAviso(null)
    }
  }, [])

  const selected = useMemo(
    () => items.find((c) => c.entrada.id === selectedId) ?? null,
    [items, selectedId],
  )

  const progress = selectedId
    ? (progressById[selectedId] ?? initialProgress())
    : initialProgress()

  const upcoming = nextStep(progress)
  const shouldJumpToAgg =
    !!selected &&
    !!upcoming &&
    !!upcoming.omitOnAdmitFail &&
    admitFailed(selected)

  useEffect(() => {
    if (!lastPanelRef.current) return
    lastPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [progress.revealed.length, processingId])

  const updateProgress = useCallback((id: string, next: EntryProgress) => {
    setProgressById((prev) => ({ ...prev, [id]: next }))
  }, [])

  const ensureSalida = useCallback(
    async (item: ItemCola): Promise<ItemCola> => {
      if (item.salida) return item
      setProcessingText('Calculando análisis simulado en el navegador…')
      const salida = await procesarEntrada(item.entrada)
      const updated: ItemCola = {
        ...item,
        salida,
        pendienteCalculo: false,
      }
      setItems((prev) => {
        const next = prev.map((x) => (x.entrada.id === item.entrada.id ? updated : x))
        persistExtras(next)
        return next
      })
      return updated
    },
    [persistExtras],
  )

  const runOneStep = useCallback(
    async (item: ItemCola, current: EntryProgress): Promise<EntryProgress> => {
      const upcomingStep = nextStep(current)
      if (!upcomingStep) return current

      let working = item
      if (upcomingStep.id !== 'entrada' && (working.pendienteCalculo || !working.salida)) {
        setProcessingId(upcomingStep.id)
        working = await ensureSalida(working)
        if (cancelRun.current) {
          setProcessingId(null)
          return current
        }
      }

      const jump = upcomingStep.omitOnAdmitFail && admitFailed(working)
      if (jump) {
        setProcessingId('agregacion')
        setProcessingText(stepDef('agregacion').processing)
        await sleep(processingDelayMs())
        if (cancelRun.current) {
          setProcessingId(null)
          return current
        }
        const next = applySkipToAgregacion(current)
        updateProgress(working.entrada.id, next)
        setProcessingId(null)
        return next
      }

      setProcessingId(upcomingStep.id)
      setProcessingText(upcomingStep.processing)
      await sleep(processingDelayMs())
      if (cancelRun.current) {
        setProcessingId(null)
        return current
      }
      const next: EntryProgress = {
        revealed: [...current.revealed, { id: upcomingStep.id, status: 'done' }],
      }
      updateProgress(working.entrada.id, next)
      setProcessingId(null)
      return next
    },
    [ensureSalida, updateProgress],
  )

  async function handleExecuteNext() {
    if (!selected || busy || !upcoming) return
    cancelRun.current = false
    setBusy(true)
    try {
      const latest = itemsRef.current.find((i) => i.entrada.id === selected.entrada.id) ?? selected
      await runOneStep(latest, progress)
    } finally {
      setBusy(false)
    }
  }

  async function handleExecuteAll() {
    if (!selected || busy) return
    cancelRun.current = false
    setBusy(true)
    try {
      let current = progressById[selected.entrada.id] ?? initialProgress()
      while (nextStep(current) && !cancelRun.current) {
        const latest =
          itemsRef.current.find((i) => i.entrada.id === selected.entrada.id) ?? selected
        current = await runOneStep(latest, current)
      }
    } finally {
      setBusy(false)
    }
  }

  function handleReset() {
    if (!selectedId) return
    cancelRun.current = true
    setBusy(false)
    setProcessingId(null)
    setProcessingText('')
    updateProgress(selectedId, initialProgress())
  }

  function handleSelect(id: string) {
    if (!id) return
    cancelRun.current = true
    setBusy(false)
    setProcessingId(null)
    setProcessingText('')
    setSelectedId(id)
    setProgressById((prev) =>
      prev[id] ? prev : { ...prev, [id]: initialProgress() },
    )
  }

  function handleAdd(newItems: ItemCola[]) {
    setItems((prev) => {
      const ids = new Set(prev.map((p) => p.entrada.id))
      const unique = newItems.filter((n) => !ids.has(n.entrada.id))
      const next = [...prev, ...unique]
      persistExtras(next)
      return next
    })
    setProgressById((prev) => {
      const copy = { ...prev }
      for (const n of newItems) {
        if (!copy[n.entrada.id]) copy[n.entrada.id] = initialProgress()
      }
      return copy
    })
    if (newItems[0]) setSelectedId(newItems[0].entrada.id)
  }

  function handleRemove(id: string) {
    setItems((prev) => {
      const next = prev.filter((i) => i.entrada.id !== id)
      persistExtras(next)
      return next
    })
    if (selectedId === id) setSelectedId(null)
    setProgressById((prev) => {
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
  }

  function handleResetDefaults() {
    clearAgregados()
    setPersistAviso(null)
    setSelectedId(null)
    setItems((prev) => {
      const defaults = prev.filter((i) => i.fuente === 'por_defecto')
      setProgressById((pprev) => {
        const next: Record<string, EntryProgress> = {}
        for (const d of defaults) {
          next[d.entrada.id] = pprev[d.entrada.id] ?? initialProgress()
        }
        return next
      })
      return defaults
    })
  }

  const hasExtras = items.some((i) => i.fuente !== 'por_defecto')
  const existingIds = useMemo(() => new Set(items.map((i) => i.entrada.id)), [items])

  if (loading) {
    return (
      <div className="app-shell">
        <Header items={[]} themePref={themePref} onThemeChange={setThemePref} />
        <p className="loading">Cargando datos…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="app-shell">
        <Header items={[]} themePref={themePref} onThemeChange={setThemePref} />
        <p className="error-state">No se pudo cargar datos.json: {loadError}</p>
      </div>
    )
  }

  const primaryLabel = shouldJumpToAgg
    ? 'Ir a la agregación'
    : upcoming
      ? `Ejecutar paso ${upcoming.displayNum}: ${upcoming.name}`
      : 'Proceso completado'

  return (
    <div className="app-shell">
      <Header items={items} themePref={themePref} onThemeChange={setThemePref} />
      {persistAviso && (
        <p className="persist-banner" role="status">
          {persistAviso}
        </p>
      )}
      <div className="app-body">
        <ReviewQueue
          items={items}
          selectedId={selectedId}
          progressById={progressById}
          onSelect={handleSelect}
          onAddClick={() => setModalOpen(true)}
          onRemove={handleRemove}
          onResetDefaults={handleResetDefaults}
          hasExtras={hasExtras}
        />
        <main className="main-panel">
          {selected ? (
            <>
              <CaseStickyBar
                item={selected}
                progress={progress}
                busy={busy}
                primaryLabel={primaryLabel}
                canExecute={!!upcoming}
                onExecuteNext={() => void handleExecuteNext()}
                onExecuteAll={() => void handleExecuteAll()}
                onReset={handleReset}
              />

              {hasReachedAgregacion(progress) && selected.salida && (
                <ResultCard salida={selected.salida} />
              )}

              <StepPipeline
                item={selected}
                revealed={progress.revealed}
                processingId={processingId}
                processingText={processingText}
                lastPanelRef={lastPanelRef}
              />

              <MobileActionBar
                primaryLabel={primaryLabel}
                busy={busy}
                canExecute={!!upcoming}
                onExecuteNext={() => void handleExecuteNext()}
                onReset={handleReset}
              />
            </>
          ) : (
            <div className="empty-state">
              <p className="empty-state-title">Ninguna contribución seleccionada</p>
              <p className="empty-state-hint">
                Elige una contribución y ejecuta el proceso paso a paso, o agrega la tuya.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setModalOpen(true)}
              >
                Agregar contribuciones
              </button>
            </div>
          )}
        </main>
      </div>
      <Footer />
      <AddContributionsModal
        open={modalOpen}
        existingIds={existingIds}
        onClose={() => setModalOpen(false)}
        onAdd={handleAdd}
      />
    </div>
  )
}
