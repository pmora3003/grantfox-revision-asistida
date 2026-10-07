#!/usr/bin/env node
/**
 * Lee config/escala.yaml, config/admisibilidad.yaml y config/marcos.yaml y genera
 * web/src/motor/config.generada.ts (fuente unica de umbrales en el motor TS).
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(__dirname, '..')
const repoRoot = resolve(webRoot, '..')

const escalaPath = join(repoRoot, 'config', 'escala.yaml')
const admPath = join(repoRoot, 'config', 'admisibilidad.yaml')
const marcosPath = join(repoRoot, 'config', 'marcos.yaml')
const promptPath = join(repoRoot, 'prompts', 'instruccion_v2.md')
const outPath = join(webRoot, 'src', 'motor', 'config.generada.ts')

const escalaRaw = parseYaml(readFileSync(escalaPath, 'utf8'))
const admRaw = parseYaml(readFileSync(admPath, 'utf8'))
const marcosRaw = parseYaml(readFileSync(marcosPath, 'utf8'))

if (!escalaRaw || typeof escalaRaw !== 'object') {
  throw new Error(`YAML invalido: ${escalaPath}`)
}
if (!admRaw || typeof admRaw !== 'object') {
  throw new Error(`YAML invalido: ${admPath}`)
}
if (!marcosRaw || typeof marcosRaw !== 'object') {
  throw new Error(`YAML invalido: ${marcosPath}`)
}

const niveles = (escalaRaw.niveles || []).map((item) => ({
  nombre: String(item.nombre),
  minimo: Number(item.min),
  maximo: item.max == null ? null : Number(item.max),
}))

const escala = {
  version: String(escalaRaw.version ?? ''),
  fecha: String(escalaRaw.fecha ?? ''),
  niveles,
  confianza: { ...(escalaRaw.confianza || {}) },
  severidad: { ...(escalaRaw.severidad || {}) },
  pesos_severidad: { ...(escalaRaw.pesos_severidad || {}) },
  modelo: { ...(escalaRaw.modelo || {}) },
  techo_observado:
    escalaRaw.techo_observado == null ? null : Number(escalaRaw.techo_observado),
  reglas: { ...(escalaRaw.reglas || escalaRaw.simulado || {}) },
  recomendacion: { ...(escalaRaw.recomendacion || {}) },
  raw: escalaRaw,
}

const admisibilidad = {
  version: String(admRaw.version ?? ''),
  fecha: String(admRaw.fecha ?? ''),
  condiciones: (admRaw.condiciones || []).map((c) => ({ ...c })),
  raw: admRaw,
}

function normalizarEntradasMarco(bloque) {
  const out = {}
  for (const [codigo, valor] of Object.entries(bloque || {})) {
    const item = valor && typeof valor === 'object' ? valor : {}
    out[codigo] = {
      marco: String(item.marco ?? ''),
      url: item.url == null ? null : String(item.url),
    }
  }
  return out
}

const marcos = {
  version: String(marcosRaw.version ?? ''),
  fecha: String(marcosRaw.fecha ?? ''),
  condiciones: normalizarEntradasMarco(marcosRaw.condiciones),
  criterios: normalizarEntradasMarco(marcosRaw.criterios),
  raw: marcosRaw,
}

function versionInstruccion(texto) {
  for (const linea of texto.split(/\r?\n/).slice(0, 10)) {
    if (linea.startsWith('version:')) {
      return linea.split(':', 2)[1].trim()
    }
  }
  return 'instruccion-v2'
}

function textoInstruccionBase(texto) {
  if (!texto.startsWith('---')) return texto
  const fin = texto.indexOf('---', 3)
  if (fin === -1) return texto
  return texto.slice(fin + 3).replace(/^\n+/, '')
}

function formatearEscala(cfg) {
  const lineas = [
    'Niveles de la escala de recompensa (unidades USDC / escala de plataforma):',
  ]
  for (const nivel of cfg.niveles) {
    const maximo = nivel.maximo == null ? 'None' : String(nivel.maximo)
    lineas.push(`- ${nivel.nombre}: ${nivel.minimo} a ${maximo}`)
  }
  lineas.push(
    'Spike: investigacion exhaustiva, o implementacion completa de una ' +
      'funcionalidad mayor con volumen elevado de codigo.',
  )
  return lineas.join('\n')
}

function umbralSpike(cfg) {
  for (const nivel of cfg.niveles) {
    if (nivel.nombre === 'alto' && nivel.maximo != null) {
      return Number(nivel.maximo)
    }
  }
  return 100
}

const promptTexto = readFileSync(promptPath, 'utf8')
const instructionVersion = versionInstruccion(promptTexto)
const instructionText = textoInstruccionBase(promptTexto)
  .replaceAll('{escala}', formatearEscala(escala))
  .replaceAll('{umbral_spike}', String(umbralSpike(escala)))
const instructionHash = createHash('sha256')
  .update(instructionText, 'utf8')
  .digest('hex')

mkdirSync(dirname(outPath), { recursive: true })

const banner =
  '/* eslint-disable */\n' +
  '// Generado por web/scripts/generar-config.mjs. No editar a mano.\n'

