/** Genera web/public/datos.json de muestra (MUESTRA-1 y MUESTRA-2). */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DIMENSION_CODES = {
  cumplimiento_alcance: ['CR-001', 'CR-002', 'CR-003', 'CR-004', 'CR-005'],
  calidad_tecnica: ['CR-006', 'CR-007', 'CR-008', 'CR-009', 'CR-010', 'CR-011', 'CR-012'],
  riesgos_seguridad: ['CR-013', 'CR-014', 'CR-015', 'CR-016', 'CR-017', 'CR-018'],
  proporcionalidad: ['CR-019', 'CR-020', 'CR-021', 'CR-022', 'CR-023'],
}

const ALL_CODES = Object.values(DIMENSION_CODES).flat()

function criteriaForSample(levelsByCode) {
  return ALL_CODES.map((code) => {
    let dimension = 'cumplimiento_alcance'
    for (const [dim, codes] of Object.entries(DIMENSION_CODES)) {
      if (codes.includes(code)) dimension = dim
    }
    const level = levelsByCode[code] ?? 'evidencia_insuficiente'
    return {
      code,
      dimension,
      level,
      evidence:
        level === 'evidencia_insuficiente'
          ? 'Análisis no ejecutado por detención en admisibilidad.'
          : `Evidencia sintética observable para ${code} en la muestra.`,
      file: level === 'evidencia_insuficiente' ? null : 'src/modulo/ejemplo.ts',
      fragment:
        level === 'evidencia_insuficiente'
          ? null
          : '+ export function ejemplo() {\n+   return true\n+ }',
      line: level === 'evidencia_insuficiente' ? null : 42,
    }
  })
}

function dimensionsFromCriteria(criteria) {
  return Object.keys(DIMENSION_CODES).map((dimension) => {
    const codes = DIMENSION_CODES[dimension]
    const unmet = criteria
      .filter((c) => codes.includes(c.code))
      .filter((c) => c.level === 'no_cumple' || c.level === 'cumple_parcialmente')
      .map((c) => c.code)
    return {
      dimension,
      assessment:
        unmet.length === 0
          ? 'La dimensión se considera satisfactoria según los criterios evaluados.'
          : `Quedan criterios no satisfechos: ${unmet.join(', ')}.`,
      unmetCriteria: unmet,
    }
  })
}

const levelsM1 = Object.fromEntries(
  ALL_CODES.map((c, i) => {
    if (c === 'CR-008') return [c, 'cumple_parcialmente']
    return [c, 'cumple']
  }),
)

const criteria1 = criteriaForSample(levelsM1)
const fileStats1 = [
  { path: 'src/api/handlers.ts', additions: 48, deletions: 6 },
  { path: 'src/api/handlers.test.ts', additions: 72, deletions: 0 },
  { path: 'src/lib/validacion.ts', additions: 31, deletions: 4 },
  { path: 'src/lib/validacion.test.ts', additions: 55, deletions: 0 },
  { path: 'docs/cambios.md', additions: 12, deletions: 2 },
  { path: 'package.json', additions: 2, deletions: 1 },
]

const muestra1 = {
  entrada: {
    id: 'MUESTRA-1',
    context: {
      prUrl: 'https://github.com/ejemplo/proyecto/pull/128',
      headSha: 'a1b2c3d4e5f6789012345678901234567890abcd',
      title: 'Implementar validación de entradas en el módulo API',
      body: 'Cierra #452\n\nAgrega validación y pruebas unitarias.',
      merged: true,
      state: 'merged',
      linkedIssueTitle: 'Validar entradas del API antes de persistir',
      linkedIssueBody:
        'Criterios de aceptación:\n- Rechazar payloads inválidos\n- Cubrir casos límite con pruebas',
      diff: `diff --git a/src/api/handlers.ts b/src/api/handlers.ts
--- a/src/api/handlers.ts
+++ b/src/api/handlers.ts
@@ -10,6 +10,9 @@ export async function createItem(req) {
+  if (!req.body?.name) {
+    return { status: 400, error: 'name required' }
+  }
   return store.save(req.body)
`,
      truncated: false,
      fileStats: fileStats1,
      ciConclusion: 'success',
      reviewCommentCount: 3,
    },
    requested_amount: 850,
  },
  salida: {
    contributionId: 'MUESTRA-1',
    executedAt: '2026-09-21T14:05:00Z',
    model: { name: 'gpt-prototype', version: '2026-09-demo' },
    instructionVersion: 'instruccion-v1.1',
    admissibility: {
      outcome: 'admisible',
      stoppedAt: null,
      version: 'CA-v1',
      conditions: [
        { code: 'CA-001', result: 'cumple', observed: 'merged=true, state=merged' },
        { code: 'CA-002', result: 'cumple', observed: '6 archivos en fileStats' },
        { code: 'CA-003', result: 'cumple', observed: 'Al menos un archivo de código en src/' },
        { code: 'CA-004', result: 'cumple', observed: 'Referencia a issue #452 en body' },
        {
          code: 'CA-005',
          result: 'no_verificable',
          observed: 'Verificado en plataforma; no incluido en el insumo del caso.',
        },
      ],
    },
    fileClassification: {
      byType: { codigo: 3, pruebas: 2, documentacion: 1, generado: 0, configuracion: 1 },
      realVolume: { files: 5, additions: 206, deletions: 12 },
      excludedFromVolume: ['docs/cambios.md'],
      porArchivo: [
        { path: 'src/api/handlers.ts', tipo: 'codigo' },
        { path: 'src/api/handlers.test.ts', tipo: 'pruebas' },
        { path: 'src/lib/validacion.ts', tipo: 'codigo' },
        { path: 'src/lib/validacion.test.ts', tipo: 'pruebas' },
        { path: 'docs/cambios.md', tipo: 'documentacion' },
        { path: 'package.json', tipo: 'configuracion' },
      ],
    },
    criteria: criteria1,
    dimensions: dimensionsFromCriteria(criteria1),
    reward: {
      requestedAmount: 850,
      requestedLevel: 'medio',
      suggestedLevel: 'medio',
      suggestedAmount: 850,
      levelMismatch: false,
    },
    recommendation: {
      value: 'aprobar',
      supportingCriteria: ['CR-001', 'CR-006', 'CR-013'],
      justification:
        'Los criterios de alcance, calidad y seguridad se satisfacen; CR-008 cumple parcialmente sin impacto en la recomendación.',
    },
    confidence: {
      score: 0.91,
      band: 'alto',
      supervision: 'confirmacion',
      supervisionScope: 'confirmacion',
      reasons: ['Conjunto de diferencias completo', 'Tarea vinculada coherente con la entrega'],
    },
    priority: { score: 12, unmetCount: 1, highestSeverity: 'media' },
    automationSignals: [],
    limits: ['No verifica identidad ni método de pago de la persona contribuidora (CA-005).'],
    execution: {
      durationMs: 18420,
      truncatedInput: false,
      instructionHash: 'sha256:demo-instruction-abc123def456',
      entradaHash: 'sha256:demo-entrada-789012',
    },
  },
}

