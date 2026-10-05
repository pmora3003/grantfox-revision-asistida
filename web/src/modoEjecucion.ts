import type { CasoRevision, Salida } from './types'

export type ModoEjecucion = 'real' | 'reglas' | 'simulado'

export function modoDeSalida(salida: Salida): ModoEjecucion {
  if (salida.modoEjecucion === 'real') return 'real'
  if (salida.modoEjecucion === 'reglas' || salida.modoEjecucion === 'simulado') {
    return 'reglas'
  }
  return 'reglas'
}

export function etiquetaModo(modo: ModoEjecucion): string {
  return modo === 'real'
    ? 'Análisis con modelo'
    : 'Análisis con motor de reglas'
}

export function todosCasosEnModoReal(cases: CasoRevision[]): boolean {
  if (cases.length === 0) return false
  return cases.every((c) => modoDeSalida(c.salida) === 'real')
}

export function etiquetaModoCaso(salida: Salida): string {
  return modoDeSalida(salida) === 'real'
    ? 'Análisis con modelo de lenguaje'
    : 'Análisis con motor de reglas'
}
