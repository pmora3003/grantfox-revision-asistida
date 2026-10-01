import { Monitor, Moon, Sun } from 'lucide-react'
import type { ModoEjecucionSalida } from '../types'
import type { ThemePref } from '../theme'

type Props = {
  themePref: ThemePref
  onThemeChange: (p: ThemePref) => void
  /** Badge de modo de ejecución opcional (vista actual). */
  modoEjecucion?: ModoEjecucionSalida | null
  modelVersion?: string
  /** Texto corto de contexto (p. ej. nombre de corrida). */
  contextoBadge?: string
  onBrandClick?: () => void
}

export function Header({
  themePref,
  onThemeChange,
  modoEjecucion = null,
  modelVersion = '',
  contextoBadge,
  onBrandClick,
}: Props) {
  return (
    <header className="site-header">
      <div className="site-header-row">
        <div className="site-header-text">
          {onBrandClick ? (
            <button type="button" className="brand-link" onClick={onBrandClick}>
              <h1>Revisión asistida de contribuciones</h1>
            </button>
          ) : (
            <h1>Revisión asistida de contribuciones</h1>
          )}
          <p className="subtitle">
            Prototipo GrantFox. La recomendación no es vinculante y la confirma una persona
            revisora.
          </p>
        </div>
        <div className="theme-toggle" role="group" aria-label="Tema de color">
          <button
            type="button"
            className={`theme-btn${themePref === 'claro' ? ' active' : ''}`}
            onClick={() => onThemeChange('claro')}
            title="Tema claro"
            aria-pressed={themePref === 'claro'}
          >
            <Sun size={16} aria-hidden /> Claro
          </button>
          <button
            type="button"
            className={`theme-btn${themePref === 'oscuro' ? ' active' : ''}`}
            onClick={() => onThemeChange('oscuro')}
            title="Tema oscuro"
            aria-pressed={themePref === 'oscuro'}
          >
            <Moon size={16} aria-hidden /> Oscuro
          </button>
          <button
            type="button"
            className={`theme-btn${themePref === 'sistema' ? ' active' : ''}`}
            onClick={() => onThemeChange('sistema')}
            title="Seguir el sistema"
            aria-pressed={themePref === 'sistema'}
          >
            <Monitor size={16} aria-hidden /> Sistema
          </button>
        </div>
      </div>
      <div className="header-badges">
        {contextoBadge && <span className="badge-demo">{contextoBadge}</span>}
        {modoEjecucion === 'real' ? (
          <span className="badge-execution badge-execution-real">
            Análisis con modelo{modelVersion ? `: ${modelVersion}` : ''}
          </span>
        ) : modoEjecucion === 'simulado' ? (
          <span className="badge-execution badge-execution-simulado">
            Análisis simulado (sin API key)
          </span>
        ) : null}
      </div>
    </header>
  )
}
