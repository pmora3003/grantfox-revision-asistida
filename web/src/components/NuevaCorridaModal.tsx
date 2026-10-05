import { useCallback, useId, useRef, useState, type DragEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  Link2,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { entradaDesdePR, leerArchivoCasos } from '../motor'
import type { Corrida, Entrada, ItemCorrida, Salida } from '../types'
import { formatCurrency } from '../labels'
import { createUserCorrida, defaultCorridaNombre } from '../corridasStore'

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

type Tab = 'enlaces' | 'archivo'

type LinkRow = {
  key: string
  url: string
  monto: string
  status: 'idle' | 'loading' | 'ok' | 'error'
  error?: string
  entrada?: Entrada
}

type FilePreviewItem =
  | { ok: true; kind: 'entrada'; entrada: Entrada }
  | { ok: true; kind: 'resultado'; entrada: Entrada; salida: Salida }
  | { ok: false; indice: number; error: string }

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (corrida: Corrida) => void
}

function traduzirErrorGithub(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('404') || m.includes('no se encontro') || m.includes('no se encontró')) {
    return 'No se encontró el PR (404). Compruebe la URL, o use un token si el repositorio es privado.'
  }
  if (m.includes('rate limit') || m.includes('limite') || m.includes('límite') || m.includes('60')) {
    return 'Se alcanzó el límite de 60 consultas por hora de GitHub sin autenticación. Espere o añada un token opcional.'
  }
  if (m.includes('403')) {
    return 'GitHub rechazó la petición (403). Puede ser un repositorio privado o el límite de consultas.'
  }
  if (m.includes('url de pr no reconocida')) {
    return 'URL no válida. Use el formato https://github.com/{owner}/{repo}/pull/{número}.'
  }
  return msg
}

