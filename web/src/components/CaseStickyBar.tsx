import { ExternalLink, Play, RotateCcw } from 'lucide-react'
import type { ItemCola } from '../types'
import type { EntryProgress, ManualStepId } from '../steps'
import { MANUAL_STEPS, TOTAL_STEPS, nextStep, revealedIds } from '../steps'

type Props = {
  item: ItemCola
  progress: EntryProgress
  busy: boolean
  primaryLabel: string
  canExecute: boolean
  onExecuteNext: () => void
  onExecuteAll: () => void
  onReset: () => void
}

export function CaseStickyBar({
  item,
  progress,
  busy,
  primaryLabel,
  canExecute,
  onExecuteNext,
  onExecuteAll,
  onReset,
}: Props) {
  const title = item.entrada.context.title ?? item.entrada.id
  const prUrl = item.entrada.context.prUrl
  const done = revealedIds(progress)
  const upcoming = nextStep(progress)
  const doneCount = progress.revealed.filter((r) => r.status === 'done').length

  return (
    <div className="case-sticky">
      <div className="case-sticky-top">
        <div className="case-sticky-title-block">
          <h2 className="case-sticky-title">{title}</h2>
          <p className="case-sticky-id muted">{item.entrada.id}</p>
        </div>
        {prUrl && (
          <a className="btn btn-ghost btn-sm" href={prUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={15} aria-hidden /> Ver PR
          </a>
        )}
      </div>

      <div
        className="progress-segments"
        role="img"
        aria-label={`Progreso ${doneCount} de ${TOTAL_STEPS} pasos`}
      >
        {MANUAL_STEPS.map((s) => {
          const revealed = done.has(s.id)
          const status = progress.revealed.find((r) => r.id === s.id)?.status
          const isNext = upcoming?.id === s.id
          let cls = 'progress-seg'
          if (status === 'omitted') cls += ' seg-omitted'
          else if (revealed) cls += ' seg-done'
          else if (isNext) cls += ' seg-next'
          return (
            <span
              key={s.id}
              className={cls}
              title={`Paso ${s.displayNum}: ${s.name}`}
            />
          )
        })}
        <span className="progress-seg-label">
          {doneCount}/{TOTAL_STEPS}
        </span>
      </div>

      <div className="case-sticky-actions">
        <button
          type="button"
          className="btn btn-primary btn-exec"
          disabled={busy || !canExecute}
          onClick={onExecuteNext}
        >
          <Play size={16} aria-hidden /> {primaryLabel}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onReset}>
          <RotateCcw size={16} aria-hidden /> Reiniciar
        </button>
        {upcoming && (
          <button
            type="button"
            className="link-exec-all"
            disabled={busy}
            onClick={onExecuteAll}
          >
            Ejecutar todo
          </button>
        )}
      </div>
    </div>
  )
}

/** Barra inferior fija en móvil con la acción primaria. */
export function MobileActionBar({
  primaryLabel,
  busy,
  canExecute,
  onExecuteNext,
  onReset,
}: {
  primaryLabel: string
  busy: boolean
  canExecute: boolean
  onExecuteNext: () => void
  onReset: () => void
  processingId?: ManualStepId | null
}) {
  return (
    <div className="mobile-action-bar">
      <button
        type="button"
        className="btn btn-primary btn-exec"
        disabled={busy || !canExecute}
        onClick={onExecuteNext}
      >
        <Play size={16} aria-hidden /> {primaryLabel}
      </button>
      <button type="button" className="btn" disabled={busy} onClick={onReset}>
        <RotateCcw size={16} aria-hidden /> Reiniciar
      </button>
    </div>
  )
}
