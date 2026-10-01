import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CasoRevision, Corrida, DecisionHumana } from './types'
import { procesarEntrada } from './motor'
import {
  DEMO_CORRIDA_ID,
  buildDemoCorrida,
  loadStoredCorridas,
  persistSnapshot,
  resetDemoProgress,
} from './corridasStore'
import { TOTAL_ETAPAS, stageAnimDelayMs, resumenTrasEtapa } from './etapas'
import { applyTheme, loadThemePref, saveThemePref, type ThemePref } from './theme'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { InicioView } from './components/InicioView'
import { NuevaCorridaModal } from './components/NuevaCorridaModal'
import { CorridaView, bannerForEtapa } from './components/CorridaView'
import { DetallePRView } from './components/DetallePRView'
import { RecorridoGuiado } from './components/RecorridoGuiado'
import './styles.css'

type View =
  | { name: 'inicio' }
  | { name: 'corrida'; corridaId: string }
  | { name: 'detalle'; corridaId: string; itemId: string }
  | { name: 'recorrido' }

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function sortCorridas(list: Corrida[]): Corrida[] {
  return [...list].sort((a, b) => {
    if (a.id === DEMO_CORRIDA_ID) return -1
    if (b.id === DEMO_CORRIDA_ID) return 1
    return (b.creadaEn || '').localeCompare(a.creadaEn || '')
  })
}

