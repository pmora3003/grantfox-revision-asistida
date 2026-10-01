import { useEffect, useMemo, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { Corrida, DecisionHumana, ItemCola } from '../types'
import { hasReachedAgregacion } from '../steps'
import { progressFromEtapa } from '../etapas'
import { ResultCard } from './ResultCard'
import { StepPipeline } from './StepContent'

type Props = {
  corrida: Corrida
  itemId: string
  onBack: () => void
  onBackInicio: () => void
  onSaveDecision: (d: DecisionHumana) => void
}

export function DetallePRView({
  corrida,
  itemId,
  onBack,
  onBackInicio,
  onSaveDecision,
}: Props) {
  const item = corrida.items.find((i) => i.id === itemId)
  const lastPanelRef = useRef<HTMLElement | null>(null)

  const colaItem: ItemCola | null = useMemo(() => {
    if (!item) return null
    return {
      entrada: item.entrada,
      salida: item.salida ?? null,
      fuente:
        corrida.origen === 'por_defecto'
          ? 'por_defecto'
          : corrida.origen === 'enlaces'
            ? 'enlace'
            : 'archivo',
      pendienteCalculo: !item.salida,
    }
  }, [item, corrida.origen])

  const progress = useMemo(() => {
    if (!item) return progressFromEtapa(0, null)
    const etapa = Math.max(item.etapaAlcanzada, corrida.etapaActual)
    return progressFromEtapa(etapa, item.salida)
  }, [item, corrida.etapaActual])

  useEffect(() => {
    if (!lastPanelRef.current) return
    lastPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [progress.revealed.length])

  if (!item || !colaItem) {
    return (
      <div className="detalle-pr-view">
        <p className="error-state">No se encontró el PR en esta corrida.</p>
        <button type="button" className="btn" onClick={onBack}>
          Volver
        </button>
      </div>
    )
  }

  const title = item.entrada.context.title ?? item.id
  const saved = corrida.decisiones?.[item.id] ?? null

  return (
    <div className="detalle-pr-view">
      <nav className="breadcrumb">
        <button type="button" className="link-btn" onClick={onBackInicio}>
          Corridas
        </button>
        <span className="breadcrumb-sep" aria-hidden>
          /
        </span>
        <button type="button" className="link-btn" onClick={onBack}>
          {corrida.nombre}
        </button>
        <span className="breadcrumb-sep" aria-hidden>
          /
        </span>
        <span className="breadcrumb-current">{title}</span>
      </nav>

      <div className="detalle-pr-toolbar">
        <button type="button" className="btn" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden /> Volver a la corrida
        </button>
        <p className="muted detalle-etapa-hint">
          Se muestran los pasos alcanzados por la corrida (etapa {corrida.etapaActual} de 5).
        </p>
      </div>

      <header className="detalle-pr-header">
        <h2>{title}</h2>
        <p className="muted">{item.id}</p>
      </header>

      {hasReachedAgregacion(progress) && colaItem.salida && (
        <ResultCard salida={colaItem.salida} />
      )}

      <StepPipeline
        item={colaItem}
        revealed={progress.revealed}
        processingId={null}
        processingText=""
        lastPanelRef={lastPanelRef}
        corridaId={corrida.id}
        savedDecision={saved}
        onSaveDecision={onSaveDecision}
      />
    </div>
  )
}
