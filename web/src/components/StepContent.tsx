import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  Download,
  Save,
} from 'lucide-react'
import type {
  CasoRevision,
  DecisionHumana,
  DimensionNombre,
  PasoProceso,
  RecomendacionValor,
  ResultadoCA,
} from '../types'
import { DIMENSION_ORDER } from '../types'
import { DiffView } from './DiffView'
import { LevelBadge } from './LevelBadge'
import { RecommendationChip } from './RecommendationChip'
import { AnalysisSubsteps } from './ProcessStepper'
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

const STORAGE_KEY = 'grantfox-revision-decisions'

function caIcon(result: ResultadoCA) {
  if (result === 'cumple') return <CheckCircle2 size={18} className="icon-inline" color="var(--level-cumple)" />
  if (result === 'no_cumple') return <XCircle size={18} className="icon-inline" color="var(--level-no)" />
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

type Props = {
  caso: CasoRevision
  activeStep: PasoProceso
  activeDimension: DimensionNombre | null
  stepsOmitted: boolean
  omitReason: string
}

export function StepContent({
  caso,
  activeStep,
  activeDimension,
  stepsOmitted,
  omitReason,
}: Props) {
  const { entrada, salida } = caso
  const ctx = entrada.context

  if (activeStep === 1) {
    const amount = entrada.requested_amount ?? salida.reward.requestedAmount
    return (
      <section className="step-panel">
        <h3>Entrada normalizada</h3>
        <dl className="meta-grid">
          <div>
            <dt>Título de la solicitud</dt>
            <dd>{ctx.title ?? 'No disponible'}</dd>
          </div>
          <div>
            <dt>Enlace</dt>
            <dd>
              {ctx.prUrl ? (
                <a href={ctx.prUrl} target="_blank" rel="noreferrer">
                  {ctx.prUrl}
                </a>
              ) : (
                'No disponible'
              )}
            </dd>
          </div>
          <div>
            <dt>Monto solicitado</dt>
            <dd>{formatCurrency(amount)}</dd>
          </div>
          <div>
            <dt>CI</dt>
            <dd>{ctx.ciConclusion ?? 'unknown'}</dd>
          </div>
          <div>
            <dt>Comentarios de revisión</dt>
            <dd>{ctx.reviewCommentCount ?? 0}</dd>
          </div>
          <div>
            <dt>Diff truncado</dt>
            <dd>{ctx.truncated ? 'Sí' : 'No'}</dd>
          </div>
        </dl>
        <h4>Cuerpo de la solicitud</h4>
        <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{ctx.body ?? ''}</p>
        <h4>Tarea vinculada</h4>
        <p>
          <strong>{ctx.linkedIssueTitle ?? 'Sin título'}</strong>
        </p>
        <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>{ctx.linkedIssueBody ?? ''}</p>
        <h4>Conjunto de diferencias</h4>
        <DiffView diff={ctx.diff ?? ''} />
      </section>
    )
  }

  if (activeStep === 2) {
    return (
      <section className="step-panel">
        <h3>Admisibilidad</h3>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
          Resultado: <strong>{salida.admissibility.outcome}</strong>
          {salida.admissibility.stoppedAt && (
            <> (detenido en {salida.admissibility.stoppedAt})</>
          )}
          {salida.admissibility.version && <> Versión {salida.admissibility.version}</>}
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Resultado</th>
              <th>Observado</th>
            </tr>
          </thead>
          <tbody>
            {salida.admissibility.conditions.map((c) => (
              <tr key={c.code}>
                <td>{c.code}</td>
                <td>
                  {caIcon(c.result)} {caResultLabel(c.result)}
                </td>
                <td>{c.observed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    )
  }

  if (activeStep === 3) {
    if (stepsOmitted) {
      return (
        <section className="step-panel">
          <h3>Clasificación de archivos</h3>
          <p className="omit-note">Omitido: {omitReason}</p>
        </section>
      )
    }
    const bt = salida.fileClassification.byType
    const types = [
      ['Código', bt.codigo],
      ['Pruebas', bt.pruebas],
      ['Documentación', bt.documentacion],
      ['Generado', bt.generado],
      ['Configuración', bt.configuracion],
    ] as const
    const maxBar = Math.max(1, ...types.map(([, n]) => n))
    const raw = ctx.fileStats ?? []
    const rawFiles = raw.length
    const rawAdd = raw.reduce((s, f) => s + (f.additions ?? 0), 0)
    const rawDel = raw.reduce((s, f) => s + (f.deletions ?? 0), 0)
    const rv = salida.fileClassification.realVolume
    return (
      <section className="step-panel">
        <h3>Clasificación de archivos</h3>
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
        <p style={{ fontSize: '0.88rem' }}>
          Volumen real: {rv.files} archivos, +{rv.additions} / -{rv.deletions} líneas. Totales
          brutos (fileStats): {rawFiles} archivos, +{rawAdd} / -{rawDel}.
        </p>
        {salida.fileClassification.excludedFromVolume.length > 0 && (
          <>
            <h4>Excluidos del volumen</h4>
            <ul>
              {salida.fileClassification.excludedFromVolume.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </>
        )}
        {salida.fileClassification.porArchivo && salida.fileClassification.porArchivo.length > 0 && (
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
      </section>
    )
  }

  if (activeStep === 4) {
    if (stepsOmitted) {
      return (
        <section className="step-panel">
          <h3>Análisis por dimensión</h3>
          <p className="omit-note">Omitido: {omitReason}</p>
        </section>
      )
    }
    return (
      <AnalysisPanel
        caso={caso}
        highlightDimension={activeDimension}
      />
    )
  }

  if (activeStep === 5) {
    const conf = salida.confidence
    const scope = supervisionScopeLabel(conf.supervisionScope) || supervisionLabel(conf.supervision)
    return (
      <section className="step-panel">
        <h3>Agregación</h3>
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
          <p>{salida.recommendation.justification}</p>
          {salida.recommendation.supportingCriteria.length > 0 && (
            <p style={{ fontSize: '0.85rem' }}>
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
            <div className="confidence-fill" style={{ width: `${Math.min(100, conf.score * 100)}%` }} />
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
      </section>
    )
  }

  if (activeStep === 6) {
    return (
      <section className="step-panel">
        <h3>Registro de ejecución</h3>
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
      </section>
    )
  }

  return (
    <HumanReviewPanel
      caso={caso}
    />
  )
}

function AnalysisPanel({
  caso,
  highlightDimension,
}: {
  caso: CasoRevision
  highlightDimension: DimensionNombre | null
}) {
  const [tab, setTab] = useState<DimensionNombre>(
    highlightDimension ?? 'cumplimiento_alcance',
  )
  useEffect(() => {
    if (highlightDimension) setTab(highlightDimension)
  }, [highlightDimension])

  const { salida } = caso
  const dimInfo = salida.dimensions.find((d) => d.dimension === tab)

  return (
    <section className="step-panel">
      <h3>Análisis por dimensión</h3>
      <AnalysisSubsteps activeDimension={highlightDimension ?? tab} />
      <div className="tabs">
        {DIMENSION_ORDER.map((d) => (
          <button
            key={d}
            type="button"
            className={`tab${tab === d ? ' active' : ''}`}
            onClick={() => setTab(d)}
          >
            {dimensionTitle(d)}
          </button>
        ))}
      </div>
      {dimInfo && (
        <div className="card">
          <p>{dimInfo.assessment}</p>
          {dimInfo.unmetCriteria.length > 0 && (
            <p style={{ fontSize: '0.85rem' }}>
              No satisfechos: {dimInfo.unmetCriteria.join(', ')}
            </p>
          )}
        </div>
      )}
      <table className="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nivel</th>
            <th>Evidencia</th>
            <th>Archivo</th>
            <th>Fragmento</th>
          </tr>
        </thead>
        <tbody>
          {salida.criteria
            .filter((c) => c.dimension === tab)
            .map((c) => (
              <tr key={c.code}>
                <td>{c.code}</td>
                <td>
                  <LevelBadge level={c.level} />
                </td>
                <td>{c.evidence}</td>
                <td>
                  {c.file ?? 'N/D'}
                  {c.line != null ? `:${c.line}` : ''}
                </td>
                <td>
                  {c.fragment ? <pre className="code-fragment">{c.fragment}</pre> : 'N/D'}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  )
}

function HumanReviewPanel({ caso }: { caso: CasoRevision }) {
  const { entrada, salida } = caso
  const requested = entrada.requested_amount ?? salida.reward.requestedAmount
  const [reviewerCode, setReviewerCode] = useState('REV-01')
  const [finalDecision, setFinalDecision] = useState<RecomendacionValor>(
    salida.recommendation.value,
  )
  const [approvedAmount, setApprovedAmount] = useState(String(requested))
  const [justification, setJustification] = useState('')
  const [saved, setSaved] = useState<DecisionHumana | null>(() => {
    return loadDecisions().find((d) => d.contributionId === entrada.id) ?? null
  })

  function handleSave() {
    const amount = Number.parseInt(approvedAmount, 10) || 0
    const record: DecisionHumana = {
      contributionId: entrada.id,
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
      saveDecision(record)
      setSaved(record)
    } catch {
      alert('No se pudo guardar en localStorage.')
    }
  }

  function downloadAll() {
    const data = loadDecisions()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'decisiones-revision-demo.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const diff = saved ? saved.approvedAmount - saved.requestedAmount : 0

  return (
    <section className="step-panel">
      <h3>Revisión humana</h3>
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
          Monto aprobado (USD)
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
    </section>
  )
}
