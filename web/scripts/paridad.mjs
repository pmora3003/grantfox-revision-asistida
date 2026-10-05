#!/usr/bin/env node
/**
 * Compara procesarEntrada (TS) con la salida de reglas de Python.
 * Hace backup/restore de web/public/datos.json porque el CLI lo reescribe.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(__dirname, '..')
const repoRoot = resolve(webRoot, '..')
const datosPath = join(webRoot, 'public', 'datos.json')
const venvPython = join(repoRoot, '.venv', 'bin', 'python')
const revisarBin = join(repoRoot, '.venv', 'bin', 'revisar')

async function loadProcesarEntrada() {
  const mod = await import('../src/motor/index.ts')
  return mod.procesarEntrada
}

function leerJsonl(path) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

function correrPythonCasosPrueba(casosPath, salidaDir) {
  const backup = existsSync(datosPath)
    ? readFileSync(datosPath, 'utf8')
    : null
  try {
    const r = spawnSync(
      revisarBin,
      [
        '--casos',
        casosPath,
        '--todos',
        '--modo',
        'reglas',
        '--salida',
        salidaDir,
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env },
      },
    )
    if (r.status !== 0) {
      throw new Error(
        `CLI Python fallo (${r.status}):\n${r.stdout || ''}\n${r.stderr || ''}`,
      )
    }
  } finally {
    if (backup != null) writeFileSync(datosPath, backup, 'utf8')
  }

  const archivos = readdirSync(salidaDir).filter((f) => f.endsWith('.json'))
  const porId = new Map()
  for (const f of archivos) {
    const data = JSON.parse(readFileSync(join(salidaDir, f), 'utf8'))
    porId.set(data.contributionId, data)
  }
  return porId
}

function salidasDesdeDatosJson() {
  const data = JSON.parse(readFileSync(datosPath, 'utf8'))
  const porId = new Map()
  for (const item of data) {
    const salida = item.salida || item
    porId.set(salida.contributionId, salida)
  }
  return porId
}

function compararCaso(id, py, ts) {
  const diffs = []
  if (py.admissibility?.outcome !== ts.admissibility?.outcome) {
    diffs.push(
      `admissibility.outcome: py=${py.admissibility?.outcome} ts=${ts.admissibility?.outcome}`,
    )
  }
  if ((py.admissibility?.stoppedAt ?? null) !== (ts.admissibility?.stoppedAt ?? null)) {
    diffs.push(
      `admissibility.stoppedAt: py=${py.admissibility?.stoppedAt} ts=${ts.admissibility?.stoppedAt}`,
    )
  }
  const pyCrit = Object.fromEntries(
    (py.criteria || []).map((c) => [c.code, c.level]),
  )
  const tsCrit = Object.fromEntries(
    (ts.criteria || []).map((c) => [c.code, c.level]),
  )
  const codes = new Set([...Object.keys(pyCrit), ...Object.keys(tsCrit)])
  for (const code of [...codes].sort()) {
    if (pyCrit[code] !== tsCrit[code]) {
      diffs.push(`criteria.${code}: py=${pyCrit[code]} ts=${tsCrit[code]}`)
    }
  }
  if (py.recommendation?.value !== ts.recommendation?.value) {
    diffs.push(
      `recommendation: py=${py.recommendation?.value} ts=${ts.recommendation?.value}`,
    )
  }
  if (py.reward?.suggestedLevel !== ts.reward?.suggestedLevel) {
    diffs.push(
      `suggestedLevel: py=${py.reward?.suggestedLevel} ts=${ts.reward?.suggestedLevel}`,
    )
  }
  if (py.confidence?.band !== ts.confidence?.band) {
    diffs.push(
      `confidence.band: py=${py.confidence?.band} ts=${ts.confidence?.band}`,
    )
  }
  return diffs
}

function imprimirTabla(filas) {
  console.log('')
  console.log(
    'caso'.padEnd(28) +
      'ok'.padEnd(6) +
      'diffs',
  )
  console.log('-'.repeat(80))
  for (const f of filas) {
    console.log(
      f.id.padEnd(28) +
        (f.ok ? 'OK' : 'FAIL').padEnd(6) +
        (f.diffs[0] || ''),
    )
    for (const d of f.diffs.slice(1)) {
      console.log(' '.repeat(34) + d)
    }
  }
}

async function evaluarConjunto(nombre, casosPath, pyPorId, procesarEntrada) {
  const casos = leerJsonl(casosPath)
  const filas = []
  let fallos = 0
  for (const registro of casos) {
    const id = String(registro.id)
    const py = pyPorId.get(id)
    if (!py) {
      filas.push({ id, ok: false, diffs: ['sin salida Python'] })
      fallos += 1
      continue
    }
    const ts = await procesarEntrada(registro)
    const diffs = compararCaso(id, py, ts)
    if (diffs.length) fallos += 1
    filas.push({ id, ok: !diffs.length, diffs })
  }
  console.log(`\n=== ${nombre} (${casos.length} casos, ${fallos} fallos) ===`)
  imprimirTabla(filas)
  return fallos
}

async function main() {
  // Asegurar config generada
  const gen = spawnSync(process.execPath, [join(__dirname, 'generar-config.mjs')], {
    cwd: webRoot,
    encoding: 'utf8',
  })
  if (gen.status !== 0) {
    console.error(gen.stdout, gen.stderr)
    process.exit(1)
  }

  if (!existsSync(revisarBin) && !existsSync(venvPython)) {
    console.error('No se encontro .venv/bin/revisar ni python')
    process.exit(1)
  }

  const procesarEntrada = await loadProcesarEntrada()

  // Demo: usar datos.json publicado (salida simulada ya materializada)
  const demoPath = join(repoRoot, 'data', 'casos-demo.jsonl')
  const pyDemo = salidasDesdeDatosJson()

  // Prueba: correr CLI a temp y restaurar datos.json
  const pruebaPath = join(repoRoot, 'data', 'casos-prueba.jsonl')
  const tmp = mkdtempSync(join(tmpdir(), 'paridad-'))
  let fallos = 0
  try {
    const pyPrueba = correrPythonCasosPrueba(pruebaPath, tmp)
    fallos += await evaluarConjunto(
      'casos-prueba',
      pruebaPath,
      pyPrueba,
      procesarEntrada,
    )
    fallos += await evaluarConjunto(
      'casos-demo',
      demoPath,
      pyDemo,
      procesarEntrada,
    )
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  console.log('')
  if (fallos) {
    console.error(`Paridad incompleta: ${fallos} diferencias`)
    process.exit(1)
  }
  console.log('Paridad 100% en ambos conjuntos')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
