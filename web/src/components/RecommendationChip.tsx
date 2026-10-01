import type { RecomendacionValor } from '../types'
import { recommendationLabel } from '../labels'

const chipClass: Record<RecomendacionValor, string> = {
  aprobar: 'chip chip-aprobar',
  rechazar: 'chip chip-rechazar',
  ajustar_monto: 'chip chip-ajustar_monto',
  derivar_revision_humana: 'chip chip-derivar_revision_humana',
}

export function RecommendationChip({ value }: { value: RecomendacionValor }) {
  return <span className={chipClass[value]}>{recommendationLabel(value)}</span>
}
