/** Anonimizacion y redaccion de secretos (mismas regex que Python). */

export const RE_SECRET_KV_SOURCE =
  String.raw`\b(password|passwd|secret|token|api_key|apikey|private_key|client_secret)(\s*[:=]\s*)(?<q>["']?)(?<val>[^"'\s]+)\k<q>`

export const RE_SECRETOS_SOURCES: Array<{ source: string; flags: string }> = [
  { source: String.raw`-----BEGIN[^-]+KEY-----[\s\S]*?-----END[^-]+KEY-----`, flags: 'gi' },
  { source: String.raw`\bsk-[A-Za-z0-9]{20,}\b`, flags: 'gi' },
  { source: String.raw`\bAKIA[0-9A-Z]{16}\b`, flags: 'g' },
  { source: String.raw`\bS[A-Z2-7]{55}\b`, flags: 'g' },
  { source: String.raw`\b[A-Za-z0-9+/]{33,}={0,2}\b`, flags: 'g' },
  { source: String.raw`\b[0-9a-fA-F]{33,}\b`, flags: 'g' },
]

function reEmail(): RegExp {
  return /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi
}

function reStellar(): RegExp {
  return /G[A-Z2-7]{55}/g
}

function reEthereum(): RegExp {
  return /0x[a-fA-F0-9]{40}/g
}

export function reSecretKv(): RegExp {
  return new RegExp(RE_SECRET_KV_SOURCE, 'gi')
}

export function reSecretos(): RegExp[] {
  return RE_SECRETOS_SOURCES.map((p) => new RegExp(p.source, p.flags))
}

export function anonimizarTexto(texto: string | null | undefined): string | null {
  if (texto == null) return null
  if (!texto) return texto
  let resultado = texto.replace(reEmail(), '[redactado]')
  resultado = resultado.replace(reStellar(), '[redactado]')
  resultado = resultado.replace(reEthereum(), '[redactado]')
  return resultado
}

export function redactarSecretos(texto: string | null | undefined): string | null {
  if (texto == null) return null
  let resultado = texto.replace(
    reSecretKv(),
    (_m: string, g1: string, g2: string, q: string) =>
      `${g1}${g2}${q}[valor omitido]${q}`,
  )
  for (const patron of reSecretos()) {
    resultado = resultado.replace(patron, '[valor omitido]')
  }
  return resultado
}

export function sanitizarTextoModelo(
  texto: string | null | undefined,
): string | null {
  return redactarSecretos(anonimizarTexto(texto))
}

export function secretoEnLinea(texto: string): boolean {
  if (reSecretKv().test(texto)) return true
  for (const patron of reSecretos()) {
    if (patron.test(texto)) return true
  }
  return false
}
