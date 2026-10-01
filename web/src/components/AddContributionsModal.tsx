import { useCallback, useId, useRef, useState, type DragEvent } from 'react'
import {
  CheckCircle2,
  FileJson,
  Link2,
  Loader2,
  X,
  AlertTriangle,
  Download,
} from 'lucide-react'
import { entradaDesdePR, leerArchivoCasos } from '../motor'
import type { Entrada, ItemCola, Salida } from '../types'
import { formatCurrency } from '../labels'

const PR_URL_RE =
  /^https?:\/\/(www\.)?github\.com\/[^/]+\/[^/]+\/pull\/\d+\/?(\?.*)?$/i

const PLANTILLA_JSONL = `${JSON.stringify({
  id: 'ejemplo/repo#1',
  requested_amount: 500,
  context: {
    prUrl: 'https://github.com/ejemplo/repo/pull/1',
    title: 'Ejemplo de contribución',
    body: 'Descripción breve de la solicitud.',
    merged: true,
    state: 'closed',
    linkedIssueTitle: 'Tarea de ejemplo',
    linkedIssueBody: 'Criterios de aceptación de ejemplo.',
    fileStats: [
      { path: 'src/app.ts', additions: 12, deletions: 3 },
      { path: 'README.md', additions: 4, deletions: 0 },
    ],
    ciConclusion: 'success',
    reviewCommentCount: 1,
    diff: '',
    truncated: false,
  },
})}\n`

type Tab = 'enlace' | 'archivo'

type FilePreviewItem =
  | { ok: true; kind: 'entrada'; entrada: Entrada }
  | { ok: true; kind: 'resultado'; entrada: Entrada; salida: Salida }
  | { ok: false; indice: number; error: string }

type Props = {
  open: boolean
  existingIds: Set<string>
  onClose: () => void
  onAdd: (items: ItemCola[]) => void
}

function traduzirErrorGithub(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('404') || m.includes('no se encontro') || m.includes('no se encontró')) {
    return 'No se encontró el PR (404). Compruebe la URL, o use un token si el repositorio es privado.'
  }
  if (m.includes('rate limit') || m.includes('limite') || m.includes('límite') || m.includes('60')) {
    return 'Se alcanzó el límite de 60 consultas por hora de GitHub sin autenticación. Espere o añada un token opcional (solo en memoria).'
  }
  if (m.includes('403')) {
    return 'GitHub rechazó la petición (403). Puede ser un repositorio privado o el límite de consultas. Pruebe con un token opcional.'
  }
  if (m.includes('url de pr no reconocida')) {
    return 'URL no válida. Use el formato https://github.com/{owner}/{repo}/pull/{número}.'
  }
  return msg
}

