import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import type { Corrida, ItemCorrida, Salida } from '../types'
import { escala } from '../motor/config.generada'
import { loadTourStep, saveTourStep } from '../corridasStore'
import {
  bandLabel,
  formatCurrency,
  recommendationLabel,
  supervisionScopeLabel,
  supervisionLabel,
} from '../labels'
import { ResultCard } from './ResultCard'
import { LevelBadge } from './LevelBadge'

export const TOUR_TOTAL_STEPS = 8

type Metricas = {
  fecha: string
  modoEjecucion: string
  totalCasos: number
  excluidos: number
  acuerdoTotal: { aciertos: number; total: number; proporcion: number }
  admisibilidad: { aciertos: number; total: number }
  contenido: { aciertos: number; total: number }
  acuerdoNivel?: { aciertos: number; total: number }
  duracionMs: { mediana: number; p90: number; min: number; max: number }
  calibracion: Record<string, { casos: number; aciertos: number }>
}

type Props = {
  tourCorrida: Corrida
  onSalir: () => void
  onAbrirPr: (itemId: string) => void
  /** Si se abrió un detalle desde el tour, mostrar pastilla flotante. */
  tourPaused?: boolean
  onVolverAlRecorrido?: () => void
}

const PIPELINE_STEPS = [
  { n: 1, name: 'Normalizador de entrada', kind: 'code' as const },
  { n: 2, name: 'Admisibilidad (CA-001 a CA-004)', kind: 'code' as const },
  { n: 3, name: 'Clasificador de archivos', kind: 'code' as const },
  { n: 4, name: 'Análisis de criterios', kind: 'llm' as const },
  { n: 5, name: 'Agregador', kind: 'code' as const },
  { n: 6, name: 'Registro de la ejecución', kind: 'code' as const },
  { n: 7, name: 'Presentación a la persona revisora', kind: 'ui' as const },
]

function CriteriaStrip({ salida }: { salida: Salida }) {
  const sample = salida.criteria.slice(0, 12)
  return (
    <div className="criteria-strip" aria-label="Muestra de criterios">
      {sample.map((c) => (
        <span key={c.code} className="criteria-strip-item">
          <code>{c.code}</code>
          <LevelBadge level={c.level} />
        </span>
      ))}
      {salida.criteria.length > sample.length && (
        <span className="muted">+{salida.criteria.length - sample.length} más</span>
      )}
    </div>
  )
}

function pickHighestPriorityAdmissible(items: ItemCorrida[]): ItemCorrida | null {
  const adm = items.filter((i) => i.salida?.admissibility.outcome === 'admisible' && i.salida)
  if (adm.length === 0) return null
  return [...adm].sort(
    (a, b) => (b.salida!.priority.score ?? 0) - (a.salida!.priority.score ?? 0),
  )[0]!
}

