import { useState, type ReactNode, type RefObject } from 'react'
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  Download,
  Save,
  ExternalLink,
  Files,
  GitCommitHorizontal,
  MessageSquare,
  CircleDollarSign,
  Scissors,
  Loader2,
} from 'lucide-react'
import type {
  CasoRevision,
  Criterio,
  DecisionHumana,
  DimensionNombre,
  Entrada,
  ItemCola,
  NivelAceptacion,
  RecomendacionValor,
  ResultadoCA,
  Salida,
} from '../types'
import type { ManualStepId, RevealedStep } from '../steps'
import { stepDef } from '../steps'
import { DiffView } from './DiffView'
import { LevelBadge } from './LevelBadge'
import { RecommendationChip } from './RecommendationChip'
import {
  FuenteCell,
  FundamentosList,
  MarcoLine,
  RecommendationJustification,
} from './RecommendationDetails'
import {
  bandLabel,
  caResultLabel,
  dimensionTitle,
  formatCurrency,
  recommendationLabel,
  rewardLevelLabel,
  shortHash,
  supervisionLabel,
  supervisionScopeLabel,
} from '../labels'
import { modoDeSalida } from '../modoEjecucion'

const STORAGE_KEY = 'grantfox-revision-decisions'

function caIcon(result: ResultadoCA) {
  if (result === 'cumple')
    return <CheckCircle2 size={18} className="icon-inline" color="var(--level-cumple)" />
  if (result === 'no_cumple')
    return <XCircle size={18} className="icon-inline" color="var(--level-no)" />
  return <HelpCircle size={18} className="icon-inline" color="var(--level-evidencia)" />
}

