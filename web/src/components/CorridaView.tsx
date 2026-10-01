import { useMemo } from 'react'
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Loader2,
  Play,
  RotateCcw,
} from 'lucide-react'
import type { Corrida, DimensionNombre, ItemCorrida, RecomendacionValor, Salida } from '../types'
import { DIMENSION_ORDER } from '../types'
import {
  ETAPAS_CORRIDA,
  TOTAL_ETAPAS,
  contarRecomendaciones,
  countsEmbudo,
  resumenTrasEtapa,
} from '../etapas'
import { origenLabel } from '../corridasStore'
import { bandLabel, dimensionLabel, repoFromIdOrUrl } from '../labels'
import { RecommendationChip } from './RecommendationChip'

type Props = {
  corrida: Corrida
  busy: boolean
  processingItemId: string | null
  stageBanner: { titulo: string; detalle: string } | null
  computingSalidas: boolean
  onBack: () => void
  onPrimary: () => void
  onEjecutarTodas: () => void
  onReiniciar: () => void
  onOpenPr: (itemId: string) => void
}

function dimCounts(salida: Salida, dim: DimensionNombre): { met: number; unmet: number } {
  const crits = salida.criteria.filter((c) => c.dimension === dim)
  let met = 0
  let unmet = 0
  for (const c of crits) {
    if (c.level === 'cumple') met++
    else unmet++
  }
  return { met, unmet }
}

function titleLines(title: string): string {
  return title
}