const criteria2 = criteriaForSample(
  Object.fromEntries(ALL_CODES.map((c) => [c, 'evidencia_insuficiente'])),
)

const fileStats2 = [
  { path: 'README.md', additions: 4, deletions: 1 },
  { path: 'src/util.ts', additions: 8, deletions: 0 },
  { path: 'src/util.test.ts', additions: 10, deletions: 0 },
]

const muestra2 = {
  entrada: {
    id: 'MUESTRA-2',
    context: {
      prUrl: 'https://github.com/ejemplo/proyecto/pull/99',
      headSha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      title: 'Ajustes menores de documentación',
      body: 'Sin enlace explícito a tarea técnica.',
      merged: true,
      state: 'merged',
      linkedIssueTitle: '',
      linkedIssueBody: '',
      diff: `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,3 +1,4 @@
 # Proyecto
+Nota de prueba
`,
      truncated: false,
      fileStats: fileStats2,
      ciConclusion: 'success',
      reviewCommentCount: 0,
    },
    requested_amount: 200,
  },
  salida: {
    contributionId: 'MUESTRA-2',
    executedAt: '2026-09-21T15:10:00Z',
    model: { name: 'gpt-prototype', version: '2026-09-demo' },
    instructionVersion: 'instruccion-v1.1',
    admissibility: {
      outcome: 'no_admisible',
      stoppedAt: 'CA-002',
      version: 'CA-v1',
      conditions: [
        { code: 'CA-001', result: 'cumple', observed: 'merged=true' },
        { code: 'CA-002', result: 'no_cumple', observed: '3 archivos en fileStats (mínimo 6)' },
        { code: 'CA-003', result: 'cumple', observed: 'Incluye src/util.ts' },
        { code: 'CA-004', result: 'no_cumple', observed: 'Sin referencia a tarea en body' },
        { code: 'CA-005', result: 'no_verificable', observed: 'No disponible en el insumo' },
      ],
    },
    fileClassification: {
      byType: { codigo: 1, pruebas: 1, documentacion: 1, generado: 0, configuracion: 0 },
      realVolume: { files: 0, additions: 0, deletions: 0 },
      excludedFromVolume: [],
    },
    criteria: criteria2,
    dimensions: dimensionsFromCriteria(criteria2),
    reward: {
      requestedAmount: 200,
      requestedLevel: 'bajo',
      suggestedLevel: null,
      suggestedAmount: 0,
      levelMismatch: false,
    },
    recommendation: {
      value: 'rechazar',
      supportingCriteria: ['CA-002'],
      justification:
        'La contribución no es admisible: CA-002 no cumple (menos de seis archivos). El análisis de criterios no se ejecutó.',
    },
    confidence: {
      score: 0.95,
      band: 'alto',
      supervision: 'confirmacion',
      supervisionScope: 'confirmacion',
      reasons: ['Resultado determinista de admisibilidad'],
    },
    priority: { score: 88, unmetCount: 0, highestSeverity: 'baja' },
    automationSignals: [],
    limits: [
      'Análisis de los 23 criterios omitido por detención en admisibilidad (CA-002).',
      'Clasificación de volumen no aplicada al contenido.',
    ],
    execution: {
      durationMs: 420,
      truncatedInput: false,
      instructionHash: 'sha256:demo-instruction-abc123def456',
    },
  },
}

const outPath = join(__dirname, '..', 'public', 'datos.json')
writeFileSync(outPath, JSON.stringify([muestra1, muestra2], null, 2), 'utf8')
console.log('Wrote', outPath)
