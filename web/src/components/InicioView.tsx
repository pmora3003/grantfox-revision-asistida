import { Compass, Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { Corrida, RecomendacionValor } from '../types'
import {
  DEMO_CORRIDA_ID,
  formatFechaCorta,
  origenLabel,
} from '../corridasStore'
import { etiquetaEstadoCorrida } from '../etapas'
import { contarRecomendaciones } from '../etapas'
import { recommendationLabel } from '../labels'
import { RecommendationChip } from './RecommendationChip'

type Props = {
  corridas: Corrida[]
  onAbrir: (id: string) => void
  onNueva: () => void
  onRecorrido: () => void
  onEliminar: (id: string) => void
  onRestablecerDemo: () => void
}

function estadoClass(etapa: number): string {
  if (etapa <= 0) return 'estado-sin'
  if (etapa >= 5) return 'estado-ok'
  return 'estado-curso'
}

export function InicioView({
  corridas,
  onAbrir,
  onNueva,
  onRecorrido,
  onEliminar,
  onRestablecerDemo,
}: Props) {
  return (
    <div className="inicio-view">
      <section className="inicio-hero">
        <div className="inicio-hero-text">
          <h2>Corridas de revisión</h2>
          <p>
            Organice lotes de solicitudes (corridas), ejecute el análisis por etapas y registre la
            supervisión humana.
          </p>
        </div>
        <div className="inicio-hero-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={onRecorrido}>
            <Compass size={18} aria-hidden /> Recorrido guiado
          </button>
          <button type="button" className="btn btn-lg" onClick={onNueva}>
            <Plus size={18} aria-hidden /> Nueva corrida
          </button>
        </div>
      </section>

      <div className="corridas-list" role="list">
        {corridas.map((c) => {
          const n = c.items.length
          const admisibles =
            c.etapaActual >= 1
              ? c.items.filter((i) => i.salida?.admissibility.outcome === 'admisible').length
              : null
          const recs =
            c.etapaActual >= 4
              ? contarRecomendaciones(c.items.map((i) => i.salida))
              : null
          const completed = c.etapaActual >= 5
          const isDemo = c.id === DEMO_CORRIDA_ID

          return (
            <article key={c.id} className="corrida-card" role="listitem">
              <div className="corrida-card-main">
                <div className="corrida-card-title-row">
                  <h3>{c.nombre}</h3>
                </div>
                <p className="corrida-card-meta muted">
                  {formatFechaCorta(c.creadaEn)}, {origenLabel(c.origen)}, {n} PR
                </p>
                <p className={`corrida-estado ${estadoClass(c.etapaActual)}`}>
                  {etiquetaEstadoCorrida(c.etapaActual)}
                </p>
                {completed && admisibles != null && (
                  <div className="corrida-summary">
                    <span className="corrida-summary-adm">
                      Admisibles {admisibles} de {n}
                    </span>
                    {recs && (
                      <div className="corrida-rec-pills">
                        {(
                          [
                            'aprobar',
                            'rechazar',
                            'ajustar_monto',
                            'derivar_revision_humana',
                          ] as RecomendacionValor[]
                        )
                          .filter((k) => recs[k] > 0)
                          .map((k) => (
                            <span key={k} className="corrida-rec-count">
                              <RecommendationChip value={k} />
                              <span className="rec-n">{recs[k]}</span>
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                )}
                {!completed && c.etapaActual >= 4 && recs && (
                  <div className="corrida-rec-pills">
                    {(Object.entries(recs) as [RecomendacionValor, number][])
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => (
                        <span key={k} className="corrida-rec-count" title={recommendationLabel(k)}>
                          <RecommendationChip value={k} />
                          <span className="rec-n">{v}</span>
                        </span>
                      ))}
                  </div>
                )}
              </div>
              <div className="corrida-card-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onAbrir(c.id)}
                >
                  Abrir
                </button>
                {isDemo ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={onRestablecerDemo}
                    title="Restablecer progreso de la corrida de demostración"
                  >
                    <RotateCcw size={15} aria-hidden /> Restablecer
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost btn-danger"
                    onClick={() => onEliminar(c.id)}
                    title="Eliminar corrida"
                  >
                    <Trash2 size={15} aria-hidden /> Eliminar
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {corridas.length === 0 && (
        <p className="empty-state-hint">No hay corridas. Cree una nueva o restaure la demo.</p>
      )}
    </div>
  )
}