export function RecorridoGuiado({
  tourCorrida,
  onSalir,
  onAbrirPr,
  tourPaused,
  onVolverAlRecorrido,
}: Props) {
  const [step, setStep] = useState(() => Math.min(loadTourStep(), TOUR_TOTAL_STEPS - 1))
  const [metricas, setMetricas] = useState<Metricas | null>(null)
  const [metricasError, setMetricasError] = useState<string | null>(null)

  useEffect(() => {
    saveTourStep(step)
  }, [step])

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}metricas.json`
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: Metricas) => setMetricas(data))
      .catch((e: Error) => setMetricasError(e.message ?? 'Error al cargar métricas'))
  }, [])

  const go = useCallback(
    (delta: number) => {
      setStep((s) => Math.min(TOUR_TOTAL_STEPS - 1, Math.max(0, s + delta)))
    },
    [],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (tourPaused) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        go(1)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        go(-1)
      } else if (e.key === 'Escape') {
        onSalir()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onSalir, tourPaused])

  const highlight = useMemo(
    () => pickHighestPriorityAdmissible(tourCorrida.items),
    [tourCorrida],
  )

  if (tourPaused) {
    return (
      <button
        type="button"
        className="tour-return-pill"
        onClick={onVolverAlRecorrido}
      >
        Volver al recorrido
      </button>
    )
  }

  return (
    <div className="recorrido-view">
      <header className="recorrido-top">
        <button type="button" className="btn btn-ghost" onClick={onSalir}>
          <X size={16} aria-hidden /> Salir
        </button>
        <div className="recorrido-dots" role="tablist" aria-label="Pasos del recorrido">
          {Array.from({ length: TOUR_TOTAL_STEPS }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === step}
              className={`recorrido-dot${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}
              onClick={() => setStep(i)}
              aria-label={`Paso ${i + 1}`}
            />
          ))}
        </div>
        <span className="recorrido-step-label muted">
          {step + 1} / {TOUR_TOTAL_STEPS}
        </span>
      </header>

      <article className="recorrido-slide" key={step}>
        {step === 0 && (
          <>
            <h2>El problema</h2>
            <p>
              En GrantFox la operación se organiza en campañas de quince días. En las tres campañas
              de 2026 el volumen se mantuvo por encima de las veinticinco mil solicitudes de
              integración por campaña, con entre 1 400 y 1 600 solicitudes de presupuesto que llegan
              efectivamente a revisión.
            </p>
            <p>
              Hay seis perfiles internos; cada uno dedica entre 25 y 30 horas por campaña. Revisar
              una contribución toma entre 4 y 20 minutos. La organización publica once criterios de
              evaluación en términos generales, sin evidencia observable asociada, sin niveles de
              aceptación y sin registro de su aplicación. No existe una rúbrica escrita de montos.
            </p>
          </>
        )}

        {step === 1 && (
          <>
            <h2>Qué hace y qué no hace el prototipo</h2>
            <p>
              El prototipo asiste la revisión: admisibilidad, clasificación, valoración de criterios,
              recomendación no vinculante, confianza, prioridad y registro de ejecución.
            </p>
            <ul className="recorrido-limits">
              <li>
                <strong>No decide.</strong> No aprueba, no rechaza y no modifica montos. Toda salida
                es insumo para una persona revisora (cláusulas 4B.2 y 13.4 de los Términos y
                Condiciones).
              </li>
              <li>
                <strong>No se conecta a sistemas productivos.</strong> Opera en un entorno
                controlado, sin efecto sobre datos reales ni recompensas.
              </li>
              <li>No juzga a la persona contribuidora ni afirma quién produjo la entrega.</li>
              <li>
                No inventa: si el insumo falta o no permite comparar, el criterio queda en Evidencia
                insuficiente.
              </li>
            </ul>
          </>
        )}

        {step === 2 && (
          <>
            <h2>La matriz</h2>
            <p>
              Cinco condiciones de admisibilidad (CA-001 a CA-005) y veintitrés criterios en cuatro
              dimensiones: alcance (5), calidad técnica (7), riesgos de seguridad (6) y
              proporcionalidad (5). Cada criterio usa uno de cuatro niveles de aceptación: Cumple,
              Cumple parcialmente, No cumple, Evidencia insuficiente.
            </p>
            <h3>Escala de recompensa (USDC)</h3>
            <ul className="escala-list">
              {escala.niveles.map((n) => (
                <li key={n.nombre}>
                  <strong>{n.nombre}</strong>:{' '}
                  {n.maximo == null
                    ? `desde ${formatCurrency(n.minimo)} (techo observado ${formatCurrency(escala.techo_observado)})`
                    : `${formatCurrency(n.minimo)} a ${formatCurrency(n.maximo)}`}
                </li>
              ))}
            </ul>
          </>
        )}

        {step === 3 && (
          <>
            <h2>La arquitectura</h2>
            <p>
              Siete pasos en pipeline. Los pasos 1, 2, 3, 5 y 6 son código ordinario. El paso 4 es el
              único que necesita el modelo de lenguaje.
            </p>
            <ol className="pipeline-diagram">
              {PIPELINE_STEPS.map((s) => (
                <li
                  key={s.n}
                  className={`pipeline-diagram-item kind-${s.kind}`}
                >
                  <span className="pipeline-diagram-num">[{s.n}]</span>
                  <span className="pipeline-diagram-name">{s.name}</span>
                  <span className="pipeline-diagram-kind">
                    {s.kind === 'llm'
                      ? 'Modelo de lenguaje'
                      : s.kind === 'ui'
                        ? 'Interfaz'
                        : 'Código determinista'}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}

        {step === 4 && (
          <>
            <h2>Un PR en detalle</h2>
            {highlight?.salida ? (
              <>
                <p>
                  Tomamos el PR admisible de mayor prioridad en la corrida:{' '}
                  <strong>{highlight.entrada.context.title ?? highlight.id}</strong>.
                </p>
                <ResultCard salida={highlight.salida} />
                <h3>Criterios (muestra)</h3>
                <CriteriaStrip salida={highlight.salida} />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onAbrirPr(highlight.id)}
                >
                  Abrir detalle del PR
                </button>
              </>
            ) : (
              <p className="muted">
                Ejecute al menos la etapa de admisibilidad en la corrida (desde la
                pantalla de inicio) para ver un PR destacado.
              </p>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <h2>Supervisión humana y trazabilidad</h2>
            <p>
              El nivel de confianza determina el grado de supervisión humana, nunca si la hay.
            </p>
            <table className="data-table tour-table">
              <thead>
                <tr>
                  <th>Tramo</th>
                  <th>Rango</th>
                  <th>Supervisión</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Alto</td>
                  <td>≥ 0,90</td>
                  <td>Confirmación</td>
                </tr>
                <tr>
                  <td>Medio</td>
                  <td>0,70 a 0,89</td>
                  <td>Revisión de criterios no satisfechos</td>
                </tr>
                <tr>
                  <td>Bajo</td>
                  <td>&lt; 0,70</td>
                  <td>Revisión detallada del análisis completo</td>
                </tr>
              </tbody>
            </table>
            <p>
              Cada decisión humana queda registrada (revisor, decisión final, monto aprobado,
              justificación y si coincide con la recomendación). La corrida exporta un registro JSON
              con salidas, marcas de tiempo y decisiones.
            </p>
            {highlight?.salida && (
              <p className="muted">
                Ejemplo: confianza {bandLabel(highlight.salida.confidence.band)} (
                {Math.round(highlight.salida.confidence.score * 100)}%), supervisión{' '}
                {supervisionScopeLabel(highlight.salida.confidence.supervisionScope) ||
                  supervisionLabel(highlight.salida.confidence.supervision)}
                , recomendación {recommendationLabel(highlight.salida.recommendation.value)}.
              </p>
            )}
          </>
        )}

        {step === 6 && (
          <>
            <h2>Evaluación</h2>
            {metricasError && (
              <p className="form-error">No se pudo cargar metricas.json: {metricasError}</p>
            )}
            {!metricas && !metricasError && <p className="loading">Cargando métricas…</p>}
            {metricas && (
              <>
                <p>
                  Modo de ejecución de la evaluación:{' '}
                  <span className={`modo-pill modo-pill-${metricas.modoEjecucion}`}>
                    {metricas.modoEjecucion}
                  </span>
                  {metricas.modoEjecucion === 'reglas' && (
                    <>
                      . Las cifras de análisis de contenido provienen de la simulación heurística; la
                      corrida con modelo de lenguaje está pendiente.
                    </>
                  )}
                </p>
                <ul className="metricas-list">
                  <li>
                    Acuerdo total: {metricas.acuerdoTotal.aciertos} de {metricas.acuerdoTotal.total}{' '}
                    ({(metricas.acuerdoTotal.proporcion * 100).toFixed(1)}%)
                  </li>
                  <li>
                    Admisibilidad: {metricas.admisibilidad.aciertos} de{' '}
                    {metricas.admisibilidad.total}
                  </li>
                  <li>
                    Contenido: {metricas.contenido.aciertos} de {metricas.contenido.total}
                  </li>
                  <li>
                    Duración (ms): mediana {metricas.duracionMs.mediana}, p90{' '}
                    {metricas.duracionMs.p90} (frente a 4 a 20 minutos de revisión manual)
                  </li>
                </ul>
                <h3>Calibración por banda de confianza</h3>
                <ul className="metricas-list">
                  {(['alto', 'medio', 'bajo'] as const).map((b) => {
                    const row = metricas.calibracion[b]
                    if (!row) return null
                    return (
                      <li key={b}>
                        {bandLabel(b)}: {row.aciertos} aciertos en {row.casos} casos
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </>
        )}

        {step === 7 && (
          <>
            <h2>Límites y siguientes pasos</h2>
            <p>Todavía no está definido (y el prototipo no lo inventa):</p>
            <ol>
              <li>Los criterios mínimos aceptables por dimensión.</li>
              <li>Los umbrales del nivel de confianza (la propuesta actual se calibra con casos).</li>
              <li>El peso relativo de cada criterio.</li>
              <li>El modelo de lenguaje que se va a utilizar en producción.</li>
              <li>La fórmula exacta del valor de prioridad.</li>
            </ol>
            <p>
              El prototipo enumera de forma expresa lo que no alcanza a resolver con los insumos
              recibidos, no se conecta a sistemas productivos y no sustituye la revisión humana.
            </p>
          </>
        )}
      </article>

      <footer className="recorrido-nav">
        <button
          type="button"
          className="btn"
          disabled={step === 0}
          onClick={() => go(-1)}
        >
          <ArrowLeft size={16} aria-hidden /> Anterior
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={step >= TOUR_TOTAL_STEPS - 1}
          onClick={() => go(1)}
        >
          Siguiente <ArrowRight size={16} aria-hidden />
        </button>
      </footer>
    </div>
  )
}

