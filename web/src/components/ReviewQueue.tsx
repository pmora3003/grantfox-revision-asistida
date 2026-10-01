import { Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ItemCola, RecomendacionValor } from '../types'
import type { EntryProgress, EntryProgressKind } from '../steps'
import {
  progressKind,
  TOTAL_STEPS,
  hasReachedAgregacion,
  initialProgress,
} from '../steps'
import { RecommendationChip } from './RecommendationChip'
import { formatCurrency, recommendationLabel, repoFromIdOrUrl } from '../labels'
import { fuenteLabel } from '../colaPersistencia'

type StateFilter = 'all' | EntryProgressKind
type RecFilter = RecomendacionValor | 'all'

type Props = {
  items: ItemCola[]
  selectedId: string | null
  progressById: Record<string, EntryProgress>
  onSelect: (id: string) => void
  onAddClick: () => void
  onRemove: (id: string) => void
  onResetDefaults: () => void
  hasExtras: boolean
}

const STATE_CHIPS: { id: StateFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'pendiente', label: 'Sin ejecutar' },
  { id: 'en_curso', label: 'En curso' },
  { id: 'completado', label: 'Completado' },
]

const REC_CHIPS: { id: RecFilter; label: string }[] = [
  { id: 'all', label: 'Cualquier recomendación' },
  { id: 'aprobar', label: recommendationLabel('aprobar') },
  { id: 'rechazar', label: recommendationLabel('rechazar') },
  { id: 'ajustar_monto', label: recommendationLabel('ajustar_monto') },
  { id: 'derivar_revision_humana', label: recommendationLabel('derivar_revision_humana') },
]

function ProgressBadge({ progress }: { progress: EntryProgress }) {
  const kind = progressKind(progress)
  const n = progress.revealed.length
  if (kind === 'pendiente') {
    return <span className="progress-badge progress-pendiente">sin ejecutar</span>
  }
  if (kind === 'completado') {
    return <span className="progress-badge progress-completado">completado</span>
  }
  return (
    <span className="progress-badge progress-en-curso">
      en curso {n}/{TOTAL_STEPS}
    </span>
  )
}

export function ReviewQueue({
  items,
  selectedId,
  progressById,
  onSelect,
  onAddClick,
  onRemove,
  onResetDefaults,
  hasExtras,
}: Props) {
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const [recFilter, setRecFilter] = useState<RecFilter>('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      const progress = progressById[item.entrada.id] ?? initialProgress()
      const kind = progressKind(progress)
      if (stateFilter !== 'all' && kind !== stateFilter) return false

      if (recFilter !== 'all') {
        const showRec = hasReachedAgregacion(progress) && item.salida
        if (!showRec || item.salida!.recommendation.value !== recFilter) return false
      }

      if (!q) return true
      const title = (item.entrada.context.title ?? '').toLowerCase()
      const id = item.entrada.id.toLowerCase()
      return title.includes(q) || id.includes(q)
    })
  }, [items, progressById, search, stateFilter, recFilter])

  const list = (
    <ul className="queue-list">
      {filtered.map((item) => {
        const title = item.entrada.context.title ?? item.entrada.id
        const amount =
          item.entrada.requested_amount ?? item.salida?.reward.requestedAmount ?? 0
        const progress = progressById[item.entrada.id] ?? initialProgress()
        const showRec = hasReachedAgregacion(progress) && !!item.salida
        const repo = repoFromIdOrUrl(item.entrada.id, item.entrada.context.prUrl)
        const canRemove = item.fuente !== 'por_defecto'
        return (
          <li key={item.entrada.id} className="queue-row">
            <button
              type="button"
              className={`queue-item${selectedId === item.entrada.id ? ' active' : ''}`}
              onClick={() => onSelect(item.entrada.id)}
            >
              <div className="queue-item-title">{title}</div>
              <div className="queue-item-repo muted">{repo}</div>
              <div className="queue-item-meta">
                <span className={`source-tag source-${item.fuente}`}>
                  {fuenteLabel(item.fuente)}
                </span>
                <ProgressBadge progress={progress} />
                {showRec ? (
                  <RecommendationChip value={item.salida!.recommendation.value} />
                ) : null}
                <span className="queue-amount">{formatCurrency(amount)}</span>
              </div>
            </button>
            {canRemove && (
              <button
                type="button"
                className="btn btn-ghost btn-icon queue-remove"
                title="Quitar de la cola"
                aria-label={`Quitar ${item.entrada.id}`}
                onClick={() => onRemove(item.entrada.id)}
              >
                <Trash2 size={15} />
              </button>
            )}
          </li>
        )
      })}
      {filtered.length === 0 && (
        <li className="queue-empty">Ninguna contribución con estos filtros.</li>
      )}
    </ul>
  )

  const filters = (
    <>
      <label className="queue-search">
        <Search size={15} aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título o id"
          aria-label="Buscar por título o id"
        />
      </label>
      <div className="filter-chips" role="group" aria-label="Filtrar por estado">
        {STATE_CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`filter-chip${stateFilter === c.id ? ' active' : ''}`}
            onClick={() => setStateFilter(c.id)}
            aria-pressed={stateFilter === c.id}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="filter-chips" role="group" aria-label="Filtrar por recomendación">
        {REC_CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`filter-chip${recFilter === c.id ? ' active' : ''}`}
            onClick={() => setRecFilter(c.id)}
            aria-pressed={recFilter === c.id}
          >
            {c.label}
          </button>
        ))}
      </div>
    </>
  )

  return (
    <>
      <aside className="queue-sidebar" aria-label="Cola de revisión">
        <div className="queue-header">
          <h2>Cola de revisión</h2>
          <button type="button" className="btn btn-primary btn-sm" onClick={onAddClick}>
            <Plus size={15} aria-hidden /> Agregar contribuciones
          </button>
        </div>
        {filters}
        {list}
        {hasExtras && (
          <button type="button" className="btn btn-ghost btn-reset-data" onClick={onResetDefaults}>
            <RotateCcw size={15} aria-hidden /> Restablecer datos por defecto
          </button>
        )}
      </aside>

      <div className="queue-mobile">
        <div className="queue-mobile-bar">
          <label className="queue-mobile-select">
            <span className="field-label">Contribución</span>
            <select
              value={selectedId ?? ''}
              onChange={(e) => onSelect(e.target.value)}
              aria-label="Seleccionar contribución"
            >
              <option value="" disabled>
                Elegir contribución…
              </option>
              {filtered.map((item) => {
                const progress = progressById[item.entrada.id] ?? initialProgress()
                const kind = progressKind(progress)
                const suffix =
                  kind === 'pendiente'
                    ? 'sin ejecutar'
                    : kind === 'completado'
                      ? 'completado'
                      : `${progress.revealed.length}/${TOTAL_STEPS}`
                return (
                  <option key={item.entrada.id} value={item.entrada.id}>
                    {item.entrada.context.title ?? item.entrada.id} ({suffix})
                  </option>
                )
              })}
            </select>
          </label>
          <button type="button" className="btn btn-primary btn-sm" onClick={onAddClick}>
            <Plus size={15} aria-hidden /> Agregar
          </button>
        </div>
      </div>
    </>
  )
}