function loadDecisions(): DecisionHumana[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DecisionHumana[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveDecision(record: DecisionHumana) {
  const all = loadDecisions().filter((d) => d.contributionId !== record.contributionId)
  all.push(record)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

function levelRank(level: NivelAceptacion): number {
  const order: Record<NivelAceptacion, number> = {
    no_cumple: 0,
    evidencia_insuficiente: 1,
    cumple_parcialmente: 2,
    cumple: 3,
  }
  return order[level]
}

function isUnmet(level: NivelAceptacion): boolean {
  return level === 'no_cumple' || level === 'evidencia_insuficiente' || level === 'cumple_parcialmente'
}

function countLevels(criteria: Criterio[]) {
  let cumplen = 0
  let parcial = 0
  let sinEvidencia = 0
  let noCumplen = 0
  for (const c of criteria) {
    if (c.level === 'cumple') cumplen++
    else if (c.level === 'cumple_parcialmente') parcial++
    else if (c.level === 'evidencia_insuficiente') sinEvidencia++
    else noCumplen++
  }
  return { cumplen, parcial, sinEvidencia, noCumplen }
}

function Verdict({
  ok,
  children,
}: {
  ok: boolean | 'warn'
  children: ReactNode
}) {
  const Icon = ok === true ? CheckCircle2 : ok === 'warn' ? AlertTriangle : XCircle
  const color =
    ok === true ? 'var(--level-cumple)' : ok === 'warn' ? 'var(--level-parcial)' : 'var(--level-no)'
  return (
    <p className={`verdict-line verdict-${ok === true ? 'ok' : ok === 'warn' ? 'warn' : 'fail'}`}>
      <Icon size={26} color={color} aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function CollapsibleBlock({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details className="collapse-block" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="collapse-body">{children}</div>
    </details>
  )
}

type PipelineProps = {
  item: ItemCola
  revealed: RevealedStep[]
  processingId: ManualStepId | null
  processingText: string
  lastPanelRef: RefObject<HTMLElement | null>
  /** Si se indica, la decisión humana se guarda en la corrida (no en la clave global). */
  corridaId?: string
  savedDecision?: DecisionHumana | null
  onSaveDecision?: (d: DecisionHumana) => void
}

export function StepPipeline({
  item,
  revealed,
  processingId,
  processingText,
  lastPanelRef,
  corridaId,
  savedDecision,
  onSaveDecision,
}: PipelineProps) {
  const omitCode = item.salida?.admissibility.stoppedAt ?? 'CA'
  const lastDoneIdx = (() => {
    for (let i = revealed.length - 1; i >= 0; i--) {
      if (revealed[i]!.status === 'done') return i
    }
    return -1
  })()

  return (
    <div className="pipeline timeline" aria-label="Pipeline de resultados">
      {revealed.map((r, idx) => {
        const isLast = idx === revealed.length - 1 && !processingId
        const def = stepDef(r.id)
        const isLatestDone = idx === lastDoneIdx && !processingId
        const collapsed = r.status === 'done' && !isLatestDone

        if (r.status === 'omitted') {
          return (
            <article
              key={r.id}
              className="pipeline-panel pipeline-omitted"
              ref={isLast ? lastPanelRef : undefined}
            >
              <div className="timeline-dot" aria-hidden />
              <header className="pipeline-panel-header">
                <span className="pipeline-step-num">{def.displayNum}</span>
                <h3>{def.name}</h3>
              </header>
              <p className="omit-row">Omitido: el análisis se detuvo en {omitCode}</p>
            </article>
          )
        }

        const body =
          r.id === 'entrada' ? (
            <EntradaPanel entrada={item.entrada} salida={item.salida} />
          ) : item.salida ? (
            <StepPanelBody
              caso={{ entrada: item.entrada, salida: item.salida }}
              stepId={r.id}
              corridaId={corridaId}
              savedDecision={savedDecision}
              onSaveDecision={onSaveDecision}
            />
          ) : (
            <p className="muted">Pendiente de calcular el análisis.</p>
          )

        return (
          <article
            key={r.id}
            className={`pipeline-panel${collapsed ? ' pipeline-collapsed' : ''}`}
            ref={isLast ? lastPanelRef : undefined}
          >
            <div className="timeline-dot" aria-hidden />
            <TimelineStep
              key={`${r.id}-${lastDoneIdx}`}
              displayNum={def.displayNum}
              name={def.name}
              initiallyOpen={isLatestDone}
            >
              {body}
            </TimelineStep>
          </article>
        )
      })}
      {processingId && (
        <article className="pipeline-panel pipeline-processing" ref={lastPanelRef}>
          <div className="timeline-dot timeline-dot-active" aria-hidden />
          <div className="processing-state">
            <Loader2 size={22} className="spin" aria-hidden />
            <p>{processingText}</p>
          </div>
        </article>
      )}
    </div>
  )
}

function TimelineStep({
  displayNum,
  name,
  initiallyOpen,
  children,
}: {
  displayNum: string
  name: string
  initiallyOpen: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <details
      className="pipeline-details"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="pipeline-panel-header">
        <span className="pipeline-step-num">{displayNum}</span>
        <h3>{name}</h3>
      </summary>
      {children}
    </details>
  )
}

function StepPanelBody({
  caso,
  stepId,
  corridaId,
  savedDecision,
  onSaveDecision,
}: {
  caso: CasoRevision
  stepId: ManualStepId
  corridaId?: string
  savedDecision?: DecisionHumana | null
  onSaveDecision?: (d: DecisionHumana) => void
}) {
  const def = stepDef(stepId)
  if (def.kind === 'entrada') return <EntradaPanel entrada={caso.entrada} salida={caso.salida} />
  if (def.kind === 'admisibilidad') return <AdmisibilidadPanel caso={caso} />
  if (def.kind === 'clasificacion') return <ClasificacionPanel caso={caso} />
  if (def.kind === 'dimension' && def.dimension)
    return <DimensionPanel caso={caso} dimension={def.dimension} />
  if (def.kind === 'agregacion') return <AgregacionPanel caso={caso} />
  if (def.kind === 'registro') return <RegistroPanel caso={caso} />
  return (
    <HumanReviewPanel
      key={`${corridaId ?? 'global'}-${caso.entrada.id}`}
      caso={caso}
      corridaId={corridaId}
      savedDecision={savedDecision}
      onSaveDecision={onSaveDecision}
    />
  )
}

function EntradaPanel({ entrada, salida }: { entrada: Entrada; salida: Salida | null }) {
  const ctx = entrada.context
  const amount = entrada.requested_amount ?? salida?.reward.requestedAmount ?? 0
  const files = ctx.fileStats ?? []
  const fileCount = files.length
  const adds = files.reduce((s, f) => s + (f.additions ?? 0), 0)
  const dels = files.reduce((s, f) => s + (f.deletions ?? 0), 0)
  const hasIssue = Boolean(ctx.linkedIssueTitle || ctx.linkedIssueBody)

  return (
    <div className="step-body">
      <Verdict ok="warn">
        Entrada lista: {fileCount} archivo{fileCount === 1 ? '' : 's'},{' '}
        {formatCurrency(amount)}
        {ctx.truncated ? ', diff truncado' : ''}
      </Verdict>
      <h4 className="entrada-title">{ctx.title ?? 'Sin título'}</h4>
      {ctx.prUrl ? (
        <a
          className="btn btn-primary btn-pr-link"
          href={ctx.prUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={16} /> Ver PR en GitHub
        </a>
      ) : (
        <p className="muted">Sin enlace a GitHub</p>
      )}

      <div className="stat-tiles">
        <div className="stat-tile">
          <Files size={18} aria-hidden />
          <span className="stat-value">{fileCount}</span>
          <span className="stat-label">Archivos</span>
        </div>
        <div className="stat-tile">
          <GitCommitHorizontal size={18} aria-hidden />
          <span className="stat-value">
            <span className="diff-add-count">+{adds}</span>{' '}
            <span className="diff-del-count">-{dels}</span>
          </span>
          <span className="stat-label">Líneas</span>
        </div>
        <div className="stat-tile">
          <CheckCircle2 size={18} aria-hidden />
          <span className="stat-value">{ctx.ciConclusion ?? 'unknown'}</span>
          <span className="stat-label">CI</span>
        </div>
        <div className="stat-tile">
          <MessageSquare size={18} aria-hidden />
          <span className="stat-value">{ctx.reviewCommentCount ?? 0}</span>
          <span className="stat-label">Comentarios</span>
        </div>
        <div className="stat-tile">
          <CircleDollarSign size={18} aria-hidden />
          <span className="stat-value">{formatCurrency(amount)}</span>
          <span className="stat-label">Monto solicitado</span>
        </div>
        <div className="stat-tile">
          <Scissors size={18} aria-hidden />
          <span className="stat-value">{ctx.truncated ? 'Sí' : 'No'}</span>
          <span className="stat-label">Truncado</span>
        </div>
      </div>

      <CollapsibleBlock title="Cuerpo de la solicitud">
        <p className="prewrap">{ctx.body ?? 'Sin cuerpo'}</p>
      </CollapsibleBlock>
      <CollapsibleBlock title="Tarea vinculada">
        {hasIssue ? (
          <>
            <p>
              <strong>{ctx.linkedIssueTitle ?? 'Sin título'}</strong>
            </p>
            <p className="prewrap">{ctx.linkedIssueBody ?? 'Sin descripción'}</p>
          </>
        ) : (
          <p className="muted">No se encontró un issue vinculado.</p>
        )}
      </CollapsibleBlock>
      <h4>Diff y archivos</h4>
      <DiffView diff={ctx.diff ?? ''} fileStats={files} collapsedDefault />
    </div>
  )
}

function AdmisibilidadPanel({ caso }: { caso: CasoRevision }) {
  const adm = caso.salida.admissibility
  const conditions = adm.conditions
  const verificables = conditions.filter((c) => c.result !== 'no_verificable')
  const cumplen = verificables.filter((c) => c.result === 'cumple').length
  const ok = adm.outcome === 'admisible'
  const fail = conditions.find((c) => c.result === 'no_cumple')

  return (
    <div className="step-body">
      <Verdict ok={ok}>
        {ok
          ? `Admisible: ${cumplen} de ${verificables.length} condiciones verificables cumplen`
          : `No admisible: falla ${fail?.code ?? adm.stoppedAt ?? 'CA'}, ${cumplen} de ${verificables.length} condiciones verificables cumplen`}
      </Verdict>
      {!ok && adm.stoppedAt && (
        <p className="muted">Detenido en {adm.stoppedAt}
          {adm.version ? ` (versión ${adm.version})` : ''}</p>
      )}
      <table className="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Resultado</th>
            <th>Observado</th>
            <th>Fuente</th>
          </tr>
        </thead>
        <tbody>
          {conditions.map((c) => (
            <tr key={c.code} className={c.result === 'no_cumple' ? 'row-emphasis' : undefined}>
              <td>{c.code}</td>
              <td>
                {caIcon(c.result)} {caResultLabel(c.result)}
              </td>
              <td>{c.observed}</td>
              <td>
                <FuenteCell fuente={c.fuente} fuenteUrl={c.fuenteUrl} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ClasificacionPanel({ caso }: { caso: CasoRevision }) {
  const { entrada, salida } = caso
  const bt = salida.fileClassification.byType
  const types = [
    ['Código', bt.codigo],
    ['Pruebas', bt.pruebas],
    ['Documentación', bt.documentacion],
    ['Generado', bt.generado],
    ['Configuración', bt.configuracion],
  ] as const
  const maxBar = Math.max(1, ...types.map(([, n]) => n))
  const rv = salida.fileClassification.realVolume
  const excluded = salida.fileClassification.excludedFromVolume
  const raw = entrada.context.fileStats ?? []
  const rawLines = raw.reduce((s, f) => s + (f.additions ?? 0) + (f.deletions ?? 0), 0)
  const realLines = rv.additions + rv.deletions

  return (
    <div className="step-body">
      <Verdict ok="warn">
        Volumen real {realLines} de {rawLines || realLines} líneas
        {excluded.length > 0
          ? `, ${excluded.length} archivo${excluded.length === 1 ? '' : 's'} generado${excluded.length === 1 ? '' : 's'} excluido${excluded.length === 1 ? '' : 's'}`
          : ''}
      </Verdict>
      <div className="bar-chart">
        {types.map(([label, count]) => (
          <div key={label} className="bar-row">
            <span>{label}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(count / maxBar) * 100}%` }} />
            </div>
            <span>{count}</span>
          </div>
        ))}
      </div>
      <p className="muted">
        Volumen real: {rv.files} archivos, +{rv.additions} / -{rv.deletions} líneas.
      </p>
      {excluded.length > 0 && (
        <>
          <h4>Excluidos del volumen</h4>
          <ul>
            {excluded.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      )}
      {salida.fileClassification.porArchivo &&
        salida.fileClassification.porArchivo.length > 0 && (
          <>
            <h4>Por archivo</h4>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ruta</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {salida.fileClassification.porArchivo.map((a) => (
                  <tr key={a.path}>
                    <td>{a.path}</td>
                    <td>{a.tipo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
    </div>
  )
}

function DimensionPanel({
  caso,
  dimension,
}: {
  caso: CasoRevision
  dimension: DimensionNombre
}) {
  const { salida } = caso
  const criteria = [...salida.criteria.filter((c) => c.dimension === dimension)].sort(
    (a, b) => levelRank(a.level) - levelRank(b.level),
  )
  const counts = countLevels(criteria)
  const dimInfo = salida.dimensions.find((d) => d.dimension === dimension)
  const hasIssues = counts.parcial + counts.sinEvidencia + counts.noCumplen > 0

  return (
    <div className="step-body">
      <Verdict ok={hasIssues ? 'warn' : true}>
        {counts.cumplen} cumplen, {counts.parcial} parcial, {counts.sinEvidencia} sin evidencia
        {counts.noCumplen > 0 ? `, ${counts.noCumplen} no cumplen` : ''}
      </Verdict>
      {dimInfo && <p className="dim-assessment">{dimInfo.assessment}</p>}

      <div className="criteria-strip" aria-label={`Criterios de ${dimensionTitle(dimension)}`}>
        {criteria.map((c) => (
          <span key={c.code} className={`cr-chip level-${c.level}`} title={c.evidence}>
            {c.code}
          </span>
        ))}
      </div>

      <ul className="criteria-list">
        {criteria.map((c) => (
          <li
            key={c.code}
            className={`criteria-item${isUnmet(c.level) ? ' criteria-unmet' : ''}`}
          >
            <div className="criteria-item-head">
              <strong>{c.code}</strong>
              <LevelBadge level={c.level} />
              {c.file && (
                <span className="muted">
                  {c.file}
                  {c.line != null ? `:${c.line}` : ''}
                </span>
              )}
            </div>
            <p>{c.evidence}</p>
            {c.marco && <MarcoLine marco={c.marco} url={c.marcoUrl} />}
            {c.fragment && (
              <details className="fragment-collapse">
                <summary>Ver fragmento</summary>
                <pre className="code-fragment">{c.fragment}</pre>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function AgregacionPanel({ caso }: { caso: CasoRevision }) {
  const { salida } = caso
  const conf = salida.confidence
  const scope = supervisionScopeLabel(conf.supervisionScope) || supervisionLabel(conf.supervision)

  return (
    <div className="step-body">
      <Verdict ok={salida.recommendation.value === 'aprobar' ? true : 'warn'}>
        Recomendación: {recommendationLabel(salida.recommendation.value)} con{' '}
        {(conf.score * 100).toFixed(0)}% de confianza
      </Verdict>
      <div className="card">
        <h4>Recompensa</h4>
        <p>
          Solicitado: {formatCurrency(salida.reward.requestedAmount)} (
          {rewardLevelLabel(salida.reward.requestedLevel)})
        </p>
        <p>
          Sugerido: {formatCurrency(salida.reward.suggestedAmount)} (
          {rewardLevelLabel(salida.reward.suggestedLevel)})
        </p>
        {salida.reward.levelMismatch && (
          <p>
            <AlertTriangle size={16} className="icon-inline" /> Desajuste entre nivel solicitado y
            sugerido
          </p>
        )}
      </div>
      <div className="card">
        <h4>Recomendación</h4>
        <p>
          <RecommendationChip value={salida.recommendation.value} />
        </p>
        <RecommendationJustification text={salida.recommendation.justification} />
        <FundamentosList salida={salida} />
        {salida.recommendation.supportingCriteria.length > 0 && (
          <p className="muted">
            Criterios de apoyo: {salida.recommendation.supportingCriteria.join(', ')}
          </p>
        )}
      </div>
      <div className="card">
        <h4>Confianza</h4>
        <p>
          Puntuación {(conf.score * 100).toFixed(0)}% ({bandLabel(conf.band)})
        </p>
        <div className="confidence-meter" aria-hidden>
          <div
            className="confidence-fill"
            style={{ width: `${Math.min(100, conf.score * 100)}%` }}
          />
        </div>
        <p>Supervisión: {scope}</p>
        {conf.reasons.length > 0 && (
          <ul>
            {conf.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="card">
        <h4>Prioridad</h4>
        <p>
          Puntuación {salida.priority.score}, criterios no satisfechos {salida.priority.unmetCount},
          severidad máxima {salida.priority.highestSeverity}
        </p>
      </div>
      {salida.automationSignals.length > 0 && (
        <div className="card">
          <h4>Señales de automatización</h4>
          <ul>
            {salida.automationSignals.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {salida.limits.length > 0 && (
        <>
          <h4>Límites del análisis</h4>
          <ul>
            {salida.limits.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function RegistroPanel({ caso }: { caso: CasoRevision }) {
  const { salida } = caso
  const modo = modoDeSalida(salida)
  const motorLabel =
    modo === 'real'
      ? `Motor: ${salida.model.version}`
      : 'Motor: reglas deterministas v1'
  return (
    <div className="step-body">
      <Verdict ok={modo === 'real' ? true : 'warn'}>{motorLabel}</Verdict>
      <p className={`modo-caso-indicator modo-caso-${modo}`} role="status">
        {motorLabel}
      </p>
      <dl className="meta-grid">
        <div>
          <dt>Modelo</dt>
          <dd>
            {salida.model.name} ({salida.model.version})
          </dd>
        </div>
        <div>
          <dt>Versión de instrucción</dt>
          <dd>{salida.instructionVersion}</dd>
        </div>
        <div>
          <dt>Hash de instrucción</dt>
          <dd>{shortHash(salida.execution.instructionHash)}</dd>
        </div>
        <div>
          <dt>Ejecutado</dt>
          <dd>{salida.executedAt}</dd>
        </div>
        <div>
          <dt>Duración</dt>
          <dd>{salida.execution.durationMs} ms</dd>
        </div>
        <div>
          <dt>Entrada truncada</dt>
          <dd>{salida.execution.truncatedInput ? 'Sí' : 'No'}</dd>
        </div>
      </dl>
    </div>
  )
}

function HumanReviewPanel({
  caso,
  corridaId,
  savedDecision,
  onSaveDecision,
}: {
  caso: CasoRevision
  corridaId?: string
  savedDecision?: DecisionHumana | null
  onSaveDecision?: (d: DecisionHumana) => void
}) {
  const { entrada, salida } = caso
  const requested = entrada.requested_amount ?? salida.reward.requestedAmount
  const [reviewerCode, setReviewerCode] = useState('REV-01')
  const [finalDecision, setFinalDecision] = useState<RecomendacionValor>(
    salida.recommendation.value,
  )
  const [approvedAmount, setApprovedAmount] = useState(String(requested))
  const [justification, setJustification] = useState('')
  const [saved, setSaved] = useState<DecisionHumana | null>(() => {
    if (savedDecision) return savedDecision
    if (onSaveDecision) return null
    return loadDecisions().find((d) => d.contributionId === entrada.id) ?? null
  })

  function handleSave() {
    const amount = Number.parseInt(approvedAmount, 10) || 0
    const record: DecisionHumana = {
      contributionId: entrada.id,
      corridaId,
      reviewerCode: reviewerCode.trim(),
      finalDecision,
      approvedAmount: amount,
      justification: justification.trim(),
      requestedAmount: requested,
      recommendation: salida.recommendation.value,
      matchesRecommendation: finalDecision === salida.recommendation.value,
      savedAt: new Date().toISOString(),
    }
    try {
      if (onSaveDecision) {
        onSaveDecision(record)
      } else {
        saveDecision(record)
      }
      setSaved(record)
    } catch {
      alert('No se pudo guardar en localStorage.')
    }
  }

  function downloadAll() {
    const data = onSaveDecision && saved ? [saved] : loadDecisions()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = corridaId
      ? `decisiones-${corridaId}.json`
      : 'decisiones-revision-demo.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const diff = saved ? saved.approvedAmount - saved.requestedAmount : 0

  return (
    <div className="step-body">
      <div className="banner-info">
        La decisión la toma una persona revisora (cláusulas 4B.2 y 13.4).
      </div>
      <p className="form-note">
        Demostración local: los datos se guardan solo en este navegador (localStorage). No se envía
        información a ningún servidor.
      </p>
      <div className="form-grid">
        <label>
          Código de revisor
          <input
            value={reviewerCode}
            onChange={(e) => setReviewerCode(e.target.value)}
            placeholder="REV-01"
          />
        </label>
        <label>
          Decisión final
          <select
            value={finalDecision}
            onChange={(e) => setFinalDecision(e.target.value as RecomendacionValor)}
          >
            {(['aprobar', 'rechazar', 'ajustar_monto', 'derivar_revision_humana'] as const).map(
              (v) => (
                <option key={v} value={v}>
                  {recommendationLabel(v)}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Monto aprobado (USDC)
          <input
            type="number"
            value={approvedAmount}
            onChange={(e) => setApprovedAmount(e.target.value)}
          />
        </label>
        <label>
          Justificación
          <textarea value={justification} onChange={(e) => setJustification(e.target.value)} />
        </label>
      </div>
      <div className="toolbar" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-primary" onClick={handleSave}>
          <Save size={16} /> Guardar decisión local
        </button>
        <button type="button" className="btn" onClick={downloadAll}>
          <Download size={16} /> Descargar todas las decisiones (JSON)
        </button>
      </div>
      {saved && (
        <div className="saved-record">
          <strong>Registro guardado</strong>
          <p>
            Revisor {saved.reviewerCode}, decisión {recommendationLabel(saved.finalDecision)}.
            Solicitado {formatCurrency(saved.requestedAmount)}, aprobado{' '}
            {formatCurrency(saved.approvedAmount)} (diferencia {formatCurrency(diff)}).
          </p>
          <p>
            Coincide con la recomendación del prototipo:{' '}
            {saved.matchesRecommendation ? 'Sí' : 'No'} (recomendación:{' '}
            {recommendationLabel(saved.recommendation)}).
          </p>
          {saved.justification && <p>Justificación: {saved.justification}</p>}
        </div>
      )}
    </div>
  )
}
