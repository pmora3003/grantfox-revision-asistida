import type { Entrada, FileStat } from '../types.ts'
import { clasificarArchivo } from './clasificar.ts'

const DIFF_MAX = 60000
const MAX_FILE_PAGES = 3

interface ParsedPrUrl {
  owner: string
  repo: string
  number: number
}

function parsePrUrl(url: string): ParsedPrUrl {
  const trimmed = url.trim()
  const m =
    /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i.exec(trimmed) ||
    /^([^/]+)\/([^/#]+)#(\d+)$/.exec(trimmed)
  if (!m) {
    throw new Error(
      'URL de PR no reconocida. Use https://github.com/{owner}/{repo}/pull/{n}',
    )
  }
  return {
    owner: m[1]!,
    repo: m[2]!.replace(/\.git$/, ''),
    number: Number(m[3]),
  }
}

async function ghFetch(
  path: string,
  token?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`https://api.github.com${path}`, { headers })
  if (res.status === 403) {
    const body = await res.text().catch(() => '')
    if (/rate limit/i.test(body) || res.headers.get('X-RateLimit-Remaining') === '0') {
      throw new Error(
        'Limite de la API de GitHub alcanzado (60 peticiones por hora sin autenticacion). ' +
          'Espere o proporcione un token opcional solo en memoria.',
      )
    }
    throw new Error(
      'GitHub rechazo la peticion (403). Puede deberse al limite de 60 peticiones por hora sin autenticacion.',
    )
  }
  if (res.status === 404) {
    throw new Error(
      'No se encontro el recurso en GitHub (404). Compruebe la URL del PR o del issue, o el token si el repositorio es privado.',
    )
  }
  if (!res.ok) {
    throw new Error(`Error de GitHub (${res.status}) al consultar ${path}`)
  }
  return res
}

function buildUnifiedDiff(
  path: string,
  patch: string | undefined,
): { text: string; missingPatch: boolean } {
  if (!patch) return { text: '', missingPatch: true }
  const header =
    `diff --git a/${path} b/${path}\n` +
    `--- a/${path}\n` +
    `+++ b/${path}\n`
  // Si el patch de GitHub ya trae @@ hunks, anteponer cabecera diff --git.
  return { text: header + patch + '\n', missingPatch: false }
}

const RE_CIERRE_ISSUE =
  /\b(?:closes?|fixes?|resolves?)\s*:?\s*#(\d+)\b/i
const RE_ISSUE_URL =
  /https?:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/i

async function resolverIssueVinculado(
  owner: string,
  repo: string,
  body: string,
  token?: string,
): Promise<{ title: string | null; body: string | null }> {
  let issueOwner = owner
  let issueRepo = repo
  let issueNumber: number | null = null

  const mClose = RE_CIERRE_ISSUE.exec(body || '')
  if (mClose) {
    issueNumber = Number(mClose[1])
  } else {
    const mUrl = RE_ISSUE_URL.exec(body || '')
    if (mUrl) {
      issueOwner = mUrl[1]!
      issueRepo = mUrl[2]!
      issueNumber = Number(mUrl[3])
    }
  }

  if (issueNumber == null) {
    return { title: null, body: null }
  }

  try {
    const res = await ghFetch(
      `/repos/${issueOwner}/${issueRepo}/issues/${issueNumber}`,
      token,
    )
    const data = (await res.json()) as { title?: string; body?: string | null }
    return {
      title: data.title ?? null,
      body: data.body ?? null,
    }
  } catch {
    return { title: null, body: null }
  }
}

async function derivarCiConclusion(
  owner: string,
  repo: string,
  sha: string,
  token?: string,
): Promise<'success' | 'failure' | 'unknown'> {
  try {
    const res = await ghFetch(
      `/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`,
      token,
    )
    const data = (await res.json()) as {
      check_runs?: Array<{ conclusion: string | null }>
    }
    const runs = data.check_runs || []
    if (!runs.length) return 'unknown'
    const conclusions = runs.map((r) => (r.conclusion || '').toLowerCase())
    if (conclusions.some((c) => c === 'failure')) return 'failure'
    if (conclusions.every((c) => c === 'success')) return 'success'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Construye una Entrada desde un PR publico de GitHub (REST API en el navegador).
 * El token opcional solo se usa en memoria y nunca se almacena.
 */
export async function entradaDesdePR(
  url: string,
  montoSolicitado: number,
  token?: string,
): Promise<Entrada> {
  const { owner, repo, number } = parsePrUrl(url)
  const memToken = token || undefined

  const prRes = await ghFetch(`/repos/${owner}/${repo}/pulls/${number}`, memToken)
  const pr = (await prRes.json()) as {
    title?: string
    body?: string | null
    merged?: boolean
    state?: string
    html_url?: string
    head?: { sha?: string }
  }

  const fileStats: FileStat[] = []
  const diffParts: { path: string; text: string }[] = []
  let truncated = false
  let page = 1
  let pagesExceeded = false

  while (page <= MAX_FILE_PAGES) {
    const filesRes = await ghFetch(
      `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`,
      memToken,
    )
    const files = (await filesRes.json()) as Array<{
      filename: string
      additions: number
      deletions: number
      patch?: string
      status?: string
    }>
    if (!Array.isArray(files) || !files.length) break

    for (const f of files) {
      fileStats.push({
        path: f.filename,
        additions: Number(f.additions || 0),
        deletions: Number(f.deletions || 0),
      })
      const { text, missingPatch } = buildUnifiedDiff(f.filename, f.patch)
      if (missingPatch) truncated = true
      else diffParts.push({ path: f.filename, text })
    }

    if (files.length < 100) break
    page += 1
    if (page > MAX_FILE_PAGES) {
      pagesExceeded = true
      truncated = true
      break
    }
  }

  if (pagesExceeded) truncated = true

  // Mismo orden que el pipeline Python: trabajo propio primero, documentación y
  // archivos generados al final, para que el tope recorte primero lo que no cuenta.
  const ordenTipo: Record<string, number> = {
    codigo: 0,
    pruebas: 1,
    configuracion: 2,
    documentacion: 3,
    generado: 4,
  }
  const ordenados = diffParts
    .map((p, i) => ({ ...p, i, orden: ordenTipo[clasificarArchivo(p.path)] ?? 2 }))
    .sort((a, b) => a.orden - b.orden || a.i - b.i)
  let diff = ordenados.map((p) => p.text).join('')
  if (diff.length > DIFF_MAX) {
    diff = diff.slice(0, DIFF_MAX)
    truncated = true
  }

  const [reviewsRes, commentsRes] = await Promise.all([
    ghFetch(`/repos/${owner}/${repo}/pulls/${number}/reviews`, memToken),
    ghFetch(`/repos/${owner}/${repo}/pulls/${number}/comments`, memToken),
  ])
  const reviews = (await reviewsRes.json()) as unknown[]
  const comments = (await commentsRes.json()) as unknown[]
  const reviewCommentCount =
    (Array.isArray(reviews) ? reviews.length : 0) +
    (Array.isArray(comments) ? comments.length : 0)

  const headSha = String(pr.head?.sha || '')
  const ciConclusion = headSha
    ? await derivarCiConclusion(owner, repo, headSha, memToken)
    : 'unknown'

  const body = pr.body || ''
  const linked = await resolverIssueVinculado(owner, repo, body, memToken)

  const merged = Boolean(pr.merged)
  const state = String(pr.state || (merged ? 'closed' : 'open'))

  return {
    id: `${owner}/${repo}#${number}`,
    requested_amount: montoSolicitado,
    context: {
      prUrl: pr.html_url || url,
      headSha: headSha || undefined,
      title: pr.title || '',
      body,
      merged,
      state,
      linkedIssueTitle: linked.title ?? undefined,
      linkedIssueBody: linked.body ?? undefined,
      diff,
      truncated,
      fileStats,
      ciConclusion,
      reviewCommentCount,
    },
  }
}
