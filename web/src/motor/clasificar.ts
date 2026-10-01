import type { ByType, FileClassification, FileStat } from '../types.ts'

type TipoArchivo =
  | 'codigo'
  | 'pruebas'
  | 'documentacion'
  | 'generado'
  | 'configuracion'

const LOCKFILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'poetry.lock',
  'Gemfile.lock',
  'go.sum',
  'composer.lock',
  'bun.lockb',
])

const SOURCE_EXTENSIONS = new Set([
  '.rs',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.go',
  '.sol',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.cpp',
  '.h',
  '.cs',
  '.rb',
  '.php',
  '.vue',
  '.svelte',
  '.move',
  '.css',
  '.scss',
  '.html',
  '.sql',
  '.sh',
])

const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.rst', '.txt', '.adoc'])
const CONFIG_EXTENSIONS = new Set([
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
])

function nombreArchivo(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] ?? path
}

function extension(path: string): string {
  const norm = path.replace(/\\/g, '/')
  const base = nombreArchivo(norm)
  const idx = base.lastIndexOf('.')
  if (idx <= 0) return ''
  return base.slice(idx).toLowerCase()
}

function esGenerado(path: string): boolean {
  const norm = path.replace(/\\/g, '/')
  const lower = norm.toLowerCase()
  const nombre = nombreArchivo(norm)

  if (LOCKFILES.has(nombre)) return true
  if (lower.endsWith('.min.js') || lower.endsWith('.map')) return true
  if (lower.includes('/dist/') || lower.startsWith('dist/')) return true
  if (lower.includes('/build/') || lower.startsWith('build/')) return true
  if (lower.includes('__snapshots__') || lower.endsWith('.snap')) return true
  if (lower.includes('/snapshots/') || lower.startsWith('snapshots/')) return true
  if (lower.includes('/test_snapshots/') || lower.startsWith('test_snapshots/')) {
    return true
  }
  if (
    lower.endsWith('.json') &&
    (lower.includes('/test_snapshots/') || lower.startsWith('test_snapshots/'))
  ) {
    return true
  }
  if (lower.includes('/generated/') || lower.startsWith('generated/')) return true
  return false
}

function esPruebas(path: string): boolean {
  const norm = path.replace(/\\/g, '/')
  const lower = norm.toLowerCase()
  const nombre = nombreArchivo(lower)

  if (lower.includes('/test/') || lower.includes('/tests/')) return true
  if (lower.includes('/__tests__/') || lower.startsWith('__tests__/')) return true
  if (
    lower.includes('_test.') ||
    lower.endsWith('_test.py') ||
    lower.endsWith('_test.rs')
  ) {
    return true
  }
  if (lower.includes('.test.') || lower.includes('.spec.')) return true
  if (nombre.startsWith('test_') && nombre.endsWith('.py')) return true
  if (nombre.endsWith('tests.rs')) return true
  return false
}

function esDocumentacion(path: string): boolean {
  const norm = path.replace(/\\/g, '/')
  const lower = norm.toLowerCase()
  const nombre = nombreArchivo(lower)
  const ext = extension(path)

  if (DOC_EXTENSIONS.has(ext)) return true
  if (lower.includes('/docs/') || lower.startsWith('docs/')) return true
  if (
    nombre === 'license' ||
    nombre === 'changelog' ||
    nombre === 'todo' ||
    nombre === 'license.md' ||
    nombre === 'changelog.md' ||
    nombre === 'todo.md'
  ) {
    return true
  }
  if (
    nombre.startsWith('license') ||
    nombre.startsWith('changelog') ||
    nombre.startsWith('todo')
  ) {
    if (DOC_EXTENSIONS.has(ext) || !nombre.includes('.')) return true
  }
  const upperNames = new Set([nombre.toUpperCase(), nombre])
  if (
    nombre === 'LICENSE' ||
    nombre === 'CHANGELOG' ||
    nombre === 'TODO' ||
    [...upperNames].some((n) => n === 'LICENSE' || n === 'CHANGELOG' || n === 'TODO')
  ) {
    return true
  }
  if (nombre.toLowerCase() === 'license' || nombre.toLowerCase() === 'changelog' || nombre.toLowerCase() === 'todo') {
    return true
  }
  return false
}

function esConfiguracion(path: string): boolean {
  const norm = path.replace(/\\/g, '/')
  const lower = norm.toLowerCase()
  const nombre = nombreArchivo(lower)
  const ext = extension(path)

  if (CONFIG_EXTENSIONS.has(ext)) return true
  if (nombre === '.env.example' || lower.endsWith('.env.example')) return true
  if (nombre.startsWith('.') && nombre !== '.' && nombre !== '..') return true
  for (const prefijo of ['.eslintrc', '.prettierrc', '.gitignore', '.editorconfig']) {
    if (nombre.startsWith(prefijo)) return true
  }
  if (nombre.toLowerCase() === 'dockerfile' || nombre.toLowerCase() === 'makefile') {
    return true
  }
  if (nombre.endsWith('.config.js') || nombre.endsWith('.config.ts')) return true
  if (nombre.endsWith('.config.mjs') || nombre.endsWith('.config.cjs')) return true
  if (nombre === 'cargo.toml' || nombre === 'package.json') return true
  if (nombre.startsWith('tsconfig') && ext === '.json') return true
  if (lower.includes('/.github/') || lower.startsWith('.github/')) return true
  if (ext === '' && !esPruebas(path)) return true
  return false
}

export function clasificarArchivo(path: string): TipoArchivo {
  if (esGenerado(path)) return 'generado'
  if (esPruebas(path)) return 'pruebas'
  if (esDocumentacion(path)) return 'documentacion'
  if (esConfiguracion(path)) return 'configuracion'
  if (SOURCE_EXTENSIONS.has(extension(path))) return 'codigo'
  return 'configuracion'
}

export function clasificarEntrega(
  fileStats: FileStat[] | null | undefined,
): FileClassification {
  const porArchivo: { path: string; tipo: string }[] = []
  const conteos: ByType = {
    codigo: 0,
    pruebas: 0,
    documentacion: 0,
    generado: 0,
    configuracion: 0,
  }
  let realFiles = 0
  let realAdditions = 0
  let realDeletions = 0
  const excluded: string[] = []

  for (const item of fileStats || []) {
    const ruta = String(item?.path ?? '')
    const tipo = clasificarArchivo(ruta)
    porArchivo.push({ path: ruta, tipo })
    conteos[tipo] += 1

    if (tipo === 'codigo' || tipo === 'pruebas' || tipo === 'configuracion') {
      realFiles += 1
      realAdditions += Number(item?.additions || 0)
      realDeletions += Number(item?.deletions || 0)
    } else if (tipo === 'generado' || tipo === 'documentacion') {
      excluded.push(ruta)
    }
  }

  return {
    byType: conteos,
    realVolume: {
      files: realFiles,
      additions: realAdditions,
      deletions: realDeletions,
    },
    excludedFromVolume: excluded,
    porArchivo,
  }
}