function newRow(): LinkRow {
  return {
    key: `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    url: '',
    monto: '',
    status: 'idle',
  }
}

export function NuevaCorridaModal({ open, onClose, onCreated }: Props) {
  const titleId = useId()
  const [tab, setTab] = useState<Tab>('enlaces')
  const [nombre, setNombre] = useState(() => defaultCorridaNombre())
  const [rows, setRows] = useState<LinkRow[]>([newRow()])
  const [token, setToken] = useState('')
  const [tokenOpen, setTokenOpen] = useState(false)
  const [fetchingAll, setFetchingAll] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [fileError, setFileError] = useState<string | null>(null)
  const [fileItems, setFileItems] = useState<FilePreviewItem[] | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetLocal = useCallback(() => {
    setTab('enlaces')
    setNombre(defaultCorridaNombre())
    setRows([newRow()])
    setToken('')
    setTokenOpen(false)
    setFetchingAll(false)
    setFormError(null)
    setFileError(null)
    setFileItems(null)
    setDragging(false)
  }, [])

  function handleClose() {
    resetLocal()
    onClose()
  }

  function updateRow(key: string, patch: Partial<LinkRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  async function fetchOne(row: LinkRow, memToken?: string): Promise<LinkRow> {
    const url = row.url.trim()
    if (!PR_URL_RE.test(url)) {
      return {
        ...row,
        status: 'error',
        error: 'URL no válida. Use https://github.com/{owner}/{repo}/pull/{número}.',
        entrada: undefined,
      }
    }
    const amount = Number(row.monto)
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        ...row,
        status: 'error',
        error: 'Indique un monto solicitado válido en USDC (mayor que 0).',
        entrada: undefined,
      }
    }
    try {
      const entrada = await entradaDesdePR(url, amount, memToken)
      return { ...row, status: 'ok', error: undefined, entrada }
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Error al consultar GitHub'
      return { ...row, status: 'error', error: traduzirErrorGithub(raw), entrada: undefined }
    }
  }

  async function handleFetchAll() {
    setFormError(null)
    setFetchingAll(true)
    const memToken = token.trim() || undefined
    const next: LinkRow[] = []
    for (const row of rows) {
      if (!row.url.trim()) {
        next.push(row)
        continue
      }
      updateRow(row.key, { status: 'loading', error: undefined })
      const result = await fetchOne(row, memToken)
      next.push(result)
      setRows((prev) => prev.map((r) => (r.key === result.key ? result : r)))
    }
    setRows(next)
    setFetchingAll(false)
  }

  function handleCreateFromLinks() {
    setFormError(null)
    const ok = rows.filter((r) => r.status === 'ok' && r.entrada)
    if (ok.length === 0) {
      setFormError('Traiga al menos un PR válido antes de crear la corrida.')
      return
    }
    const seen = new Set<string>()
    const items: ItemCorrida[] = []
    for (const r of ok) {
      const e = r.entrada!
      if (seen.has(e.id)) continue
      seen.add(e.id)
      items.push({ id: e.id, entrada: e, salida: null, etapaAlcanzada: 0 })
    }
    const corrida = createUserCorrida({
      nombre,
      origen: 'enlaces',
      items,
      modoEjecucion: 'reglas',
    })
    resetLocal()
    onCreated(corrida)
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

  function handleCreateFromFile() {
    if (!fileItems) return
    const items: ItemCorrida[] = []
    const seen = new Set<string>()
    for (const it of fileItems) {
      if (!it.ok) continue
      if (seen.has(it.entrada.id)) continue
      seen.add(it.entrada.id)
      if (it.kind === 'resultado') {
        items.push({
          id: it.entrada.id,
          entrada: it.entrada,
          salida: it.salida,
          etapaAlcanzada: 0,
        })
      } else {
        items.push({
          id: it.entrada.id,
          entrada: it.entrada,
          salida: null,
          etapaAlcanzada: 0,
        })
      }
    }
    if (items.length === 0) {
      setFileError('No hay contribuciones válidas en el archivo.')
      return
    }
    const corrida = createUserCorrida({
      nombre,
      origen: 'archivo',
      items,
      modoEjecucion: 'reglas',
    })
    resetLocal()
    onCreated(corrida)
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

  const okLinks = rows.filter((r) => r.status === 'ok').length
  const okFileCount = fileItems?.filter((i) => i.ok).length ?? 0

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleClose}>
      <div
        className="modal-drawer modal-drawer-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id={titleId}>Nueva corrida</h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={handleClose}
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </header>

        <div className="modal-body">
          <label className="field">
            <span className="field-label">Nombre de la corrida</span>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoComplete="off"
            />
          </label>

          <div className="modal-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'enlaces'}
              className={`modal-tab${tab === 'enlaces' ? ' active' : ''}`}
              onClick={() => setTab('enlaces')}
            >
              <Link2 size={16} aria-hidden /> Enlaces de PR
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'archivo'}
              className={`modal-tab${tab === 'archivo' ? ' active' : ''}`}
              onClick={() => setTab('archivo')}
            >
              <FileJson size={16} aria-hidden /> Archivo JSON / JSONL
            </button>
          </div>

          {tab === 'enlaces' && (
            <div className="tab-panel">
              <p className="muted">
                Agregue uno o más PR públicos. Cada fila tiene URL y monto solicitado en USDC.
              </p>
              <ul className="link-rows">
                {rows.map((row, idx) => (
                  <li key={row.key} className="link-row">
                    <span className="link-row-num">{idx + 1}</span>
                    <input
                      type="url"
                      className="link-row-url"
                      value={row.url}
                      onChange={(e) =>
                        updateRow(row.key, {
                          url: e.target.value,
                          status: 'idle',
                          error: undefined,
                          entrada: undefined,
                        })
                      }
                      placeholder="https://github.com/org/repo/pull/123"
                      autoComplete="off"
                    />
                    <input
                      type="number"
                      className="link-row-monto"
                      min={1}
                      step={1}
                      value={row.monto}
                      onChange={(e) =>
                        updateRow(row.key, {
                          monto: e.target.value,
                          status: 'idle',
                          error: undefined,
                          entrada: undefined,
                        })
                      }
                      placeholder="USDC"
                      aria-label="Monto solicitado en USDC"
                    />
                    <span className="link-row-status" aria-live="polite">
                      {row.status === 'loading' && (
                        <Loader2 size={16} className="spin" aria-label="Cargando" />
                      )}
                      {row.status === 'ok' && (
                        <CheckCircle2 size={16} className="ok-icon" aria-label="Listo" />
                      )}
                      {row.status === 'error' && (
                        <AlertTriangle size={16} className="err-icon" aria-label="Error" />
                      )}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      disabled={rows.length <= 1}
                      onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                      aria-label="Quitar fila"
                    >
                      <Trash2 size={16} />
                    </button>
                    {row.status === 'ok' && row.entrada && (
                      <p className="link-row-preview muted">
                        {row.entrada.context.title || row.entrada.id} (
                        {formatCurrency(row.entrada.requested_amount ?? 0)})
                      </p>
                    )}
                    {row.status === 'error' && row.error && (
                      <p className="link-row-error">{row.error}</p>
                    )}
                  </li>
                ))}
              </ul>
              <div className="toolbar">
                <button type="button" className="btn" onClick={() => setRows((p) => [...p, newRow()])}>
                  <Plus size={16} aria-hidden /> Agregar PR
                </button>
              </div>

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
                  className="btn"
                  disabled={fetchingAll}
                  onClick={() => void handleFetchAll()}
                >
                  {fetchingAll ? (
                    <Loader2 size={16} className="spin" aria-hidden />
                  ) : (
                    <Link2 size={16} aria-hidden />
                  )}
                  Traer PR
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={okLinks === 0 || fetchingAll}
                  onClick={handleCreateFromLinks}
                >
                  Crear corrida ({okLinks})
                </button>
              </div>
              {formError && (
                <p className="form-error" role="alert">
                  <AlertTriangle size={16} className="icon-inline" /> {formError}
                </p>
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
                    onClick={handleCreateFromFile}
                  >
                    Crear corrida ({okFileCount})
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
