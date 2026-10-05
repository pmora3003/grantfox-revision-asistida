/* eslint-disable */
// Generado por web/scripts/generar-config.mjs. No editar a mano.

export const instructionVersion = "instruccion-v1" as const
export const instructionHash = "0eb3c0b4b5f5f1f150a8333b7526c1391d4a9d83f6d1ea0c49abaf3cc92a9203" as const

export const escala = {
  "version": "1.0",
  "fecha": "2026-09-30",
  "niveles": [
    {
      "nombre": "bajo",
      "minimo": 20,
      "maximo": 40
    },
    {
      "nombre": "medio",
      "minimo": 41,
      "maximo": 70
    },
    {
      "nombre": "alto",
      "minimo": 71,
      "maximo": 100
    },
    {
      "nombre": "spike",
      "minimo": 101,
      "maximo": null
    }
  ],
  "confianza": {
    "alto_desde": 0.85,
    "medio_desde": 0.6,
    "penalizaciones": {
      "truncado": 0.25,
      "tarea_no_corresponde": 0.25,
      "evidencia_insuficiente_excesiva": 0.2,
      "dependencia_externa": 0.4,
      "reglas": 0.2
    },
    "umbral_evidencia_insuficiente": 0.3
  },
  "severidad": {
    "CR-001": "alta",
    "CR-002": "media",
    "CR-003": "alta",
    "CR-004": "baja",
    "CR-005": "media",
    "CR-006": "baja",
    "CR-007": "baja",
    "CR-008": "media",
    "CR-009": "baja",
    "CR-010": "alta",
    "CR-011": "alta",
    "CR-012": "baja",
    "CR-013": "alta",
    "CR-014": "alta",
    "CR-015": "media",
    "CR-016": "alta",
    "CR-017": "media",
    "CR-018": "media",
    "CR-019": "baja",
    "CR-020": "baja",
    "CR-021": "baja",
    "CR-022": "media",
    "CR-023": "media"
  },
  "pesos_severidad": {
    "alta": 3,
    "media": 2,
    "baja": 1
  },
  "modelo": {
    "nombre": "claude-sonnet-5-5",
    "esfuerzo": "medium",
    "max_tokens": 4096
  },
  "techo_observado": 150,
  "reglas": {
    "lineas_medio": 150,
    "lineas_alto": 400,
    "lineas_spike": 900,
    "archivos_medio": 6,
    "archivos_alto": 10,
    "archivos_spike": 15
  },
  "raw": {
    "version": "1.0",
    "fecha": "2026-09-30",
    "niveles": [
      {
        "nombre": "bajo",
        "min": 20,
        "max": 40
      },
      {
        "nombre": "medio",
        "min": 41,
        "max": 70
      },
      {
        "nombre": "alto",
        "min": 71,
        "max": 100
      },
      {
        "nombre": "spike",
        "min": 101,
        "max": null
      }
    ],
    "techo_observado": 150,
    "confianza": {
      "alto_desde": 0.85,
      "medio_desde": 0.6,
      "penalizaciones": {
        "truncado": 0.25,
        "tarea_no_corresponde": 0.25,
        "evidencia_insuficiente_excesiva": 0.2,
        "dependencia_externa": 0.4,
        "reglas": 0.2
      },
      "umbral_evidencia_insuficiente": 0.3
    },
    "reglas": {
      "lineas_medio": 150,
      "lineas_alto": 400,
      "lineas_spike": 900,
      "archivos_medio": 6,
      "archivos_alto": 10,
      "archivos_spike": 15
    },
    "severidad": {
      "CR-001": "alta",
      "CR-002": "media",
      "CR-003": "alta",
      "CR-004": "baja",
      "CR-005": "media",
      "CR-006": "baja",
      "CR-007": "baja",
      "CR-008": "media",
      "CR-009": "baja",
      "CR-010": "alta",
      "CR-011": "alta",
      "CR-012": "baja",
      "CR-013": "alta",
      "CR-014": "alta",
      "CR-015": "media",
      "CR-016": "alta",
      "CR-017": "media",
      "CR-018": "media",
      "CR-019": "baja",
      "CR-020": "baja",
      "CR-021": "baja",
      "CR-022": "media",
      "CR-023": "media"
    },
    "pesos_severidad": {
      "alta": 3,
      "media": 2,
      "baja": 1
    },
    "modelo": {
      "nombre": "claude-sonnet-5-5",
      "esfuerzo": "medium",
      "max_tokens": 4096
    }
  }
} as const

