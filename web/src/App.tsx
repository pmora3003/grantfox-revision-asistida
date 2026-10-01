import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import type { CasoRevision, DimensionNombre, PasoProceso, RecomendacionValor } from './types'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { ReviewQueue } from './components/ReviewQueue'
import { ProcessStepper } from './components/ProcessStepper'
import { StepContent } from './components/StepContent'
import './styles.css'

const DIMENSIONS: DimensionNombre[] = [
  'cumplimiento_alcance',
  'calidad_tecnica',
  'riesgos_seguridad',
  'proporcionalidad',
]

const STEP_MS = 800

function sortCases(cases: CasoRevision[]): CasoRevision[] {
  return [...cases].sort((a, b) => b.salida.priority.score - a.salida.priority.score)
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export default function App() {
  const [cases, setCases] = useState<CasoRevision[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<RecomendacionValor | 'all'>('all')
  const [activeStep, setActiveStep] = useState<PasoProceso>(1)
  const [activeDimension, setActiveDimension] = useState<DimensionNombre | null>(null)
  const [playing, setPlaying] = useState(false)
  const cancelPlayback = useRef(false)

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}datos.json`
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: CasoRevision[]) => {
        const sorted = sortCases(data)
        setCases(sorted)
        setSelectedId(sorted[0]?.entrada.id ?? null)
      })
      .catch((e: Error) => setLoadError(e.message ?? 'Error al cargar datos'))
      .finally(() => setLoading(false))
  }, [])

  const selected = useMemo(
    () => cases.find((c) => c.entrada.id === selectedId) ?? null,
    [cases, selectedId],
  )

  const stepsOmitted = selected
    ? selected.salida.admissibility.outcome === 'no_admisible'
    : false

  const omitReason = useMemo(() => {
    if (!selected || !stepsOmitted) return ''
    const stop = selected.salida.admissibility.stoppedAt
    const cond = selected.salida.admissibility.conditions.find((c) => c.code === stop)
    return stop
      ? `Admisibilidad detenida en ${stop}${cond ? `: ${cond.observed}` : ''}.`
      : 'Admisibilidad no admisible.'
  }, [selected, stepsOmitted])

  const stopPlayback = useCallback(() => {
    cancelPlayback.current = true
    setPlaying(false)
  }, [])

  const runPlayback = useCallback(async () => {
    if (!selected) return
    cancelPlayback.current = false
    setPlaying(true)
    setActiveStep(1)
    setActiveDimension(null)

    const tick = async (fn: () => void) => {
      if (cancelPlayback.current) return false
      fn()
      await sleep(STEP_MS)
      return !cancelPlayback.current
    }

    if (!(await tick(() => setActiveStep(1)))) return setPlaying(false)
    if (!(await tick(() => setActiveStep(2)))) return setPlaying(false)

    if (stepsOmitted) {
      if (!(await tick(() => setActiveStep(5)))) return setPlaying(false)
    } else {
      if (!(await tick(() => setActiveStep(3)))) return setPlaying(false)
      if (
        !(await tick(() => {
          setActiveStep(4)
          setActiveDimension(DIMENSIONS[0])
        }))
      ) {
        return setPlaying(false)
      }
      for (const dim of DIMENSIONS.slice(1)) {
        if (!(await tick(() => setActiveDimension(dim)))) return setPlaying(false)
      }
      if (
        !(await tick(() => {
          setActiveStep(5)
          setActiveDimension(null)
        }))
      ) {
        return setPlaying(false)
      }
    }

    if (!(await tick(() => setActiveStep(6)))) return setPlaying(false)
    await tick(() => setActiveStep(7))
    setPlaying(false)
  }, [selected, stepsOmitted])

  function handleStepClick(step: PasoProceso) {
    stopPlayback()
    if (stepsOmitted && (step === 3 || step === 4)) {
      setActiveStep(step)
      setActiveDimension(null)
      return
    }
    setActiveStep(step)
    if (step === 4 && !stepsOmitted) {
      setActiveDimension((d) => d ?? 'cumplimiento_alcance')
    } else {
      setActiveDimension(null)
    }
  }

  function handleSelect(id: string) {
    stopPlayback()
    setSelectedId(id)
    setActiveStep(1)
    setActiveDimension(null)
  }

  if (loading) {
    return (
      <div className="app-shell">
        <Header />
        <p className="loading">Cargando datos de prueba…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="app-shell">
        <Header />
        <p className="error-state">No se pudo cargar datos.json: {loadError}</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Header />
      <div className="app-body">
        <ReviewQueue
          cases={cases}
          selectedId={selectedId}
          filter={filter}
          onFilterChange={setFilter}
          onSelect={handleSelect}
        />
        <main className="main-panel">
          {selected ? (
            <>
              <div className="toolbar">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={playing}
                  onClick={() => void runPlayback()}
                >
                  <Play size={16} /> Reproducir proceso
                </button>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {selected.entrada.id}: {selected.entrada.context.title}
                </span>
              </div>
              <ProcessStepper
                activeStep={activeStep}
                activeDimension={activeDimension}
                stepsOmitted={stepsOmitted}
                onStepClick={handleStepClick}
              />
              <StepContent
                caso={selected}
                activeStep={activeStep}
                activeDimension={activeDimension}
                stepsOmitted={stepsOmitted}
                omitReason={omitReason}
              />
            </>
          ) : (
            <p className="loading">Seleccione una contribución.</p>
          )}
        </main>
      </div>
      <Footer />
    </div>
  )
}
