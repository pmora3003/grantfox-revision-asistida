import { Info } from 'lucide-react'

export function Footer() {
  return (
    <footer className="site-footer">
      <p>
        Este prototipo no se conecta a sistemas productivos, no aprueba pagos ni modifica montos en
        la plataforma. Opera solo como demostración del flujo de análisis asistido.
      </p>
      <details className="footer-how-generated">
        <summary>
          <Info size={16} className="icon-inline" aria-hidden />
          Cómo se genera
        </summary>
        <div className="footer-how-generated-body">
          <p>
            Los datos por defecto se precalculan en el despliegue con el pipeline Python y se
            empaquetan en <code>datos.json</code>. También puede agregar un PR público o un archivo
            JSON/JSONL; esas entradas se analizan en el navegador con el motor simulado.
          </p>
          <p>
            Si el repositorio tiene configurado el secreto <code>ANTHROPIC_API_KEY</code> en GitHub
            Actions, el pipeline de despliegue usa Claude; si no, usa el modo simulado con reglas
            heurísticas.
          </p>
          <p>La clave de API nunca llega al navegador. El token opcional de GitHub solo vive en memoria.</p>
        </div>
      </details>
      <p>
        Código fuente:{' '}
        <a
          href="https://github.com/pmora3003/grantfox-revision-asistida"
          target="_blank"
          rel="noreferrer"
        >
          github.com/pmora3003/grantfox-revision-asistida
        </a>
      </p>
    </footer>
  )
}
