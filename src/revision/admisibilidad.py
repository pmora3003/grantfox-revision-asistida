"""Evaluacion determinista de condiciones de admisibilidad."""

from __future__ import annotations

import re
from typing import Any

from revision.config import ConfigAdmisibilidad

_REFERENCIA_TAREA_RE = re.compile(
    r"(?:"
    r"(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s*#\d+"
    r"|#\d+"
    r"|github\.com/[^\s]+/issues/\d+"
    r"|[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+#\d+"
    r")",
    re.IGNORECASE,
)

_ORDEN_CA = ("CA-001", "CA-002", "CA-003", "CA-004")


def _evaluar_ca001(contexto: dict[str, Any]) -> dict[str, str]:
    merged = bool(contexto.get("merged"))
    state = contexto.get("state")
    observed = f"merged={merged}, state={state!r}"
    if merged:
        return {"code": "CA-001", "result": "cumple", "observed": observed}
    return {"code": "CA-001", "result": "no_cumple", "observed": observed}


def _evaluar_ca002(contexto: dict[str, Any], config: ConfigAdmisibilidad) -> dict[str, str]:
    min_archivos = int(config.parametros_ca("CA-002").get("min_archivos", 6))
    file_stats = contexto.get("fileStats") or []
    cantidad = len(file_stats)
    observed = f"{cantidad} archivos en fileStats"
    if cantidad >= min_archivos:
        return {"code": "CA-002", "result": "cumple", "observed": observed}
    return {"code": "CA-002", "result": "no_cumple", "observed": observed}


def _evaluar_ca003(clasificacion: dict[str, Any]) -> dict[str, str]:
    by_type = clasificacion.get("byType") or {}
    codigo = int(by_type.get("codigo", 0))
    pruebas = int(by_type.get("pruebas", 0))
    observed = f"codigo={codigo}, pruebas={pruebas}"
    if codigo + pruebas >= 1:
        return {"code": "CA-003", "result": "cumple", "observed": observed}
    return {"code": "CA-003", "result": "no_cumple", "observed": observed}


def _evaluar_ca004(contexto: dict[str, Any]) -> dict[str, str]:
    body = contexto.get("body") or ""
    if isinstance(body, str):
        coincidencia = _REFERENCIA_TAREA_RE.search(body)
        if coincidencia:
            fragmento = coincidencia.group(0)
            return {
                "code": "CA-004",
                "result": "cumple",
                "observed": f"referencia en body: {fragmento!r}",
            }

    titulo_vinculado = contexto.get("linkedIssueTitle") or ""
    if isinstance(titulo_vinculado, str) and titulo_vinculado.strip():
        return {
            "code": "CA-004",
            "result": "cumple",
            "observed": "vinculo desde registro de plataforma (linkedIssueTitle presente)",
        }

    return {
        "code": "CA-004",
        "result": "no_cumple",
        "observed": "sin referencia a tarea en body ni linkedIssueTitle",
    }


def _ca005() -> dict[str, str]:
    return {
        "code": "CA-005",
        "result": "no_verificable",
        "observed": "Se verifica en la plataforma, no esta en el insumo",
    }


def evaluar_admisibilidad(
    entrada_normalizada: dict[str, Any],
    clasificacion: dict[str, Any],
    config: ConfigAdmisibilidad,
) -> dict[str, Any]:
    """Recorre CA-001 a CA-004 y detiene en el primer no_cumple."""
    contexto = entrada_normalizada.get("context") or {}
    condiciones: list[dict[str, str]] = []
    stopped_at: str | None = None

    evaluadores = {
        "CA-001": lambda: _evaluar_ca001(contexto),
        "CA-002": lambda: _evaluar_ca002(contexto, config),
        "CA-003": lambda: _evaluar_ca003(clasificacion),
        "CA-004": lambda: _evaluar_ca004(contexto),
    }

    for codigo in _ORDEN_CA:
        resultado = evaluadores[codigo]()
        condiciones.append(resultado)
        if resultado["result"] == "no_cumple":
            stopped_at = codigo
            break

    condiciones.append(_ca005())

    outcome = "no_admisible" if stopped_at else "admisible"
    return {
        "outcome": outcome,
        "stoppedAt": stopped_at,
        "version": config.version,
        "conditions": condiciones,
    }