export function CorridaView({
  corrida,
  busy,
  processingItemId,
  stageBanner,
  computingSalidas,
  onBack,
  onPrimary,
  onEjecutarTodas,
  onReiniciar,
  onOpenPr,
}: Props) {
  const etapa = corrida.etapaActual
  const iniciada = Boolean(corrida.iniciadaEn)
  const completada = etapa >= TOTAL_ETAPAS
  const nextEtapa = completada ? null : ETAPAS_CORRIDA[iniciada ? etapa : 0]

  const salidas = useMemo(() => corrida.items.map((i) => i.salida), [corrida.items])
  const embudo = useMemo(() => countsEmbudo(etapa, salidas), [etapa, salidas])
  const recs = useMemo(
    () => (etapa >= 4 ? contarRecomendaciones(salidas) : null),
    [etapa, salidas],
  )

  const primaryLabel = !iniciada
    ? 'Iniciar corrida'
    : completada
      ? 'Corrida completada'
      : `Ejecutar etapa ${nextEtapa!.num}: ${nextEtapa!.shortName}`

  const cola = useMemo(() => {
    if (etapa < 5) return []
    return corrida.items
      .filter((i) => i.salida?.admissibility.outcome === 'admisible')
      .sort((a, b) => (b.salida?.priority.score ?? 0) - (a.salida?.priority.score ?? 0))
  }, [corrida.items, etapa])

  function downloadRegistro() {
    const payload = {
      id: corrida.id,
      nombre: corrida.nombre,
      creadaEn: corrida.creadaEn,
      origen: corrida.origen,
      modoEjecucion: corrida.modoEjecucion,
      etapaActual: corrida.etapaActual,
      iniciadaEn: corrida.iniciadaEn,
      finalizadaEn: corrida.finalizadaEn,
      items: corrida.items.map((i) => ({
        id: i.id,
        entrada: i.entrada,
        salida: i.salida ?? null,
        etapaAlcanzada: i.etapaAlcanzada,
      })),
      decisiones: corrida.decisiones ?? {},
      exportadoEn: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `registro-${corrida.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="corrida-view">
      <nav className="breadcrumb">
        <button type="button" className="link-btn" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden /> Corridas
        </button>
        <span className="breadcrumb-sep" aria-hidden>
          /
        </span>
        <span>{corrida.nombre}</span>
      </nav>

      <header className="corrida-header">
        <div className="corrida-header-text">
          <h2>{corrida.nombre}</h2>
          <p className="muted">
            {origenLabel(corrida.origen)}, {corrida.items.length} PR, modo{' '}
            <span className={`modo-pill modo-pill-${corrida.modoEjecucion}`}>
              {corrida.modoEjecucion === 'real' ? 'real' : 'simulado'}
            </span>
          </p>
        </div>
        <div className="corrida-header-actions">
          <button
            type="button"
            className="btn btn-primary btn-exec"
            disabled={busy || computingSalidas || completada}
            onClick={onPrimary}
          >
            {busy || computingSalidas ? (
              <Loader2 size={16} className="spin" aria-hidden />
            ) : (
              <Play size={16} aria-hidden />
            )}
            {computingSalidas ? 'Calculando salidas…' : primaryLabel}
          </button>
          {iniciada && !completada && (
            <button
              type="button"
              className="link-exec-all"
              disabled={busy || computingSalidas}
              onClick={onEjecutarTodas}
            >
              Ejecutar todas las etapas
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={busy || computingSalidas || (!iniciada && etapa === 0)}
            onClick={onReiniciar}
          >
            <RotateCcw size={16} aria-hidden /> Reiniciar corrida
          </button>
        </div>
      </header>

      <ol className="etapa-stepper" aria-label="Etapas de la corrida">
        {ETAPAS_CORRIDA.map((e) => {
          let cls = 'etapa-step'
          if (etapa >= e.num) cls += ' done'
          else if (iniciada && etapa + 1 === e.num) cls += ' next'
          return (
            <li key={e.id} className={cls}>
              <span className="etapa-num">E{e.num}</span>
              <span className="etapa-name">{e.shortName}</span>
            </li>
          )
        })}
      </ol>

      <div className="embudo" aria-label="Embudo de la corrida">
        <div className="embudo-step">
          <strong>{embudo.recibidos}</strong>
          <span>PR recibidos</span>
        </div>
        <span className="embudo-arrow" aria-hidden>
          →
        </span>
        <div className={`embudo-step${etapa < 1 ? ' dim' : ''}`}>
          <strong>{etapa >= 1 ? embudo.admisibles : '-'}</strong>
          <span>Admisibles</span>
        </div>
        <span className="embudo-arrow" aria-hidden>
          →
        </span>
        <div className={`embudo-step${etapa < 3 ? ' dim' : ''}`}>
          <strong>{etapa >= 3 ? embudo.analizados : '-'}</strong>
          <span>Analizados</span>
        </div>
        <span className="embudo-arrow" aria-hidden>
          →
        </span>
        <div className={`embudo-step${etapa < 4 ? ' dim' : ''}`}>
          <strong>{etapa >= 4 ? embudo.conRecomendacion : '-'}</strong>
          <span>Con recomendación</span>
        </div>
      </div>

      {recs && (
        <div className="rec-distribution" aria-label="Distribución de recomendaciones">
          {(
            [
              'aprobar',
              'rechazar',
              'ajustar_monto',
              'derivar_revision_humana',
            ] as RecomendacionValor[]
          ).map((k) =>
            recs[k] > 0 ? (
              <span key={k} className="corrida-rec-count">
                <RecommendationChip value={k} />
                <span className="rec-n">{recs[k]}</span>
              </span>
            ) : null,
          )}
        </div>
      )}

      {stageBanner && (
        <div className="stage-banner" role="status">
          <strong>{stageBanner.titulo}</strong>
          <p>{stageBanner.detalle}</p>
        </div>
      )}

      <div className="pr-table-wrap">
        <table className="pr-table">
          <thead>
            <tr>
              <th>PR</th>
              {etapa >= 1 && <th>Validez</th>}
              {etapa >= 2 && <th>Volumen real</th>}
              {etapa >= 3 && <th>Dimensiones</th>}
              {etapa >= 4 && <th>Recomendación</th>}
              {etapa >= 4 && <th>Confianza</th>}
              {etapa >= 4 && <th>Prioridad</th>}
            </tr>
          </thead>
          <tbody>
            {corrida.items.map((item) => (
              <PrRow
                key={item.id}
                item={item}
                etapa={etapa}
                processing={processingItemId === item.id}
                onOpen={() => onOpenPr(item.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {etapa >= 5 && (
        <section className="cola-humana">
          <div className="cola-humana-head">
            <h3>Cola de revisión humana</h3>
            <button type="button" className="btn" onClick={downloadRegistro}>
              <Download size={16} aria-hidden /> Descargar registro de la corrida (JSON)
            </button>
          </div>
          <p className="muted">
            Ordenada por prioridad. La decisión la confirma una persona revisora.
          </p>
          <ul className="cola-humana-list">
            {cola.map((item, idx) => {
              const s = item.salida!
              const decided = Boolean(corrida.decisiones?.[item.id])
              return (
                <li key={item.id} className="cola-humana-item">
                  <span className="cola-rank">{idx + 1}</span>
                  <div className="cola-humana-info">
                    <strong>{item.entrada.context.title ?? item.id}</strong>
                    <span className="muted">
                      Prioridad {s.priority.score}, confianza {bandLabel(s.confidence.band)}
                      {decided ? ', decisión registrada' : ''}
                    </span>
                  </div>
                  <RecommendationChip value={s.recommendation.value} />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => onOpenPr(item.id)}
                  >
                    Revisar
                  </button>
                </li>
              )
            })}
            {cola.length === 0 && (
              <li className="muted">No hay PR admisibles en la cola.</li>
            )}
          </ul>
        </section>
      )}
    </div>
  )
}

function PrRow({
  item,
  etapa,
  processing,
  onOpen,
}: {
  item: ItemCorrida
  etapa: number
  processing: boolean
  onOpen: () => void
}) {
  const salida = item.salida
  const title = titleLines(item.entrada.context.title ?? item.id)
  const repo = repoFromIdOrUrl(item.id, item.entrada.context.prUrl)
  const prUrl = item.entrada.context.prUrl
  const noAdm = salida?.admissibility.outcome === 'no_admisible'
  const stopped = salida?.admissibility.stoppedAt
  const dimmed = etapa >= 1 && noAdm

  return (
    <tr
      className={`pr-row${dimmed ? ' pr-row-dim' : ''}${processing ? ' pr-row-processing' : ''}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      tabIndex={0}
      role="button"
    >
      <td className="pr-cell-title">
        <div className="pr-title-block">
          <span className="pr-title-text">{title}</span>
          <span className="pr-repo muted">{repo}</span>
        </div>
        {prUrl && (
          <a
            className="pr-ext-link"
            href={prUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Abrir PR en GitHub"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </td>

      {etapa >= 1 && (
        <td>
          {processing && item.etapaAlcanzada < 1 ? (
            <Loader2 size={16} className="spin" aria-label="Procesando" />
          ) : !salida ? (
            <span className="muted">-</span>
          ) : noAdm ? (
            <span className="validez-no">
              No admisible
              {stopped ? <span className="ca-fail"> {stopped}</span> : null}
            </span>
          ) : (
            <span className="validez-ok">Admisible</span>
          )}
        </td>
      )}

      {etapa >= 2 && (
        <td>
          {processing && item.etapaAlcanzada < 2 ? (
            <Loader2 size={16} className="spin" />
          ) : noAdm ? (
            <span className="detenido">Detenido en {stopped ?? 'CA'}</span>
          ) : salida ? (
            <span className="vol-real">
              {salida.fileClassification.realVolume.files} arch., +
              {salida.fileClassification.realVolume.additions}/-
              {salida.fileClassification.realVolume.deletions}
            </span>
          ) : (
            '-'
          )}
        </td>
      )}

      {etapa >= 3 && (
        <td>
          {processing && item.etapaAlcanzada < 3 ? (
            <Loader2 size={16} className="spin" />
          ) : noAdm ? (
            <span className="detenido">Detenido en {stopped ?? 'CA'}</span>
          ) : salida ? (
            <div className="dim-mini-chips">
              {DIMENSION_ORDER.map((d) => {
                const { met, unmet } = dimCounts(salida, d)
                return (
                  <span
                    key={d}
                    className={`dim-mini${unmet > 0 ? ' has-unmet' : ' all-met'}`}
                    title={`${dimensionLabel(d)}: ${met} cumplen, ${unmet} no`}
                  >
                    {dimensionLabel(d).slice(0, 3)} {met}/{met + unmet}
                  </span>
                )
              })}
            </div>
          ) : (
            '-'
          )}
        </td>
      )}

      {etapa >= 4 && (
        <td>
          {processing && item.etapaAlcanzada < 4 ? (
            <Loader2 size={16} className="spin" />
          ) : noAdm ? (
            <span className="detenido">Detenido en {stopped ?? 'CA'}</span>
          ) : salida ? (
            <RecommendationChip value={salida.recommendation.value} />
          ) : (
            '-'
          )}
        </td>
      )}

      {etapa >= 4 && (
        <td>
          {noAdm || !salida ? (
            <span className="muted">-</span>
          ) : (
            <span className={`band-tag band-${salida.confidence.band}`}>
              {Math.round(salida.confidence.score * 100)}% {bandLabel(salida.confidence.band)}
            </span>
          )}
        </td>
      )}

      {etapa >= 4 && (
        <td>
          {noAdm || !salida ? (
            <span className="muted">-</span>
          ) : (
            <span className="priority-cell">{salida.priority.score}</span>
          )}
        </td>
      )}
    </tr>
  )
}

/** Utilidad exportada para banners externos (p. ej. recorrido). */
export function bannerForEtapa(
  etapa: number,
  items: ItemCorrida[],
): { titulo: string; detalle: string } | null {
  return resumenTrasEtapa(
    etapa,
    items.map((i) => i.salida),
  )
}
