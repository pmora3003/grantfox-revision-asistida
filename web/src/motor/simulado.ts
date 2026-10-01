import type { Criterio, DimensionNombre, Entrada, FileClassification } from '../types.ts'
import {
  CODIGOS_POR_DIMENSION,
  DIMENSIONES,
  postvalidarCriterios,
  type MetaAnalisis,
} from './agregar.ts'
import { escala, nivelParaMonto, rangoNivel, umbralSpikeDesdeConfig } from './config.generada.ts'
import { clasificarArchivo } from './clasificar.ts'
import { redactarSecretos, sanitizarTextoModelo } from './sanitizar.ts'

const PREFIJO = '[simulado] '
const RE_TOKEN = /[A-Za-z_][A-Za-z0-9_]{3,}/g
const RE_AC_LINEA = /^\s*-\s+(.+)$/
const RE_IMPORT_EXPORT =
  /^\+\s*(?:import\s+|from\s+\S+\s+import\s+|export\s+(?:\{|default|async|function|const|class|type|enum))/i
const RE_ERROR_HANDLING = /(\bthrow\b|\bErr\s*\(|\bcatch\b|\bResult\b|if\s*\(\s*!)/i
const RE_AUTH =
  /(\bmiddleware\b|\bauth(?:n|z|enticat|oriz)?\b|\brequireAuth\b|\bauthorize\b)/i
const RE_VALIDACION = /(\bvalidat|\bschema\b|\bzod\b|\bparse\b|\bsafeParse\b)/i
const RE_MULTI_CAMBIO = /(\by\s+tambien\b|\bademas\b|\balso\b)/i
const RE_DEPENDENCIA_EXTERNA =
  /(repartir(?:se)?|dividir(?:se)?|splitt(?:ing|ed)?|recompensa\s+entre|entre\s+(?:tres|varios|dos|\d+)\s+contribu|acuerdo\s+(?:de\s+equipo\s+)?fuera|outside\s+(?:this\s+)?pr|among\s+contributors)/i
const RE_TODO = /\bTODO\b|\bFIXME\b/
const RE_PLACEHOLDER = /\bplaceholder\b|\blorem\b|\bcoming soon\b/i
const DIRS_CONTENEDOR = new Set(['src', 'lib', 'packages', 'apps', 'contracts'])
const DIRS_SKIP_SECRETO = new Set([
  'test',
  'tests',
  '__tests__',
  'fixtures',
  'mocks',
  'examples',
])
const TIPOS_SKIP_SECRETO = new Set(['pruebas', 'documentacion', 'generado'])
const RE_SECRET_KV_PRECISO =
  /\b(password|passwd|secret|token|api_key|apikey|private_key|client_secret|access_key)\b(\s*[:=]\s*)(?<q>["'])(?<val>[^"']{16,})\k<q>/gi
const RE_SECRETOS_ALTA_CONF: Array<{ source: string; flags: string }> = [
  { source: String.raw`\bAKIA[0-9A-Z]{16}\b`, flags: 'g' },
  { source: String.raw`\bsk-[A-Za-z0-9]{20,}\b`, flags: 'g' },
  { source: String.raw`\bghp_[A-Za-z0-9]{36}\b`, flags: 'g' },
  { source: String.raw`\bxox[bp]-`, flags: 'g' },
  { source: String.raw`-----BEGIN (?:RSA |EC )?PRIVATE KEY-----`, flags: 'g' },
  { source: String.raw`\bS[A-Z2-7]{55}\b`, flags: 'g' },
  { source: String.raw`demo_FAKE_[A-Za-z0-9_]+`, flags: 'g' },
]
const PLACEHOLDER_VALOR = [
  'example',
  'ejemplo',
  'changeme',
  'your_',
  'xxx',
  '<',
  '${',
  'process.env',
  'env(',
  'getenv',
  'os.environ',
  'std::env',
  'dotenv',
  'test',
  'dummy',
  'fake',
]

function reSecretKvPreciso(): RegExp {
  return new RegExp(RE_SECRET_KV_PRECISO.source, RE_SECRET_KV_PRECISO.flags)
}

function reSecretosAltaConf(): RegExp[] {
  return RE_SECRETOS_ALTA_CONF.map((p) => new RegExp(p.source, p.flags))
}

interface LineaAdded {
  text: string
  line: number
  raw: string
}

interface ArchivoDiff {
  path: string
  added: LineaAdded[]
}

function tokens(texto: string | null | undefined): Set<string> {
  if (!texto) return new Set()
  const out = new Set<string>()
  const re = new RegExp(RE_TOKEN.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(texto)) !== null) {
    out.add(m[0].toLowerCase())
  }
  return out
}

function areaArchivo(path: string): string {
  const partes = path.replace(/\\/g, '/').split('/')
  if (!partes.length) return path
  if (DIRS_CONTENEDOR.has(partes[0]!) && partes.length >= 2) {
    return partes.slice(0, 2).join('/')
  }
  return partes[0]!
}

function parseDiff(diff: string): ArchivoDiff[] {
  const archivos: ArchivoDiff[] = []
  let actual: ArchivoDiff | null = null
  let lineaNueva = 0
  for (const raw of (diff || '').split(/\r?\n/)) {
    if (raw.startsWith('diff --git ')) {
      const m = / b\/(.+)$/.exec(raw)
      const path = m ? m[1]! : 'unknown'
      actual = { path, added: [] }
      archivos.push(actual)
      lineaNueva = 0
      continue
    }
    if (raw.startsWith('+++ ')) {
      if (actual && raw.slice(4) !== '/dev/null') {
        let path = raw.slice(4)
        if (path.startsWith('b/')) path = path.slice(2)
        actual.path = path
      }
      continue
    }
    if (raw.startsWith('@@')) {
      const m = /\+(\d+)/.exec(raw)
      lineaNueva = m ? Number(m[1]) : 0
      continue
    }
    if (actual == null) continue
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      actual.added.push({ text: raw.slice(1), line: lineaNueva, raw })
      lineaNueva += 1
    } else if (raw.startsWith('-') && !raw.startsWith('---')) {
      continue
    } else {
      if (lineaNueva) lineaNueva += 1
    }
  }
  return archivos
}

function citar(
  archivos: ArchivoDiff[],
  predicado?: ((texto: string, path: string) => boolean) | null,
  keywords?: Set<string> | null,
): [string | null, string | null, number | null] {
  for (const arch of archivos) {
    const trozos: string[] = []
    let linea0: number | null = null
    for (const item of arch.added) {
      const texto = item.text
      let ok = false
      if (predicado != null && predicado(texto, arch.path)) ok = true
      if (keywords) {
        const tTok = tokens(texto)
        const pTok = tokens(arch.path)
        for (const k of keywords) {
          if (tTok.has(k) || pTok.has(k)) {
            ok = true
            break
          }
        }
      }
      if (predicado == null && !keywords) {
        ok = Boolean(texto.trim())
      }
      if (!ok) {
        if (trozos.length) break
        continue
      }
      if (linea0 == null) linea0 = item.line
      trozos.push(texto)
      let frag = trozos.join('\n')
      if (frag.length >= 300) {
        frag = frag.slice(0, 300)
        frag = redactarSecretos(frag) || frag
        return [arch.path, frag, linea0]
      }
    }
    if (trozos.length) {
      let frag = trozos.join('\n').slice(0, 300)
      frag = redactarSecretos(frag) || frag
      return [arch.path, frag, linea0]
    }
  }
  return [null, null, null]
}

function criterio(
  codigo: string,
  dimension: DimensionNombre,
  level: Criterio['level'],
  evidence: string,
  file: string | null = null,
  fragment: string | null = null,
  line: number | null = null,
): Criterio {
  const ev = evidence.startsWith(PREFIJO) ? evidence : PREFIJO + evidence
  let frag = fragment
  if (typeof frag === 'string') {
    frag = redactarSecretos(frag)
    if (frag && frag.length > 300) frag = frag.slice(0, 300)
  }
  return {
    code: codigo,
    dimension,
    level,
    evidence: sanitizarTextoModelo(ev) || ev,
    file,
    fragment: frag ? sanitizarTextoModelo(frag) : frag,
    line,
  }
}

function insuficiente(
  codigo: string,
  dimension: DimensionNombre,
  motivo: string,
): Criterio {
  return criterio(codigo, dimension, 'evidencia_insuficiente', motivo, null, null, null)
}

function lineasAceptacion(issueBody: string | null | undefined): string[] {
  const lineas: string[] = []
  for (const raw of (issueBody || '').split(/\r?\n/)) {
    const m = RE_AC_LINEA.exec(raw)
    if (m) lineas.push(m[1]!.trim())
  }
  return lineas
}

function haystackTokens(archivos: ArchivoDiff[], paths: string[]): Set<string> {
  const partes = tokens(paths.join(' '))
  for (const arch of archivos) {
    for (const t of tokens(arch.path)) partes.add(t)
    for (const item of arch.added) {
      for (const t of tokens(item.text)) partes.add(t)
    }
  }
  return partes
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const x of a) if (b.has(x)) out.add(x)
  return out
}

function nivelSugerido(clasificacion: FileClassification): string {
  const sim = (escala.simulado || {}) as Record<string, number>
  const vol = clasificacion.realVolume || { files: 0, additions: 0 }
  const additions = Number(vol.additions || 0)
  const files = Number(vol.files || 0)
  const lm = Number(sim.lineas_medio ?? 150)
  const la = Number(sim.lineas_alto ?? 400)
  const ls = Number(sim.lineas_spike ?? 900)
  const am = Number(sim.archivos_medio ?? 6)
  const aa = Number(sim.archivos_alto ?? 10)
  const as_ = Number(sim.archivos_spike ?? 15)

  const orden: Record<string, number> = { bajo: 0, medio: 1, alto: 2, spike: 3 }

  function porLineas(n: number): string {
    if (n >= ls) return 'spike'
    if (n >= la) return 'alto'
    if (n >= lm) return 'medio'
    return 'bajo'
  }
  function porArchivos(n: number): string {
    if (n >= as_) return 'spike'
    if (n >= aa) return 'alto'
    if (n >= am) return 'medio'
    return 'bajo'
  }

  const a = porLineas(additions)
  const b = porArchivos(files)
  return (orden[a] ?? 0) >= (orden[b] ?? 0) ? a : b
}

function montoMedioNivel(nivel: string): number {
  const rango = rangoNivel(nivel)
  if (!rango) return 30
  const [lo, hi] = rango
  if (hi == null) return Math.trunc(umbralSpikeDesdeConfig() + 25)
  return Math.trunc((lo + hi) / 2)
}

function depsAgregadas(
  archivos: ArchivoDiff[],
): Array<[string, string, number]> {
  const hallados: Array<[string, string, number]> = []
  for (const arch of archivos) {
    const path = arch.path
    const nombre = path.replace(/\\/g, '/').split('/').pop() || ''
    if (nombre !== 'package.json' && nombre !== 'Cargo.toml') continue
    let enDeps = false
    for (const item of arch.added) {
      const texto = item.text
      if (nombre === 'package.json') {
        if (/"(dependencies|devDependencies)"\s*:/.test(texto)) {
          enDeps = true
          continue
        }
        if (enDeps && texto.trim().startsWith('}')) {
          enDeps = false
          continue
        }
        if (enDeps) {
          const m = /^\s*"(?<name>[^"]+)"\s*:\s*"(?<ver>[^"]+)"\s*,?\s*$/.exec(
            texto,
          )
          if (m?.groups?.name) {
            hallados.push([m.groups.name, path, item.line])
          }
        }
      } else {
        if (
          texto.trim() === '[dependencies]' ||
          texto.trim().startsWith('[dependencies.')
        ) {
          enDeps = true
          continue
        }
        if (enDeps && texto.trim().startsWith('[')) {
          enDeps = false
          continue
        }
        if (enDeps) {
          const m = /^\s*(?<name>[A-Za-z0-9_-]+)\s*=\s*"[^"]+"\s*$/.exec(texto)
          if (m?.groups?.name) {
            hallados.push([m.groups.name, path, item.line])
          }
        }
      }
    }
  }
  return hallados
}

function lineasAnadidasTexto(archivos: ArchivoDiff[]): string[] {
  const out: string[] = []
  for (const arch of archivos) {
    for (const item of arch.added) out.push(item.text)
  }
  return out
}

function bloquesRepetidos(lineas: string[]): boolean {
  const utiles = lineas
    .map((ln) => ln.trim())
    .filter((ln) => ln && !ln.startsWith('//'))
  if (utiles.length < 6) return false
  const cont = new Map<string, number>()
  for (const ln of utiles) {
    if (ln.length >= 20) {
      const n = (cont.get(ln) || 0) + 1
      cont.set(ln, n)
      if (n >= 3) return true
    }
  }
  return false
}

function analizarAlcance(
  entrada: Entrada,
  _clasificacion: FileClassification,
  archivos: ArchivoDiff[],
): [Criterio[], { tareaCorresponde: boolean }] {
  const dim: DimensionNombre = 'cumplimiento_alcance'
  const ctx = entrada.context || {}
  const issueTitle = String(ctx.linkedIssueTitle || '')
  const issueBody = String(ctx.linkedIssueBody || '')
  const title = String(ctx.title || '')
  const paths = (ctx.fileStats || []).map((f) => String(f?.path || ''))
  const hay = haystackTokens(archivos, paths)
  const kwIssue = tokens(issueTitle + ' ' + issueBody)
  const overlap = intersect(kwIssue, hay)
  const tarea = overlap.size > 0

  const [fileO, fragO, lineO] =
    overlap.size > 0 ? citar(archivos, null, overlap) : [null, null, null]

  let cr001: Criterio
  let cr003: Criterio
  if (overlap.size > 0) {
    const sorted = [...overlap].sort().slice(0, 8).join(', ')
    cr001 = criterio(
      'CR-001',
      dim,
      'cumple',
      `Palabras de la tarea solapan con el diff (${sorted})`,
      fileO,
      fragO,
      lineO,
    )
    cr003 = criterio(
      'CR-003',
      dim,
      'cumple',
      `Afirmaciones de la tarea tienen respaldo lexical en archivos (${overlap.size} tokens)`,
      fileO,
      fragO,
      lineO,
    )
  } else {
    cr001 = insuficiente(
      'CR-001',
      dim,
      'Sin solape lexical (>=4 chars) entre la tarea vinculada y el diff',
    )
    if (kwIssue.size && hay.size) {
      const [fileAny, fragAny, lineAny] = citar(archivos)
      cr001 = criterio(
        'CR-001',
        dim,
        'no_cumple',
        'La tarea vinculada no solapa con rutas ni identificadores del diff',
        fileAny,
        fragAny,
        lineAny,
      )
    }
    cr003 = insuficiente(
      'CR-003',
      dim,
      'Sin solape lexical entre descripcion de tarea y el diff',
    )
    if (kwIssue.size && hay.size) {
      const [fileAny, fragAny, lineAny] = citar(archivos)
      cr003 = criterio(
        'CR-003',
        dim,
        'no_cumple',
        'Las afirmaciones de la tarea no aparecen en el diff',
        fileAny,
        fragAny,
        lineAny,
      )
    }
  }

  const acLineas = lineasAceptacion(issueBody)
  let cr002: Criterio
  if (!acLineas.length) {
    cr002 = insuficiente(
      'CR-002',
      dim,
      "La tarea no declara criterios de aceptacion en lineas '- ...'",
    )
  } else {
    let hits = 0
    let primerHit: [string | null, string | null, number | null] = [
      null,
      null,
      null,
    ]
    for (const linea of acLineas) {
      const tk = tokens(linea)
      const hit = intersect(tk, hay)
      if (hit.size) {
        hits += 1
        if (primerHit[0] == null) {
          primerHit = citar(archivos, null, hit)
        }
      }
    }
    let level: Criterio['level']
    let msg: string
    if (hits === acLineas.length) {
      level = 'cumple'
      msg = `Los ${hits} criterios de aceptacion tienen respaldo lexical en el diff`
    } else if (hits > 0) {
      level = 'cumple_parcialmente'
      msg = `${hits} de ${acLineas.length} criterios de aceptacion tienen respaldo en el diff`
    } else {
      level = 'no_cumple'
      msg = 'Ningun criterio de aceptacion tiene respaldo lexical en el diff'
      primerHit = citar(archivos)
    }
    cr002 = criterio(
      'CR-002',
      dim,
      level,
      msg,
      primerHit[0],
      primerHit[1],
      primerHit[2],
    )
  }

  const kwTitle = tokens(title)
  const titleHit = intersect(kwTitle, hay)
  let cr004: Criterio
  if (titleHit.size) {
    const [fT, frT, lT] = citar(archivos, null, titleHit)
    cr004 = criterio(
      'CR-004',
      dim,
      'cumple',
      `Palabras del titulo aparecen en el diff (${[...titleHit].sort().slice(0, 6).join(', ')})`,
      fT,
      frT,
      lT,
    )
  } else if (title.trim()) {
    const [fT, frT, lT] = citar(archivos)
    cr004 = criterio(
      'CR-004',
      dim,
      'cumple_parcialmente',
      'El titulo no solapa con identificadores del diff',
      fT,
      frT,
      lT,
    )
  } else {
    cr004 = insuficiente('CR-004', dim, 'Sin titulo de solicitud para comparar')
  }

  const [fI, frI, lI] = citar(archivos, (t) =>
    RE_IMPORT_EXPORT.test('+' + t),
  )
  let cr005: Criterio
  if (fI) {
    cr005 = criterio(
      'CR-005',
      dim,
      'cumple',
      'Aparece import/export de modulo nuevo en el diff',
      fI,
      frI,
      lI,
    )
  } else {
    cr005 = insuficiente(
      'CR-005',
      dim,
      'No se observa import/export de un modulo nuevo en lineas agregadas',
    )
  }

  return [[cr001, cr002, cr003, cr004, cr005], { tareaCorresponde: tarea }]
}

function analizarCalidad(
  entrada: Entrada,
  clasificacion: FileClassification,
  archivos: ArchivoDiff[],
): [Criterio[], { automationSignals: string[] }] {
  const dim: DimensionNombre = 'calidad_tecnica'
  const ctx = entrada.context || {}
  const byType = clasificacion.byType || { pruebas: 0 }
  const nPruebas = Number(byType.pruebas || 0)
  const paths = (ctx.fileStats || []).map((f) => String(f?.path || ''))
  const kwIssue = tokens(
    String(ctx.linkedIssueTitle || '') + ' ' + String(ctx.linkedIssueBody || ''),
  )
  const body = String(ctx.body || '')

  const pruebasPaths = paths.filter(
    (p) =>
      p.toLowerCase().includes('test') ||
      p.endsWith('_test.rs') ||
      p.toLowerCase().includes('.spec.'),
  )

  let cr006: Criterio
  if (nPruebas > 0 || pruebasPaths.length) {
    let fP: string | null = pruebasPaths[0] ?? null
    let frP: string | null = null
    let lP: number | null = null
    if (fP) {
      ;[fP, frP, lP] = citar(
        archivos.filter((a) => a.path === fP).length
          ? archivos.filter((a) => a.path === fP)
          : archivos,
      )
    }
    cr006 = criterio(
      'CR-006',
      dim,
      'cumple',
      `La clasificacion reporta ${nPruebas} archivo(s) de pruebas`,
      fP,
      frP,
      lP,
    )
  } else {
    const [fAny, frAny, lAny] = citar(archivos)
    cr006 = criterio(
      'CR-006',
      dim,
      'no_cumple',
      'No hay archivos de pruebas en la clasificacion',
      fAny,
      frAny,
      lAny,
    )
  }

  let cr007: Criterio
  if (nPruebas > 0 || pruebasPaths.length) {
    const pruebaTok = new Set<string>()
    for (const arch of archivos) {
      if (
        arch.path.toLowerCase().includes('test') ||
        arch.path.endsWith('_test.rs')
      ) {
        for (const t of tokens(arch.path)) pruebaTok.add(t)
        for (const item of arch.added) {
          for (const t of tokens(item.text)) pruebaTok.add(t)
        }
      }
    }
    const overlap = intersect(kwIssue, pruebaTok)
    if (overlap.size) {
      const [fT, frT, lT] = citar(
        archivos.filter((a) => a.path.toLowerCase().includes('test')),
        null,
        overlap,
      )
      cr007 = criterio(
        'CR-007',
        dim,
        'cumple',
        'Las pruebas mencionan palabras clave de la tarea',
        fT,
        frT,
        lT,
      )
    } else {
      const testArchivos = archivos.filter((a) =>
        a.path.toLowerCase().includes('test'),
      )
      const [fT, frT, lT] = citar(testArchivos.length ? testArchivos : archivos)
      cr007 = criterio(
        'CR-007',
        dim,
        'cumple_parcialmente',
        'Hay pruebas pero no mencionan palabras clave de la tarea',
        fT,
        frT,
        lT,
      )
    }
  } else {
    cr007 = insuficiente(
      'CR-007',
      dim,
      'Sin pruebas en la entrega; se valora en CR-006',
    )
  }

  const [fE, frE, lE] = citar(archivos, (texto) => RE_ERROR_HANDLING.test(texto))
  let cr008: Criterio
  if (fE) {
    cr008 = criterio(
      'CR-008',
      dim,
      'cumple',
      'El diff agrega manejo de error (throw/Err/catch/Result/if (!...))',
      fE,
      frE,
      lE,
    )
  } else {
    cr008 = insuficiente(
      'CR-008',
      dim,
      'No se observan senales claras de manejo de error en lineas agregadas',
    )
  }

  const cr009 = insuficiente(
    'CR-009',
    dim,
    'Requiere convenciones del repositorio de destino, no disponibles en el insumo',
  )

  const areas = new Map<string, Set<string>>()
  for (const p of paths) {
    if (!p) continue
    const area = areaArchivo(p)
    const set = areas.get(area) || new Set<string>()
    for (const t of tokens(p)) set.add(t)
    areas.set(area, set)
  }
  let areasUtiles = new Map<string, Set<string>>()
  for (const [a, t] of areas) {
    if (DIRS_CONTENEDOR.has(a.split('/')[0]!) || a.includes('/')) {
      areasUtiles.set(a, t)
    }
  }
  if (!areasUtiles.size) areasUtiles = areas

  const multi = RE_MULTI_CAMBIO.test(body)
  let unrelated = false
  if (areasUtiles.size >= 2) {
    const lista = [...areasUtiles.entries()]
    let compartidos: Set<string> | null = null
    for (const [, t] of lista) {
      if (compartidos == null) compartidos = new Set(t)
      else compartidos = intersect(compartidos, t)
    }
    if (!compartidos) compartidos = new Set()
    let issueEnAreas = 0
    for (const [, toks] of lista) {
      if (intersect(kwIssue, toks).size) issueEnAreas += 1
    }
    if (!compartidos.size && issueEnAreas <= 1) unrelated = true
  }

  let cr010: Criterio
  const [fA, frA, lA] = citar(archivos)
  if (unrelated && multi) {
    cr010 = criterio(
      'CR-010',
      dim,
      'no_cumple',
      `Archivos en ${areasUtiles.size} areas sin keyword compartida y el body declara varios cambios`,
      fA,
      frA,
      lA,
    )
  } else {
    cr010 = criterio(
      'CR-010',
      dim,
      'cumple',
      'No se observa agrupacion de cambios no relacionados con senales de multi-cambio en el body',
      fA,
      frA,
      lA,
    )
  }

  const signals: string[] = []
  const lineas = lineasAnadidasTexto(archivos)
  const nTodo = lineas.filter((ln) => RE_TODO.test(ln)).length
  if (nTodo >= 3) signals.push(`muchas marcas TODO/FIXME (${nTodo})`)
  if (lineas.some((ln) => RE_PLACEHOLDER.test(ln))) {
    signals.push('texto placeholder o lorem en lineas agregadas')
  }
  if (bloquesRepetidos(lineas)) {
    signals.push('bloques de lineas identicas repetidos')
  }

  let level011: Criterio['level']
  let msg011: string
  if (signals.length >= 2) {
    level011 = 'no_cumple'
    msg011 = 'Varias senales de generacion automatica sin revision'
  } else if (signals.length === 1) {
    level011 = 'cumple_parcialmente'
    msg011 = `Senal aislada de automatizacion: ${signals[0]}`
  } else {
    level011 = 'cumple'
    msg011 = 'No se observan senales claras de generacion automatica'
  }
  let [fS, frS, lS] = citar(archivos)
  if (signals.length) {
    const [f2, fr2, l2] = citar(
      archivos,
      (texto) => RE_TODO.test(texto) || RE_PLACEHOLDER.test(texto),
    )
    if (f2) {
      fS = f2
      frS = fr2
      lS = l2
    }
  }
  const cr011 = criterio('CR-011', dim, level011, msg011, fS, frS, lS)

  const ci = ctx.ciConclusion
  const comments = ctx.reviewCommentCount
  let nComments = 0
  try {
    nComments = comments != null ? Math.trunc(Number(comments)) : 0
    if (Number.isNaN(nComments)) nComments = 0
  } catch {
    nComments = 0
  }
  const ciStr = ci == null ? 'None' : String(ci)
  const evidCi = `ciConclusion=${ciStr}; reviewCommentCount=${nComments}`
  const [fC, frC, lC] = citar(archivos)
  let cr012: Criterio
  if (ci === 'success' && nComments === 0) {
    cr012 = criterio('CR-012', dim, 'cumple', evidCi, fC, frC, lC)
  } else if (ci === 'unknown' || ci == null) {
    cr012 = insuficiente('CR-012', dim, evidCi + ' (sin dato de CI)')
  } else {
    cr012 = criterio(
      'CR-012',
      dim,
      'cumple_parcialmente',
      evidCi,
      fC,
      frC,
      lC,
    )
  }

  return [
    [cr006, cr007, cr008, cr009, cr010, cr011, cr012],
    { automationSignals: signals },
  ]
}

function rutaExcluidaSecreto(path: string): boolean {
  if (TIPOS_SKIP_SECRETO.has(clasificarArchivo(path))) return true
  const norm = path.replace(/\\/g, '/').toLowerCase()
  const nombre = norm.split('/').pop() || ''
  if (nombre === '.env.example' || norm.endsWith('.env.example')) return true
  const partes = norm.split('/').filter(Boolean)
  return partes.some((p) => DIRS_SKIP_SECRETO.has(p))
}

function esPlaceholderSecreto(valor: string): boolean {
  const low = valor.toLowerCase()
  return PLACEHOLDER_VALOR.some((m) => low.includes(m))
}

function fragmentoCr013(texto: string): string {
  let frag = redactarSecretos(texto) || texto
  for (const patron of reSecretosAltaConf()) {
    frag = frag.replace(patron, '[valor omitido]')
  }
  frag = frag.replace(
    reSecretKvPreciso(),
    (_m, g1: string, g2: string, q: string) => `${g1}${g2}${q}[valor omitido]${q}`,
  )
  return frag || '[valor omitido]'
}

function secretoPrecisoEnLinea(texto: string): boolean {
  for (const patron of reSecretosAltaConf()) {
    if (patron.test(texto)) return true
  }
  const re = reSecretKvPreciso()
  let m: RegExpExecArray | null
  while ((m = re.exec(texto)) !== null) {
    const valor = m.groups?.val ?? m[4] ?? ''
    if (valor && !esPlaceholderSecreto(valor)) return true
  }
  return false
}

function analizarSeguridad(
  entrada: Entrada,
  _clasificacion: FileClassification,
  archivos: ArchivoDiff[],
): [Criterio[], Record<string, never>] {
  const dim: DimensionNombre = 'riesgos_seguridad'
  const ctx = entrada.context || {}
  const issueTxt =
    String(ctx.linkedIssueTitle || '') +
    ' ' +
    String(ctx.linkedIssueBody || '') +
    ' ' +
    String(ctx.body || '')

  let secretoHit: {
    path: string
    line: number
    fragment: string
  } | null = null
  for (const arch of archivos) {
    if (rutaExcluidaSecreto(arch.path)) continue
    for (const item of arch.added) {
      if (secretoPrecisoEnLinea(item.text)) {
        secretoHit = {
          path: arch.path,
          line: item.line,
          fragment: fragmentoCr013(item.text),
        }
        break
      }
    }
    if (secretoHit) break
  }

  let cr013: Criterio
  if (secretoHit) {
    cr013 = criterio(
      'CR-013',
      dim,
      'no_cumple',
      `Posible secreto en linea agregada (valor omitido) en ${secretoHit.path}:${secretoHit.line}`,
      secretoHit.path,
      secretoHit.fragment,
      secretoHit.line,
    )
  } else {
    const [fA, frA, lA] = citar(archivos)
    cr013 = criterio(
      'CR-013',
      dim,
      'cumple',
      'No se observan patrones de secreto en lineas agregadas',
      fA,
      frA,
      lA,
    )
  }

  const [fAu, frAu, lAu] = citar(
    archivos,
    (texto, path) => RE_AUTH.test(texto) || RE_AUTH.test(path),
  )
  let cr014: Criterio
  if (fAu) {
    cr014 = criterio(
      'CR-014',
      dim,
      'cumple',
      'Senal de middleware o comprobacion de autenticacion en el diff',
      fAu,
      frAu,
      lAu,
    )
  } else {
    cr014 = insuficiente(
      'CR-014',
      dim,
      'Sin senales claras de auth middleware en el diff',
    )
  }

  const [fV, frV, lV] = citar(
    archivos,
    (texto, path) => RE_VALIDACION.test(texto) || RE_VALIDACION.test(path),
  )
  let cr015: Criterio
  if (fV) {
    cr015 = criterio(
      'CR-015',
      dim,
      'cumple',
      'Senal de funcion o esquema de validacion en el diff',
      fV,
      frV,
      lV,
    )
  } else {
    cr015 = insuficiente(
      'CR-015',
      dim,
      'Sin senales claras de validacion de entrada en el diff',
    )
  }

  let cr016 = insuficiente(
    'CR-016',
    dim,
    'Sin senal clara de control de seguridad conectado a rutas',
  )
  if (fAu) {
    cr016 = criterio(
      'CR-016',
      dim,
      'cumple_parcialmente',
      'Hay middleware/auth pero no se verifica el cableado completo de rutas',
      fAu,
      frAu,
      lAu,
    )
  }

  const deps = depsAgregadas(archivos)
  let cr017: Criterio
  if (!deps.length) {
    cr017 = insuficiente(
      'CR-017',
      dim,
      'El cambio no agrega dependencias en package.json/Cargo.toml',
    )
  } else {
    const ajenas: Array<[string, string, number]> = []
    for (const [name, path, line] of deps) {
      if (!issueTxt.toLowerCase().includes(name.toLowerCase())) {
        ajenas.push([name, path, line])
      }
    }
    const [name, path, line] = deps[0]!
    const frag = `${name} (dependencia agregada)`
    if (ajenas.length) {
      cr017 = criterio(
        'CR-017',
        dim,
        'cumple_parcialmente',
        `Dependencias agregadas no mencionadas en la tarea: ${ajenas
          .slice(0, 5)
          .map((a) => a[0])
          .join(', ')}`,
        path,
        frag,
        line,
      )
    } else {
      cr017 = criterio(
        'CR-017',
        dim,
        'cumple',
        'Dependencias agregadas mencionadas en la tarea',
        path,
        frag,
        line,
      )
    }
  }

  const cr018 = insuficiente(
    'CR-018',
    dim,
    'Sin senales claras de ampliacion o restriccion de permisos',
  )

  return [[cr013, cr014, cr015, cr016, cr017, cr018], {}]
}

function analizarProporcionalidad(
  entrada: Entrada,
  clasificacion: FileClassification,
  archivos: ArchivoDiff[],
): [Criterio[], Record<string, unknown>] {
  const dim: DimensionNombre = 'proporcionalidad'
  const ctx = entrada.context || {}
  const vol = clasificacion.realVolume || { files: 0, additions: 0, deletions: 0 }
  const additions = Number(vol.additions || 0)
  const deletions = Number(vol.deletions || 0)
  const files = Number(vol.files || 0)
  const suggested = nivelSugerido(clasificacion)
  const suggestedAmount = montoMedioNivel(suggested)
  let requestedI = 0
  try {
    requestedI = Math.trunc(Number(entrada.requested_amount || 0))
    if (Number.isNaN(requestedI)) requestedI = 0
  } catch {
    requestedI = 0
  }
  const requestedLevel = nivelParaMonto(requestedI)
  const umbral = umbralSpikeDesdeConfig()

  const [fA, frA, lA] = citar(archivos)
  const cr019 = criterio(
    'CR-019',
    dim,
    'cumple',
    `Volumen real: files=${files}, additions=${additions}, deletions=${deletions}`,
    fA,
    frA,
    lA,
  )
  const cr020 = criterio(
    'CR-020',
    dim,
    'cumple',
    `Nivel heuristicamente sugerido por volumen/archivos: ${suggested}`,
    fA,
    frA,
    lA,
  )
  const cr021 = criterio(
    'CR-021',
    dim,
    'cumple',
    `Dificultad aproximada por umbrales simulado -> ${suggested} (monto medio ${suggestedAmount})`,
    fA,
    frA,
    lA,
  )

  let cr022: Criterio
  if (requestedLevel == null) {
    cr022 = insuficiente(
      'CR-022',
      dim,
      'No se pudo situar el monto solicitado en la escala',
    )
  } else if (requestedLevel === suggested) {
    cr022 = criterio(
      'CR-022',
      dim,
      'cumple',
      `Monto solicitado (${requestedI}, nivel ${requestedLevel}) coincide con el sugerido (${suggested})`,
      fA,
      frA,
      lA,
    )
  } else {
    cr022 = criterio(
      'CR-022',
      dim,
      'no_cumple',
      `Monto solicitado (${requestedI}, nivel ${requestedLevel}) distinto del sugerido (${suggested})`,
      fA,
      frA,
      lA,
    )
  }

  let cr023: Criterio
  if (requestedI > umbral) {
    if (suggested === 'spike') {
      cr023 = criterio(
        'CR-023',
        dim,
        'cumple',
        `Monto ${requestedI} supera umbral_spike=${umbral} y el volumen sugiere spike`,
        fA,
        frA,
        lA,
      )
    } else {
      cr023 = criterio(
        'CR-023',
        dim,
        'no_cumple',
        `Monto ${requestedI} supera umbral_spike=${umbral} pero el volumen sugiere ${suggested}`,
        fA,
        frA,
        lA,
      )
    }
  } else {
    cr023 = criterio(
      'CR-023',
      dim,
      'cumple',
      `Monto ${requestedI} no supera umbral_spike=${umbral}; CR-023 no fuerza rechazo`,
      fA,
      frA,
      lA,
    )
  }

  const textoDep =
    String(ctx.body || '') +
    ' ' +
    String(ctx.linkedIssueBody || '') +
    ' ' +
    String(ctx.linkedIssueTitle || '')
  const depende = RE_DEPENDENCIA_EXTERNA.test(textoDep)
  let motivo: string | null = null
  if (depende) {
    motivo =
      'El body o la tarea mencionan repartir/dividir la recompensa ' +
      'o un acuerdo fuera del PR'
  }

  const meta = {
    suggestedLevel: suggested,
    suggestedAmount,
    dependeInformacionExterna: depende,
    motivoDependencia: motivo,
  }
  return [[cr019, cr020, cr021, cr022, cr023], meta]
}

export function analizarSimulado(
  dimension: DimensionNombre,
  entrada: Entrada,
  clasificacion: FileClassification,
): [Criterio[], { input_tokens: number; output_tokens: number }, MetaAnalisis] {
  if (!(dimension in CODIGOS_POR_DIMENSION)) {
    throw new Error(`Dimension desconocida: ${dimension}`)
  }

  const ctx = entrada.context || {}
  let diff = ctx.diff || ''
  if (typeof diff !== 'string') diff = String(diff)
  const archivos = parseDiff(diff)

  const meta: MetaAnalisis = {
    automationSignals: [],
    tareaCorresponde: null,
    modelId: 'simulado-v1',
    diffCapado: false,
    dependeInformacionExterna: false,
    motivoDependencia: null,
  }

  let criterios: Criterio[]
  if (dimension === 'cumplimiento_alcance') {
    const [c, extra] = analizarAlcance(entrada, clasificacion, archivos)
    criterios = c
    Object.assign(meta, extra)
  } else if (dimension === 'calidad_tecnica') {
    const [c, extra] = analizarCalidad(entrada, clasificacion, archivos)
    criterios = c
    Object.assign(meta, extra)
  } else if (dimension === 'riesgos_seguridad') {
    const [c, extra] = analizarSeguridad(entrada, clasificacion, archivos)
    criterios = c
    Object.assign(meta, extra)
  } else {
    const [c, extra] = analizarProporcionalidad(
      entrada,
      clasificacion,
      archivos,
    )
    criterios = c
    Object.assign(meta, extra)
  }

  const porCodigo: Record<string, Criterio> = {}
  for (const c of criterios) porCodigo[c.code] = c
  let ordenados = CODIGOS_POR_DIMENSION[dimension].map(
    (c) =>
      porCodigo[c] ||
      insuficiente(c, dimension, 'Criterio no evaluado por la heuristica'),
  )
  ordenados = postvalidarCriterios(ordenados, entrada, meta)
  return [ordenados, { input_tokens: 0, output_tokens: 0 }, meta]
}

export function analizarTodasSimulado(
  entrada: Entrada,
  clasificacion: FileClassification,
): [Criterio[], { input_tokens: number; output_tokens: number }, MetaAnalisis] {
  const todos: Criterio[] = []
  const tokensUso = { input_tokens: 0, output_tokens: 0 }
  const meta: MetaAnalisis = {
    automationSignals: [],
    tareaCorresponde: null,
    suggestedLevel: null,
    suggestedAmount: null,
    dependeInformacionExterna: false,
    motivoDependencia: null,
    modelId: 'simulado-v1',
    diffCapado: false,
  }

  for (const dimension of DIMENSIONES) {
    const [criterios, uso, m] = analizarSimulado(
      dimension,
      entrada,
      clasificacion,
    )
    todos.push(...criterios)
    tokensUso.input_tokens += uso.input_tokens
    tokensUso.output_tokens += uso.output_tokens
    if (dimension === 'cumplimiento_alcance') {
      meta.tareaCorresponde = m.tareaCorresponde ?? null
    }
    if (dimension === 'calidad_tecnica') {
      meta.automationSignals = [...(m.automationSignals || [])]
    }
    if (dimension === 'proporcionalidad') {
      meta.suggestedLevel = m.suggestedLevel ?? null
      meta.suggestedAmount = m.suggestedAmount ?? null
      meta.dependeInformacionExterna = Boolean(
        m.dependeInformacionExterna ?? false,
      )
      meta.motivoDependencia = m.motivoDependencia ?? null
    }
  }

  return [postvalidarCriterios(todos, entrada, meta), tokensUso, meta]
}
