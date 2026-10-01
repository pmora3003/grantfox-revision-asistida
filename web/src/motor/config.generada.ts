/* eslint-disable */
// Generado por web/scripts/generar-config.mjs. No editar a mano.

export const instructionVersion = "instruccion-v1" as const
export const instructionHash = "77a793bf327a47ec748afd40cc34a457bf844db6c1e8234200d0a63ad2054435" as const

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
    "alto": 0.9,
    "medio": 0.7,
    "penalizaciones": {
      "truncado": 0.25,
      "tarea_no_corresponde": 0.25,
      "evidencia_insuficiente_excesiva": 0.2,
      "dependencia_externa": 0.4,
      "simulado": 0.15
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
    "temperatura": 0,
    "max_tokens": 4096
  },
  "techo_observado": 150,
  "simulado": {
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
      "alto": 0.9,
      "medio": 0.7,
      "penalizaciones": {
        "truncado": 0.25,
        "tarea_no_corresponde": 0.25,
        "evidencia_insuficiente_excesiva": 0.2,
        "dependencia_externa": 0.4,
        "simulado": 0.15
      },
      "umbral_evidencia_insuficiente": 0.3
    },
    "simulado": {
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
      "temperatura": 0,
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
