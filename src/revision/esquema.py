"""Contrato de salida, modelos Pydantic v2."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

NivelAceptacion = Literal[
    "cumple",
    "cumple_parcialmente",
    "no_cumple",
    "evidencia_insuficiente",
]
DimensionNombre = Literal[
    "cumplimiento_alcance",
    "calidad_tecnica",
    "riesgos_seguridad",
    "proporcionalidad",
]
NivelRecompensa = Literal["bajo", "medio", "alto", "spike"]
RecomendacionValor = Literal[
    "aprobar",
    "rechazar",
    "ajustar_monto",
    "derivar_revision_humana",
]
BandaConfianza = Literal["alto", "medio", "bajo"]
Supervicion = Literal["confirmacion", "revision_detallada"]
SupervisionScope = Literal[
    "confirmacion",
    "criterios_no_satisfechos",
    "analisis_completo",
]
Severidad = Literal["alta", "media", "baja"]
ResultadoCA = Literal["cumple", "no_cumple", "no_verificable"]
OutcomeAdmisibilidad = Literal["admisible", "no_admisible"]


class ModeloInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    version: str


class CondicionAdmisibilidad(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    result: ResultadoCA
    observed: str
    fuente: str = ""
    fuenteUrl: str | None = None


class Admisibilidad(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcome: OutcomeAdmisibilidad
    stoppedAt: str | None
    conditions: list[CondicionAdmisibilidad]
    version: str | None = None


class ByType(BaseModel):
    model_config = ConfigDict(extra="forbid")

    codigo: int = 0
    pruebas: int = 0
    documentacion: int = 0
    generado: int = 0
    configuracion: int = 0


class RealVolume(BaseModel):
    model_config = ConfigDict(extra="forbid")

    files: int = 0
    additions: int = 0
    deletions: int = 0


class ArchivoClasificado(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str
    tipo: str


class FileClassification(BaseModel):
    model_config = ConfigDict(extra="forbid")

    byType: ByType
    realVolume: RealVolume
    excludedFromVolume: list[str] = Field(default_factory=list)
    porArchivo: list[ArchivoClasificado] | None = None


class Criterio(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    dimension: DimensionNombre
    level: NivelAceptacion
    evidence: str
    file: str | None = None
    fragment: str | None = None
    line: int | None = None
    marco: str = ""
    marcoUrl: str | None = None


class DimensionValoracion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dimension: DimensionNombre
    assessment: str
    unmetCriteria: list[str] = Field(default_factory=list)


class Reward(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requestedAmount: int
    requestedLevel: NivelRecompensa | None
    suggestedLevel: NivelRecompensa | None
    suggestedAmount: int
    levelMismatch: bool


class Fundamento(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    nivel: str
    marco: str
    evidencia: str


class Recommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: RecomendacionValor
    supportingCriteria: list[str] = Field(default_factory=list)
    justification: str
    fundamentos: list[Fundamento] = Field(default_factory=list)


class Confidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score: float
    band: BandaConfianza
    supervision: Supervicion
    supervisionScope: SupervisionScope
    reasons: list[str] = Field(default_factory=list)


class Priority(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score: int
    unmetCount: int
    highestSeverity: Severidad


class Execution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    durationMs: int
    truncatedInput: bool
    instructionHash: str
    entradaHash: str


ModoEjecucion = Literal["real", "reglas"]


class Salida(BaseModel):
    """Contrato minimo de salida por contribucion."""

    model_config = ConfigDict(extra="forbid")

    contributionId: str
    executedAt: str
    model: ModeloInfo
    instructionVersion: str
    headSha: str | None = None
    modoEjecucion: ModoEjecucion = "real"
    admissibility: Admisibilidad
    fileClassification: FileClassification
    criteria: list[Criterio]
    dimensions: list[DimensionValoracion]
    reward: Reward
    recommendation: Recommendation
    confidence: Confidence
    priority: Priority
    automationSignals: list[str] = Field(default_factory=list)
    limits: list[str] = Field(default_factory=list)
    execution: Execution
