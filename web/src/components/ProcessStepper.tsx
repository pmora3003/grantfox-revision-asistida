import type { DimensionNombre, PasoProceso } from '../types'
import { dimensionLabel } from '../labels'

const STEPS: { num: PasoProceso; label: string }[] = [
  { num: 1, label: 'Entrada normalizada' },
  { num: 2, label: 'Admisibilidad' },
  { num: 3, label: 'Clasificación de archivos' },
  { num: 4, label: 'Análisis por dimensión' },
  { num: 5, label: 'Agregación' },
  { num: 6, label: 'Registro' },
  { num: 7, label: 'Revisión humana' },
]

type Props = {
  activeStep: PasoProceso
  activeDimension: DimensionNombre | null
  stepsOmitted: boolean
  onStepClick: (step: PasoProceso) => void
}

export function ProcessStepper({
  activeStep,
  activeDimension,
  stepsOmitted,
  onStepClick,
}: Props) {
  return (
    <nav className="stepper-horizontal" aria-label="Pasos del proceso">
      {STEPS.map(({ num, label }) => {
        const omitted = stepsOmitted && (num === 3 || num === 4)
        let state = ''
        if (num === activeStep) state = ' active'
        else if (num < activeStep) state = ' done'
        if (omitted) state += ' omitted'
        const subActive = num === 4 && activeStep === 4 && activeDimension
        return (
          <button
            key={num}
            type="button"
            className={`stepper-item${state}${subActive ? ' sub-active' : ''}`}
            onClick={() => onStepClick(num)}
            title={omitted ? 'Omitido por admisibilidad' : label}
          >
            <span className="step-num">{omitted ? '-' : num}</span>
            <span className="step-label">
              {label}
              {omitted && ' (omitido)'}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

export function AnalysisSubsteps({ activeDimension }: { activeDimension: DimensionNombre | null }) {
  const dims: DimensionNombre[] = [
    'cumplimiento_alcance',
    'calidad_tecnica',
    'riesgos_seguridad',
    'proporcionalidad',
  ]
  return (
    <div className="substeps" aria-label="Subpasos de análisis">
      {dims.map((d) => (
        <span key={d} className={`substep-pill${activeDimension === d ? ' active' : ''}`}>
          {dimensionLabel(d)}
        </span>
      ))}
    </div>
  )
}
