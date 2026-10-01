import { ArrowRight, AlertTriangle } from 'lucide-react'
import type { Salida } from '../types'
import {
  bandLabel,
  formatCurrency,
  recommendationLabel,
  rewardLevelLabel,
  supervisionLabel,
  supervisionScopeLabel,
} from '../labels'

type Props = {
  salida: Salida
}

export function ResultCard({ salida }: Props) {
  const conf = salida.confidence
  const scope =
    supervisionScopeLabel(conf.supervisionScope) || supervisionLabel(conf.supervision)
  const pct = Math.round(conf.score * 100)
  const rec = salida.recommendation.value

  return (
    <section className={`result-card result-card-${rec}`} aria-live="polite">
      <div className="result-card-rec">
        <span className="result-card-rec-label">Recomendación</span>
        <span className={`result-rec-big result-rec-${rec}`}>
          {recommendationLabel(rec)}
        </span>
      </div>

      <div className={`result-card-amounts${salida.reward.levelMismatch ? ' mismatch' : ''}`}>
        <div className="amount-side">
          <span className="amount-label">Solicitado</span>
          <strong className="amount-value">{formatCurrency(salida.reward.requestedAmount)}</strong>
          <span className="amount-level">{rewardLevelLabel(salida.reward.requestedLevel)}</span>
        </div>
        <ArrowRight className="amount-arrow" size={22} aria-hidden />
        <div className="amount-side">
          <span className="amount-label">Sugerido</span>
          <strong className="amount-value">{formatCurrency(salida.reward.suggestedAmount)}</strong>
          <span className="amount-level">{rewardLevelLabel(salida.reward.suggestedLevel)}</span>
        </div>
        {salida.reward.levelMismatch && (
          <p className="amount-mismatch-note">
            <AlertTriangle size={14} className="icon-inline" /> Desajuste de nivel
          </p>
        )}
      </div>

      <div className="result-card-metrics">
        <div className={`confidence-big band-${conf.band}`}>
          <span className="confidence-pct">{pct}%</span>
          <span className="confidence-band">Confianza {bandLabel(conf.band)}</span>
          <span className="confidence-scope">Supervisión: {scope}</span>
        </div>
        <div className="priority-big">
          <span className="priority-score">{salida.priority.score}</span>
          <span className="priority-label">Prioridad</span>
          <span className="priority-detail">
            {salida.priority.unmetCount} criterios no satisfechos, severidad{' '}
            {salida.priority.highestSeverity}
          </span>
        </div>
      </div>
    </section>
  )
}
