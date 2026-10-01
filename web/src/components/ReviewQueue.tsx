import type { CasoRevision, RecomendacionValor } from '../types'
import { RecommendationChip } from './RecommendationChip'
import { bandLabel, formatCurrency, recommendationLabel } from '../labels'

type Props = {
  cases: CasoRevision[]
  selectedId: string | null
  filter: RecomendacionValor | 'all'
  onFilterChange: (v: RecomendacionValor | 'all') => void
  onSelect: (id: string) => void
}

export function ReviewQueue({ cases, selectedId, filter, onFilterChange, onSelect }: Props) {
  const filtered =
    filter === 'all' ? cases : cases.filter((c) => c.salida.recommendation.value === filter)

  const list = (
    <ul className="queue-list">
      {filtered.map((c) => {
        const title = c.entrada.context.title ?? c.entrada.id
        const amount = c.entrada.requested_amount ?? c.salida.reward.requestedAmount
        return (
          <li key={c.entrada.id}>
            <button
              type="button"
              className={`queue-item${selectedId === c.entrada.id ? ' active' : ''}`}
              onClick={() => onSelect(c.entrada.id)}
            >
              <div className="queue-item-title">
                <strong>{c.entrada.id}</strong> {title}
              </div>
              <div className="queue-item-meta">
                <RecommendationChip value={c.salida.recommendation.value} />
                <span>{formatCurrency(amount)}</span>
                <span>Conf. {bandLabel(c.salida.confidence.band)}</span>
                <span>Prioridad {c.salida.priority.score}</span>
              </div>
            </button>
          </li>
        )
      })}
      {filtered.length === 0 && (
        <li style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Ninguna contribución con este filtro.
        </li>
      )}
    </ul>
  )

  const filterControl = (
    <select
      className="queue-filter"
      value={filter}
      onChange={(e) => onFilterChange(e.target.value as RecomendacionValor | 'all')}
      aria-label="Filtrar por recomendación"
    >
      <option value="all">Todas las recomendaciones</option>
      {(['aprobar', 'rechazar', 'ajustar_monto', 'derivar_revision_humana'] as const).map((v) => (
        <option key={v} value={v}>
          {recommendationLabel(v)}
        </option>
      ))}
    </select>
  )

  return (
    <>
      <aside className="queue-sidebar" aria-label="Cola de revisión">
        <h2>Cola de revisión</h2>
        {filterControl}
        {list}
      </aside>
      <div className="queue-mobile">
        {filterControl}
        <select
          className="queue-filter"
          value={selectedId ?? ''}
          onChange={(e) => onSelect(e.target.value)}
          aria-label="Seleccionar contribución"
        >
          {filtered.map((c) => (
            <option key={c.entrada.id} value={c.entrada.id}>
              {c.entrada.id}: {c.entrada.context.title ?? 'Sin título'}
            </option>
          ))}
        </select>
      </div>
    </>
  )
}