export function AddContributionsModal({ open, existingIds, onClose, onAdd }: Props) {
  const titleId = useId()
  const [tab, setTab] = useState<Tab>('enlace')

  // Tab enlace
  const [prUrl, setPrUrl] = useState('')
  const [monto, setMonto] = useState('')
  const [token, setToken] = useState('')
  const [tokenOpen, setTokenOpen] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchStatus, setFetchStatus] = useState('')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Entrada | null>(null)

  // Tab archivo
  const [fileError, setFileError] = useState<string | null>(null)
  const [fileItems, setFileItems] = useState<FilePreviewItem[] | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetLocal = useCallback(() => {
    setPrUrl('')
    setMonto('')
    setToken('')
    setTokenOpen(false)
    setFetching(false)
    setFetchStatus('')
    setFetchError(null)
    setPreview(null)
    setFileError(null)
    setFileItems(null)
    setDragging(false)
  }, [])

  function handleClose() {
    resetLocal()
    onClose()
  }

  async function handleTraerPR() {
    setFetchError(null)
    setPreview(null)
    const url = prUrl.trim()
    if (!PR_URL_RE.test(url)) {
      setFetchError(
        'URL no válida. Use el formato https://github.com/{owner}/{repo}/pull/{número}.',
      )
      return
    }
    const amount = Number(monto)
    if (!Number.isFinite(amount) || amount <= 0) {
      setFetchError('Indique un monto solicitado válido en USDC (número mayor que 0).')
      return
    }

    setFetching(true)
    const stages = [
      'Consultando datos del PR…',
      'Obteniendo archivos y diff…',
      'Revisando CI e issue vinculado…',
    ]
    let stageIdx = 0
    setFetchStatus(stages[0]!)
    const timer = window.setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, stages.length - 1)
      setFetchStatus(stages[stageIdx]!)
    }, 900)

    try {
      const memToken = token.trim() || undefined
      const entrada = await entradaDesdePR(url, amount, memToken)
      setPreview(entrada)
      setFetchStatus('')
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Error al consultar GitHub'
      setFetchError(traduzirErrorGithub(raw))
    } finally {
      window.clearInterval(timer)
      setFetching(false)
      // No conservar el token en estado tras el uso exitoso/fallido largo: se limpia al cerrar.
    }
  }

  function handleAddPreview() {
    if (!preview) return
    if (existingIds.has(preview.id)) {
      setFetchError(`Ya existe en la cola: ${preview.id}`)
      return
    }
    onAdd([
      {
        entrada: preview,
        salida: null,
        fuente: 'enlace',
        pendienteCalculo: true,
      },
    ])
    // Limpiar token de memoria al agregar
    setToken('')
    resetLocal()
    onClose()
  }

  function parseFileText(texto: string) {
    setFileError(null)
    setFileItems(null)
    try {
      const parsed = leerArchivoCasos(texto)
      if (parsed.tipo === 'entradas') {
        setFileItems(
          parsed.items.map((it) =>
            it.ok
              ? { ok: true as const, kind: 'entrada' as const, entrada: it.entrada }
              : { ok: false as const, indice: it.indice, error: it.error },
          ),
        )
      } else {
        setFileItems(
          parsed.items.map((it) =>
            it.ok
              ? {
                  ok: true as const,
                  kind: 'resultado' as const,
                  entrada: it.entrada,
                  salida: it.salida,
                }
              : { ok: false as const, indice: it.indice, error: it.error },
          ),
        )
      }
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'No se pudo leer el archivo')
    }
  }

  async function readFile(file: File) {
    const name = file.name.toLowerCase()
    if (!name.endsWith('.json') && !name.endsWith('.jsonl')) {
      setFileError('Solo se aceptan archivos .json o .jsonl')
      return
    }
    const texto = await file.text()
    parseFileText(texto)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void readFile(f)
  }

  function handleAddFileItems() {
    if (!fileItems) return
    const toAdd: ItemCola[] = []
    const seen = new Set(existingIds)
    for (const it of fileItems) {
      if (!it.ok) continue
      if (seen.has(it.entrada.id)) continue
      seen.add(it.entrada.id)
      if (it.kind === 'resultado') {
        toAdd.push({
          entrada: it.entrada,
          salida: it.salida,
          fuente: 'archivo',
          pendienteCalculo: false,
        })
      } else {
        toAdd.push({
          entrada: it.entrada,
          salida: null,
          fuente: 'archivo',
          pendienteCalculo: true,
        })
      }
    }
    if (toAdd.length === 0) {
      setFileError('No hay contribuciones nuevas válidas para agregar (¿duplicadas o con error?).')
      return
    }
    onAdd(toAdd)
    resetLocal()
    onClose()
  }

  function downloadPlantilla() {
    const blob = new Blob([PLANTILLA_JSONL], { type: 'application/x-ndjson' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'plantilla-contribucion.jsonl'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!open) return null

  const okFileCount = fileItems?.filter((i) => i.ok).length ?? 0
  const files = preview?.context.fileStats ?? []
  const adds = files.reduce((s, f) => s + (f.additions ?? 0), 0)
  const dels = files.reduce((s, f) => s + (f.deletions ?? 0), 0)

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleClose}>
      <div
        className="modal-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id={titleId}>Agregar contribuciones</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={handleClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>

        <div className="modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'enlace'}
            className={`modal-tab${tab === 'enlace' ? ' active' : ''}`}
            onClick={() => setTab('enlace')}
          >
            <Link2 size={16} aria-hidden /> Desde enlace de PR
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'archivo'}
            className={`modal-tab${tab === 'archivo' ? ' active' : ''}`}
            onClick={() => setTab('archivo')}
          >
            <FileJson size={16} aria-hidden /> Desde archivo
          </button>
        </div>

        <div className="modal-body">
          {tab === 'enlace' && (
            <div className="tab-panel">
              <label className="field">
                <span className="field-label">URL pública del PR de GitHub</span>
                <input
                  type="url"
                  value={prUrl}
                  onChange={(e) => setPrUrl(e.target.value)}
                  placeholder="https://github.com/org/repo/pull/123"
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span className="field-label">Monto solicitado (USDC)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  required
                />
              </label>

              <details
                className="collapse-block token-details"
                open={tokenOpen}
                onToggle={(e) => setTokenOpen((e.target as HTMLDetailsElement).open)}
              >
                <summary>
                  Token de GitHub (opcional, solo en memoria, para evitar el límite de 60 consultas
                  por hora)
                </summary>
                <div className="collapse-body">
                  <label className="field">
                    <span className="field-label">Token (no se guarda ni se registra)</span>
                    <input
                      type="password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                </div>
              </details>

              <div className="toolbar">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={fetching}
                  onClick={() => void handleTraerPR()}
                >
                  {fetching ? <Loader2 size={16} className="spin" aria-hidden /> : <Link2 size={16} aria-hidden />}
                  Traer PR
                </button>
              </div>

              {fetching && (
                <p className="fetch-status" role="status">
                  <Loader2 size={16} className="spin" aria-hidden /> {fetchStatus}
                </p>
              )}
              {fetchError && (
                <p className="form-error" role="alert">
                  <AlertTriangle size={16} className="icon-inline" /> {fetchError}
                </p>
              )}

              {preview && (
                <div className="pr-preview-card">
                  <h3>{preview.context.title || 'Sin título'}</h3>
                  <p className="muted">{preview.id}</p>
                  <ul className="pr-preview-meta">
                    <li>
                      {files.length} archivo{files.length === 1 ? '' : 's'}{' '}
                      <span className="diff-add-count">+{adds}</span>{' '}
                      <span className="diff-del-count">-{dels}</span>
                    </li>
                    <li>CI: {preview.context.ciConclusion ?? 'unknown'}</li>
                    <li>
                      Issue vinculado:{' '}
                      {preview.context.linkedIssueTitle ? 'encontrado' : 'no encontrado'}
                    </li>
                    <li>Monto: {formatCurrency(preview.requested_amount ?? 0)}</li>
                    {preview.context.truncated && (
                      <li className="warn-text">
                        <AlertTriangle size={14} className="icon-inline" /> Diff truncado
                      </li>
                    )}
                  </ul>
                  <button type="button" className="btn btn-primary" onClick={handleAddPreview}>
                    <CheckCircle2 size={16} aria-hidden /> Agregar a la cola
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'archivo' && (
            <div className="tab-panel">
              <div
                className={`drop-zone${dragging ? ' dragging' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <p>Arrastre un archivo .json o .jsonl aquí, o</p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Elegir archivo
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.jsonl,application/json"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void readFile(f)
                    e.target.value = ''
                  }}
                />
              </div>

              <div className="format-help">
                <p className="field-label">Formato esperado</p>
                <p className="muted">
                  JSONL (una línea por registro) o un arreglo JSON. Cada registro de entrada
                  necesita <code>id</code>, <code>context</code> y opcionalmente{' '}
                  <code>requested_amount</code>. También se aceptan resultados precalculados{' '}
                  <code>{'{entrada, salida}'}</code>.
                </p>
                <pre className="code-sample">{`{"id":"org/repo#1","requested_amount":500,"context":{"title":"…","prUrl":"https://github.com/…"}}`}</pre>
                <button type="button" className="link-btn" onClick={downloadPlantilla}>
                  <Download size={14} aria-hidden /> Descargar plantilla
                </button>
              </div>

              {fileError && (
                <p className="form-error" role="alert">
                  <AlertTriangle size={16} className="icon-inline" /> {fileError}
                </p>
              )}

              {fileItems && (
                <>
                  <ul className="file-validation-list">
                    {fileItems.map((it, idx) =>
                      it.ok ? (
                        <li key={it.entrada.id} className="file-val-ok">
                          <CheckCircle2 size={16} aria-hidden /> {it.entrada.id}
                          {it.kind === 'resultado' ? ' (resultado precalculado)' : ' (entrada)'}
                          {existingIds.has(it.entrada.id) ? ' (ya en la cola)' : ''}
                        </li>
                      ) : (
                        <li key={`err-${idx}`} className="file-val-err">
                          <AlertTriangle size={16} aria-hidden /> Ítem {it.indice}: {it.error}
                        </li>
                      ),
                    )}
                  </ul>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={okFileCount === 0}
                    onClick={handleAddFileItems}
                  >
                    Agregar {okFileCount} contribución{okFileCount === 1 ? '' : 'es'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
