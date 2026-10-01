import { Monitor, Moon, Sun } from 'lucide-react'
import type { ItemCola } from '../types'
import { todosCasosEnModoReal } from '../modoEjecucion'
import { resumenFuentes } from '../colaPersistencia'
import type { ThemePref } from '../theme'

type Props = {
  items?: ItemCola[]
  themePref: ThemePref
  onThemeChange: (p: ThemePref) => void
}

export function Header({ items = [], themePref, onThemeChange }: Props) {
  const withSalida = items.filter((i) => i.salida)
  const allReal =
    withSalida.length > 0 &&
    todosCasosEnModoReal(withSalida.map((i) => ({ entrada: i.entrada, salida: i.salida! })))
  const modelVersion = withSalida[0]?.salida?.model.version ?? ''
  const fuenteSummary = resumenFuentes(items)

  return (
    <header className="site-header">
      <div className="site-header-row">
        <div className="site-header-text">
          <h1>Revisión asistida de contribuciones</h1>
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
        <span className="badge-demo">{fuenteSummary}</span>
        {withSalida.length > 0 &&
          (allReal ? (
            <span className="badge-execution badge-execution-real">
              Análisis con modelo{modelVersion ? `: ${modelVersion}` : ''}
            </span>
          ) : (
            <span className="badge-execution badge-execution-simulado">
              Análisis simulado (sin API key)
            </span>
          ))}
      </div>
    </header>
  )
}
