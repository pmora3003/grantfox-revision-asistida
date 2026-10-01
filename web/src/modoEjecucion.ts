import type { CasoRevision, Salida } from './types'

export type ModoEjecucion = 'real' | 'simulado'

export function modoDeSalida(salida: Salida): ModoEjecucion {
  return salida.modoEjecucion === 'real' ? 'real' : 'simulado'
}

export function todosCasosEnModoReal(cases: CasoRevision[]): boolean {
  if (cases.length === 0) return false
  return cases.every((c) => modoDeSalida(c.salida) === 'real')
}

export function etiquetaModoCaso(salida: Salida): string {
  return modoDeSalida(salida) === 'real'
    ? 'Análisis con modelo de lenguaje'
    : 'Análisis simulado (heurísticas)'
}