export const admisibilidad = {
  "version": "1.0",
  "fecha": "2026-09-30",
  "condiciones": [
    {
      "codigo": "CA-001",
      "enunciado": "La solicitud de integración está fusionada en el repositorio de destino."
    },
    {
      "codigo": "CA-002",
      "enunciado": "La solicitud de integración modifica al menos seis archivos.",
      "parametros": {
        "min_archivos": 6
      }
    },
    {
      "codigo": "CA-003",
      "enunciado": "La entrega contiene al menos un archivo de código, es decir, no está compuesta únicamente por documentación o por archivos de configuración."
    },
    {
      "codigo": "CA-004",
      "enunciado": "La solicitud de integración indica cuál es la tarea técnica que atiende."
    },
    {
      "codigo": "CA-005",
      "enunciado": "La persona contribuidora mantiene la cuenta habilitada, con la verificación de identidad completada y con un método de pago configurado."
    }
  ],
  "raw": {
    "version": "1.0",
    "fecha": "2026-09-30",
    "condiciones": [
      {
        "codigo": "CA-001",
        "enunciado": "La solicitud de integración está fusionada en el repositorio de destino."
      },
      {
        "codigo": "CA-002",
        "enunciado": "La solicitud de integración modifica al menos seis archivos.",
        "parametros": {
          "min_archivos": 6
        }
      },
      {
        "codigo": "CA-003",
        "enunciado": "La entrega contiene al menos un archivo de código, es decir, no está compuesta únicamente por documentación o por archivos de configuración."
      },
      {
        "codigo": "CA-004",
        "enunciado": "La solicitud de integración indica cuál es la tarea técnica que atiende."
      },
      {
        "codigo": "CA-005",
        "enunciado": "La persona contribuidora mantiene la cuenta habilitada, con la verificación de identidad completada y con un método de pago configurado."
      }
    ]
  }
} as const