export default function App() {
  const [corridas, setCorridas] = useState<Corrida[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [persistAviso, setPersistAviso] = useState<string | null>(null)
  const [themePref, setThemePref] = useState<ThemePref>(() => loadThemePref())
  const [view, setView] = useState<View>({ name: 'inicio' })
  const [modalOpen, setModalOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [computingSalidas, setComputingSalidas] = useState(false)
  const [processingItemId, setProcessingItemId] = useState<string | null>(null)
  const [stageBanner, setStageBanner] = useState<{ titulo: string; detalle: string } | null>(
    null,
  )
  const [tourPaused, setTourPaused] = useState(false)
  const cancelRun = useRef(false)
  const corridasRef = useRef(corridas)

  useEffect(() => {
    corridasRef.current = corridas
  }, [corridas])

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

  const persist = useCallback((next: Corrida[]) => {
    const result = persistSnapshot(next)
    if (result.ok && result.mode === 'memoria') {
      setPersistAviso(result.aviso)
    } else {
      setPersistAviso(null)
    }
  }, [])

  const updateCorridas = useCallback(
    (updater: (prev: Corrida[]) => Corrida[]) => {
      setCorridas((prev) => {
        const next = sortCorridas(updater(prev))
        persist(next)
        return next
      })
    },
    [persist],
  )

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}datos.json`
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: CasoRevision[]) => {
        const stored = loadStoredCorridas()
        const demo = buildDemoCorrida(data, stored.demo)
        setCorridas(sortCorridas([demo, ...stored.userCorridas]))
      })
      .catch((e: Error) => setLoadError(e.message ?? 'Error al cargar datos'))
      .finally(() => setLoading(false))
  }, [])

  const currentCorrida = useMemo(() => {
    if (view.name === 'corrida' || view.name === 'detalle') {
      return corridas.find((c) => c.id === view.corridaId) ?? null
    }
    return null
  }, [view, corridas])

  const demoCorrida = useMemo(
    () => corridas.find((c) => c.id === DEMO_CORRIDA_ID) ?? null,
    [corridas],
  )

  const headerModo = useMemo(() => {
    if (view.name === 'corrida' || view.name === 'detalle') {
      return currentCorrida?.modoEjecucion ?? null
    }
    if (view.name === 'recorrido') return demoCorrida?.modoEjecucion ?? null
    return null
  }, [view, currentCorrida, demoCorrida])

  const headerModel = useMemo(() => {
    const c = view.name === 'recorrido' ? demoCorrida : currentCorrida
    const s = c?.items.find((i) => i.salida)?.salida
    return s?.model.version ?? ''
  }, [view, currentCorrida, demoCorrida])

  async function ensureSalidas(corrida: Corrida): Promise<Corrida> {
    const needs = corrida.items.some((i) => !i.salida)
    if (!needs) return corrida
    setComputingSalidas(true)
    try {
      const items = []
      for (const it of corrida.items) {
        if (it.salida) {
          items.push(it)
          continue
        }
        setProcessingItemId(it.id)
        const salida = await procesarEntrada(it.entrada)
        items.push({ ...it, salida })
      }
      setProcessingItemId(null)
      return { ...corrida, items, modoEjecucion: 'simulado' }
    } finally {
      setComputingSalidas(false)
    }
  }

  async function runEtapa(corridaId: string, etapaNum: number): Promise<Corrida | null> {
    let corrida = corridasRef.current.find((c) => c.id === corridaId)
    if (!corrida) return null

    if (etapaNum === 1 || !corrida.iniciadaEn) {
      corrida = await ensureSalidas(corrida)
      if (cancelRun.current) return null
      corrida = {
        ...corrida,
        iniciadaEn: corrida.iniciadaEn ?? new Date().toISOString(),
      }
      updateCorridas((prev) => prev.map((c) => (c.id === corridaId ? corrida! : c)))
    }

    const items = [...corrida.items]
    for (let i = 0; i < items.length; i++) {
      if (cancelRun.current) return null
      const it = items[i]!
      setProcessingItemId(it.id)
      await sleep(stageAnimDelayMs())
      items[i] = { ...it, etapaAlcanzada: Math.max(it.etapaAlcanzada, etapaNum) }
      const partial: Corrida = {
        ...corrida,
        items: [...items],
        etapaActual: Math.max(corrida.etapaActual, etapaNum - 1),
      }
      updateCorridas((prev) => prev.map((c) => (c.id === corridaId ? partial : c)))
    }
    setProcessingItemId(null)

    const finalizadaEn =
      etapaNum >= TOTAL_ETAPAS ? new Date().toISOString() : corrida.finalizadaEn
    const done: Corrida = {
      ...corrida,
      items: items.map((it) => ({
        ...it,
        etapaAlcanzada: Math.max(it.etapaAlcanzada, etapaNum),
      })),
      etapaActual: etapaNum,
      iniciadaEn: corrida.iniciadaEn ?? new Date().toISOString(),
      finalizadaEn,
    }
    updateCorridas((prev) => prev.map((c) => (c.id === corridaId ? done : c)))
    setStageBanner(bannerForEtapa(etapaNum, done.items))
    return done
  }

  async function handlePrimary(corridaId: string) {
    const corrida = corridasRef.current.find((c) => c.id === corridaId)
    if (!corrida || busy) return
    cancelRun.current = false
    setBusy(true)
    try {
      if (!corrida.iniciadaEn) {
        const withSalidas = await ensureSalidas(corrida)
        if (cancelRun.current) return
        const started: Corrida = {
          ...withSalidas,
          iniciadaEn: new Date().toISOString(),
        }
        updateCorridas((prev) => prev.map((c) => (c.id === corridaId ? started : c)))
        setStageBanner({
          titulo: 'Corrida iniciada.',
          detalle: 'Pulse Ejecutar etapa 1 para comenzar la admisibilidad.',
        })
        return
      }
      if (corrida.etapaActual >= TOTAL_ETAPAS) return
      await runEtapa(corridaId, corrida.etapaActual + 1)
    } finally {
      setBusy(false)
      setProcessingItemId(null)
      setComputingSalidas(false)
    }
  }

  async function handleEjecutarTodas(corridaId: string) {
    const corrida = corridasRef.current.find((c) => c.id === corridaId)
    if (!corrida || busy) return
    cancelRun.current = false
    setBusy(true)
    try {
      let current = corrida
      if (!current.iniciadaEn) {
        current = await ensureSalidas(current)
        if (cancelRun.current) return
        current = { ...current, iniciadaEn: new Date().toISOString() }
        updateCorridas((prev) => prev.map((c) => (c.id === corridaId ? current : c)))
      }
      while (current.etapaActual < TOTAL_ETAPAS && !cancelRun.current) {
        const next = await runEtapa(corridaId, current.etapaActual + 1)
        if (!next) break
        current = next
      }
    } finally {
      setBusy(false)
      setProcessingItemId(null)
      setComputingSalidas(false)
    }
  }

  function handleReiniciar(corridaId: string) {
    cancelRun.current = true
    setBusy(false)
    setProcessingItemId(null)
    setComputingSalidas(false)
    setStageBanner(null)
    updateCorridas((prev) =>
      prev.map((c) => {
        if (c.id !== corridaId) return c
        return {
          ...c,
          etapaActual: 0,
          iniciadaEn: undefined,
          finalizadaEn: undefined,
          decisiones: {},
          items: c.items.map((it) => ({
            ...it,
            etapaAlcanzada: 0,
            salida: it.salida,
          })),
        }
      }),
    )
  }

  function handleSaveDecision(corridaId: string, d: DecisionHumana) {
    updateCorridas((prev) =>
      prev.map((c) => {
        if (c.id !== corridaId) return c
        return {
          ...c,
          decisiones: { ...(c.decisiones ?? {}), [d.contributionId]: d },
        }
      }),
    )
  }

  if (loading) {
    return (
      <div className="app-shell app-shell-wide">
        <Header themePref={themePref} onThemeChange={setThemePref} />
        <p className="loading">Cargando datos…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="app-shell app-shell-wide">
        <Header themePref={themePref} onThemeChange={setThemePref} />
        <p className="error-state">No se pudo cargar datos.json: {loadError}</p>
      </div>
    )
  }

  const showTourPill =
    tourPaused &&
    (view.name === 'corrida' || view.name === 'detalle') &&
    view.corridaId === DEMO_CORRIDA_ID

  return (
    <div
      className={`app-shell${view.name === 'inicio' || view.name === 'corrida' || view.name === 'recorrido' ? ' app-shell-wide' : ''}${view.name === 'recorrido' && !tourPaused ? ' app-shell-tour' : ''}`}
    >
      {!(view.name === 'recorrido' && !tourPaused) && (
        <Header
          themePref={themePref}
          onThemeChange={setThemePref}
          modoEjecucion={headerModo}
          modelVersion={headerModel}
          contextoBadge={
            view.name === 'inicio'
              ? `${corridas.length} corrida${corridas.length === 1 ? '' : 's'}`
              : currentCorrida?.nombre
          }
          onBrandClick={() => {
            cancelRun.current = true
            setTourPaused(false)
            setView({ name: 'inicio' })
          }}
        />
      )}
      {persistAviso && (
        <p className="persist-banner" role="status">
          {persistAviso}
        </p>
      )}

      {view.name === 'inicio' && (
        <InicioView
          corridas={corridas}
          onAbrir={(id) => {
            setStageBanner(null)
            setView({ name: 'corrida', corridaId: id })
          }}
          onNueva={() => setModalOpen(true)}
          onRecorrido={() => {
            setTourPaused(false)
            setView({ name: 'recorrido' })
          }}
          onEliminar={(id) => {
            if (id === DEMO_CORRIDA_ID) return
            updateCorridas((prev) => prev.filter((c) => c.id !== id))
          }}
          onRestablecerDemo={() => {
            updateCorridas((prev) =>
              prev.map((c) => {
                if (c.id !== DEMO_CORRIDA_ID) return c
                const p = resetDemoProgress()
                return {
                  ...c,
                  etapaActual: p.etapaActual,
                  iniciadaEn: undefined,
                  finalizadaEn: undefined,
                  decisiones: {},
                  items: c.items.map((it) => ({ ...it, etapaAlcanzada: 0 })),
                }
              }),
            )
            setStageBanner(null)
          }}
        />
      )}

      {view.name === 'corrida' && currentCorrida && (
        <CorridaView
          corrida={currentCorrida}
          busy={busy}
          processingItemId={processingItemId}
          stageBanner={
            stageBanner ??
            (currentCorrida.etapaActual > 0
              ? resumenTrasEtapa(
                  currentCorrida.etapaActual,
                  currentCorrida.items.map((i) => i.salida),
                )
              : null)
          }
          computingSalidas={computingSalidas}
          onBack={() => {
            cancelRun.current = true
            setView({ name: 'inicio' })
          }}
          onPrimary={() => void handlePrimary(currentCorrida.id)}
          onEjecutarTodas={() => void handleEjecutarTodas(currentCorrida.id)}
          onReiniciar={() => handleReiniciar(currentCorrida.id)}
          onOpenPr={(itemId) =>
            setView({ name: 'detalle', corridaId: currentCorrida.id, itemId })
          }
        />
      )}

      {view.name === 'detalle' && currentCorrida && (
        <DetallePRView
          corrida={currentCorrida}
          itemId={view.itemId}
          onBack={() => setView({ name: 'corrida', corridaId: currentCorrida.id })}
          onBackInicio={() => setView({ name: 'inicio' })}
          onSaveDecision={(d) => handleSaveDecision(currentCorrida.id, d)}
        />
      )}

      {view.name === 'recorrido' && !tourPaused && (
        <RecorridoGuiado
          demoCorrida={demoCorrida}
          busy={busy}
          processingItemId={processingItemId}
          onSalir={() => setView({ name: 'inicio' })}
          onAbrirDemo={() => {
            setTourPaused(true)
            setStageBanner(null)
            setView({ name: 'corrida', corridaId: DEMO_CORRIDA_ID })
          }}
          onAbrirPr={(itemId) => {
            setTourPaused(true)
            setView({ name: 'detalle', corridaId: DEMO_CORRIDA_ID, itemId })
          }}
          onIniciarOAvanzarDemo={() => {
            if (!demoCorrida) return
            void handlePrimary(DEMO_CORRIDA_ID)
          }}
        />
      )}

      {showTourPill && (
        <RecorridoGuiado
          demoCorrida={demoCorrida}
          busy={busy}
          processingItemId={processingItemId}
          tourPaused
          onSalir={() => setView({ name: 'inicio' })}
          onAbrirDemo={() => undefined}
          onAbrirPr={() => undefined}
          onIniciarOAvanzarDemo={() => undefined}
          onVolverAlRecorrido={() => {
            setTourPaused(false)
            setView({ name: 'recorrido' })
          }}
        />
      )}

      {!(view.name === 'recorrido' && !tourPaused) && <Footer />}

      <NuevaCorridaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(corrida) => {
          updateCorridas((prev) => [...prev, corrida])
          setModalOpen(false)
          setStageBanner(null)
          setView({ name: 'corrida', corridaId: corrida.id })
        }}
      />
    </div>
  )
}
