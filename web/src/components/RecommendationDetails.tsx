import type { NivelAceptacion, Salida } from '../types'
import { LevelBadge } from './LevelBadge'

const NIVEL_ACEPTACION: NivelAceptacion[] = [
  'cumple',
  'cumple_parcialmente',
  'no_cumple',
  'evidencia_insuficiente',
]

function isNivelAceptacion(n: string): n is NivelAceptacion {
  return (NIVEL_ACEPTACION as string[]).includes(n)
}

export function marcoUrlForCode(salida: Salida, code: string): string | null | undefined {
  const crit = salida.criteria.find((c) => c.code === code)
  if (crit?.marcoUrl) return crit.marcoUrl
  const cond = salida.admissibility.conditions.find((c) => c.code === code)
  if (cond?.fuenteUrl) return cond.fuenteUrl
  return null
}

export function MarcoLine({ marco, url }: { marco: string; url?: string | null }) {
  return (
    <p className="marco-line">
      Marco:{' '}
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {marco}
        </a>
      ) : (
        marco
      )}
    </p>
  )
}

export function FuenteCell({ fuente, fuenteUrl }: { fuente?: string; fuenteUrl?: string | null }) {
  if (!fuente) return <span className="muted">Sin fuente</span>
  if (fuenteUrl) {
    return (
      <a href={fuenteUrl} target="_blank" rel="noopener noreferrer">
        {fuente}
      </a>
    )
  }
  return <>{fuente}</>
}

function FundamentoLevel({ nivel }: { nivel: string }) {
  if (isNivelAceptacion(nivel)) return <LevelBadge level={nivel} />
  return <span className="level-badge">{nivel}</span>
}

export function FundamentosList({
  salida,
  compact = false,
}: {
  salida: Salida
  compact?: boolean
}) {
  const fundamentos = salida.recommendation.fundamentos
  if (!fundamentos?.length) return null

  if (compact) {
    return (
      <div className="fundamentos-block fundamentos-compact">
        <span className="fundamentos-heading">Fundamentos</span>
        <ul className="fundamentos-list">
          {fundamentos.map((f) => {
            const url = marcoUrlForCode(salida, f.code)
            return (
              <li key={`${f.code}-${f.evidencia}`}>
                <strong>{f.code}</strong>{' '}
                <FundamentoLevel nivel={f.nivel} />
                {', '}
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {f.marco}
                  </a>
                ) : (
                  f.marco
                )}
                {', '}
                <span className="muted">{f.evidencia}</span>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className="fundamentos-block">
      <h5>Fundamentos</h5>
      <ul className="fundamentos-list fundamentos-list-full">
        {fundamentos.map((f) => {
          const url = marcoUrlForCode(salida, f.code)
          return (
            <li key={`${f.code}-${f.evidencia}`} className="fundamento-item">
              <div className="fundamento-item-head">
                <strong>{f.code}</strong>
                <FundamentoLevel nivel={f.nivel} />
              </div>
              <p className="fundamento-marco">
                Marco:{' '}
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {f.marco}
                  </a>
                ) : (
                  f.marco
                )}
              </p>
              <p className="muted fundamento-evidencia">{f.evidencia}</p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function RecommendationJustification({ text }: { text: string }) {
  return <p className="recommendation-justification prewrap">{text}</p>
}