export const marcos = {
  "version": "1.0",
  "fecha": "2026-10-04",
  "condiciones": {
    "CA-001": {
      "marco": "GrantFox, página Rewards; regla vigente del proceso (hallazgo H01)",
      "url": "https://docs.grantfox.xyz"
    },
    "CA-002": {
      "marco": "Regla vigente de la plataforma; umbral derivado del registro examinado (hallazgo H17)",
      "url": null
    },
    "CA-003": {
      "marco": "Regla vigente de la plataforma (hallazgo H17)",
      "url": null
    },
    "CA-004": {
      "marco": "GrantFox, páginas Best Practices y Linking Your Pull Request To The Issue",
      "url": "https://docs.grantfox.xyz"
    },
    "CA-005": {
      "marco": "GrantFox, Términos y Condiciones cláusula 9.1 y página Wallets & Payments",
      "url": "https://docs.grantfox.xyz"
    }
  },
  "criterios": {
    "CR-001": {
      "marco": "ISO/IEC 25010:2023, adecuación funcional",
      "url": "https://www.iso.org/standard/78176.html"
    },
    "CR-002": {
      "marco": "ISO/IEC 25010:2023, adecuación funcional",
      "url": "https://www.iso.org/standard/78176.html"
    },
    "CR-003": {
      "marco": "ISO/IEC 25010:2023, adecuación funcional",
      "url": "https://www.iso.org/standard/78176.html"
    },
    "CR-004": {
      "marco": "GrantFox, página Best Practices",
      "url": "https://docs.grantfox.xyz"
    },
    "CR-005": {
      "marco": "ISO/IEC 25010:2023, adecuación funcional y compatibilidad",
      "url": "https://www.iso.org/standard/78176.html"
    },
    "CR-006": {
      "marco": "ISO/IEC 25010:2023, mantenibilidad",
      "url": "https://www.iso.org/standard/78176.html"
    },
    "CR-007": {
      "marco": "ISO/IEC 25010:2023, mantenibilidad",
      "url": "https://www.iso.org/standard/78176.html"
    },
    "CR-008": {
      "marco": "ISO/IEC 25010:2023, fiabilidad",
      "url": "https://www.iso.org/standard/78176.html"
    },
    "CR-009": {
      "marco": "ISO/IEC 25010:2023, mantenibilidad y compatibilidad; Sadowski et al. (2018)",
      "url": "https://www.iso.org/standard/78176.html"
    },
    "CR-010": {
      "marco": "ISO/IEC 25010:2023, mantenibilidad",
      "url": "https://www.iso.org/standard/78176.html"
    },
    "CR-011": {
      "marco": "Contexto de GrantFox; Afroz et al. (2026) y Stenberg (2026)",
      "url": null
    },
    "CR-012": {
      "marco": "Contexto de GrantFox; hallazgo H16 del diagnóstico, sesión GF001",
      "url": null
    },
    "CR-013": {
      "marco": "NIST SP 800-218, PW.7. ISO/IEC 25010:2023, seguridad",
      "url": "https://doi.org/10.6028/NIST.SP.800-218"
    },
    "CR-014": {
      "marco": "NIST SP 800-218, PW.7. ISO/IEC 25010:2023, seguridad",
      "url": "https://doi.org/10.6028/NIST.SP.800-218"
    },
    "CR-015": {
      "marco": "NIST SP 800-218, PW.7. ISO/IEC 25010:2023, seguridad",
      "url": "https://doi.org/10.6028/NIST.SP.800-218"
    },
    "CR-016": {
      "marco": "NIST SP 800-218, PW.7",
      "url": "https://doi.org/10.6028/NIST.SP.800-218"
    },
    "CR-017": {
      "marco": "NIST SP 800-218, PW.7",
      "url": "https://doi.org/10.6028/NIST.SP.800-218"
    },
    "CR-018": {
      "marco": "NIST SP 800-218, PW.7. ISO/IEC 25010:2023, seguridad",
      "url": "https://doi.org/10.6028/NIST.SP.800-218"
    },
    "CR-019": {
      "marco": "Contexto de GrantFox; hallazgo H27 del diagnóstico, sesión GF001",
      "url": null
    },
    "CR-020": {
      "marco": "GrantFox, página Rewards",
      "url": "https://docs.grantfox.xyz"
    },
    "CR-021": {
      "marco": "GrantFox, escala de cuatro niveles validada en la sesión GF001",
      "url": null
    },
    "CR-022": {
      "marco": "GrantFox, Términos y Condiciones cláusula 8.4",
      "url": "https://docs.grantfox.xyz"
    },
    "CR-023": {
      "marco": "GrantFox, condiciones del nivel spike precisadas en la sesión GF001",
      "url": null
    }
  },
  "raw": {
    "version": "1.0",
    "fecha": "2026-10-04",
    "condiciones": {
      "CA-001": {
        "marco": "GrantFox, página Rewards; regla vigente del proceso (hallazgo H01)",
        "url": "https://docs.grantfox.xyz"
      },
      "CA-002": {
        "marco": "Regla vigente de la plataforma; umbral derivado del registro examinado (hallazgo H17)",
        "url": null
      },
      "CA-003": {
        "marco": "Regla vigente de la plataforma (hallazgo H17)",
        "url": null
      },
      "CA-004": {
        "marco": "GrantFox, páginas Best Practices y Linking Your Pull Request To The Issue",
        "url": "https://docs.grantfox.xyz"
      },
      "CA-005": {
        "marco": "GrantFox, Términos y Condiciones cláusula 9.1 y página Wallets & Payments",
        "url": "https://docs.grantfox.xyz"
      }
    },
    "criterios": {
      "CR-001": {
        "marco": "ISO/IEC 25010:2023, adecuación funcional",
        "url": "https://www.iso.org/standard/78176.html"
      },
      "CR-002": {
        "marco": "ISO/IEC 25010:2023, adecuación funcional",
        "url": "https://www.iso.org/standard/78176.html"
      },
      "CR-003": {
        "marco": "ISO/IEC 25010:2023, adecuación funcional",
        "url": "https://www.iso.org/standard/78176.html"
      },
      "CR-004": {
        "marco": "GrantFox, página Best Practices",
        "url": "https://docs.grantfox.xyz"
      },
      "CR-005": {
        "marco": "ISO/IEC 25010:2023, adecuación funcional y compatibilidad",
        "url": "https://www.iso.org/standard/78176.html"
      },
      "CR-006": {
        "marco": "ISO/IEC 25010:2023, mantenibilidad",
        "url": "https://www.iso.org/standard/78176.html"
      },
      "CR-007": {
        "marco": "ISO/IEC 25010:2023, mantenibilidad",
        "url": "https://www.iso.org/standard/78176.html"
      },
      "CR-008": {
        "marco": "ISO/IEC 25010:2023, fiabilidad",
        "url": "https://www.iso.org/standard/78176.html"
      },
      "CR-009": {
        "marco": "ISO/IEC 25010:2023, mantenibilidad y compatibilidad; Sadowski et al. (2018)",
        "url": "https://www.iso.org/standard/78176.html"
      },
      "CR-010": {
        "marco": "ISO/IEC 25010:2023, mantenibilidad",
        "url": "https://www.iso.org/standard/78176.html"
      },
      "CR-011": {
        "marco": "Contexto de GrantFox; Afroz et al. (2026) y Stenberg (2026)",
        "url": null
      },
      "CR-012": {
        "marco": "Contexto de GrantFox; hallazgo H16 del diagnóstico, sesión GF001",
        "url": null
      },
      "CR-013": {
        "marco": "NIST SP 800-218, PW.7. ISO/IEC 25010:2023, seguridad",
        "url": "https://doi.org/10.6028/NIST.SP.800-218"
      },
      "CR-014": {
        "marco": "NIST SP 800-218, PW.7. ISO/IEC 25010:2023, seguridad",
        "url": "https://doi.org/10.6028/NIST.SP.800-218"
      },
      "CR-015": {
        "marco": "NIST SP 800-218, PW.7. ISO/IEC 25010:2023, seguridad",
        "url": "https://doi.org/10.6028/NIST.SP.800-218"
      },
      "CR-016": {
        "marco": "NIST SP 800-218, PW.7",
        "url": "https://doi.org/10.6028/NIST.SP.800-218"
      },
      "CR-017": {
        "marco": "NIST SP 800-218, PW.7",
        "url": "https://doi.org/10.6028/NIST.SP.800-218"
      },
      "CR-018": {
        "marco": "NIST SP 800-218, PW.7. ISO/IEC 25010:2023, seguridad",
        "url": "https://doi.org/10.6028/NIST.SP.800-218"
      },
      "CR-019": {
        "marco": "Contexto de GrantFox; hallazgo H27 del diagnóstico, sesión GF001",
        "url": null
      },
      "CR-020": {
        "marco": "GrantFox, página Rewards",
        "url": "https://docs.grantfox.xyz"
      },
      "CR-021": {
        "marco": "GrantFox, escala de cuatro niveles validada en la sesión GF001",
        "url": null
      },
      "CR-022": {
        "marco": "GrantFox, Términos y Condiciones cláusula 8.4",
        "url": "https://docs.grantfox.xyz"
      },
      "CR-023": {
        "marco": "GrantFox, condiciones del nivel spike precisadas en la sesión GF001",
        "url": null
      }
    }
  }
} as const

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