const body = `${banner}
export const instructionVersion = ${JSON.stringify(instructionVersion)} as const
export const instructionHash = ${JSON.stringify(instructionHash)} as const

export const escala = ${JSON.stringify(escala, null, 2)} as const

export const admisibilidad = ${JSON.stringify(admisibilidad, null, 2)} as const

export const marcos = ${JSON.stringify(marcos, null, 2)} as const

export type NivelNombre = 'bajo' | 'medio' | 'alto' | 'spike'

export function parametrosCa(codigo: string): Record<string, unknown> {
  for (const cond of admisibilidad.condiciones) {
    if ((cond as { codigo?: string }).codigo === codigo) {
      return { ...(((cond as { parametros?: Record<string, unknown> }).parametros) || {}) }
    }
  }
  return {}
}

export function umbralSpikeDesdeConfig(): number {
  for (const nivel of escala.niveles) {
    if (nivel.nombre === 'alto' && nivel.maximo != null) {
      return Number(nivel.maximo)
    }
  }
  return 100
}

export function nivelParaMonto(monto: number): NivelNombre | null {
  const valor = Math.trunc(monto)
  for (const nivel of escala.niveles) {
    if (nivel.maximo == null) {
      if (valor >= nivel.minimo) return nivel.nombre as NivelNombre
    } else if (nivel.minimo <= valor && valor <= nivel.maximo) {
      return nivel.nombre as NivelNombre
    }
  }
  if (escala.niveles.length) {
    const minimoEscala = Math.min(...escala.niveles.map((n) => n.minimo))
    if (valor < minimoEscala) return 'bajo'
  }
  return null
}

export function rangoNivel(nombre: string): [number, number | null] | null {
  for (const nivel of escala.niveles) {
    if (nivel.nombre === nombre) {
      return [nivel.minimo, nivel.maximo]
    }
  }
  return null
}

export function marcoDeCriterio(codigo: string): { marco: string; url: string | null } {
  const entrada = (marcos.criterios as Record<string, { marco: string; url: string | null }>)[codigo]
  return entrada || { marco: '', url: null }
}

export function fuenteDeCondicion(codigo: string): { marco: string; url: string | null } {
  const entrada = (marcos.condiciones as Record<string, { marco: string; url: string | null }>)[codigo]
  return entrada || { marco: '', url: null }
}

export function normalizarModoEjecucion(modo: string | null | undefined): string | null {
  if (modo == null) return null
  if (modo === 'simulado') return 'reglas'
  return modo
}
`

writeFileSync(outPath, body, 'utf8')
console.log(`Escrito ${outPath}`)
console.log(`instructionVersion=${instructionVersion}`)
console.log(`instructionHash=${instructionHash}`)
