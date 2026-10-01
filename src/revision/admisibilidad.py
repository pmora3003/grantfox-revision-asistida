"""Evaluacion determinista de condiciones de admisibilidad."""

from __future__ import annotations

import re
from typing import Any

from revision.config import ConfigAdmisibilidad

# Palabras que habilitan un #N suelto como referencia a tarea.
_PREFIJO_ISSUE_RE = re.compile(
    r"(?i)\b(?:issue|tarea|closes?|fixes?|resolves?|refs?|related)\b",
)

_REFERENCIA_TAREA_RE = re.compile(
    r"(?:"
    r"(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s*#\d+"
    r"|github\.com/[^\s]+/issues/\d+"
    r"|[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+#\d+"
    r"|#\d+"
    r")",
    re.IGNORECASE,
)

_ORDEN_CA = ("CA-001", "CA-002", "CA-003", "CA-004")
_ESTADOS_FUSIONADOS = frozenset({"closed", "merged"})


def _evaluar_ca001(contexto: dict[str, Any]) -> dict[str, str]:
    merged = bool(contexto.get("merged"))
    state = contexto.get("state")
    state_ok = isinstance(state, str) and state.lower() in _ESTADOS_FUSIONADOS
    observed = f"merged={merged}, state={state!r}"
    if merged and state_ok:
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
    # CA-003 exige al menos un archivo de codigo; las pruebas solas no cuentan.
    if codigo >= 1:
        return {"code": "CA-003", "result": "cumple", "observed": observed}
    return {"code": "CA-003", "result": "no_cumple", "observed": observed}


def _tiene_referencia_tarea(body: str) -> str | None:
    """Devuelve el fragmento de referencia si el body indica la tarea."""
    for coincidencia in _REFERENCIA_TAREA_RE.finditer(body):
        fragmento = coincidencia.group(0)
        # Un #N suelto solo cuenta si hay palabra de enlace antes en el body.
        if re.fullmatch(r"#\d+", fragmento):
            inicio = coincidencia.start()
            prefijo = body[max(0, inicio - 40) : inicio]
            if not _PREFIJO_ISSUE_RE.search(prefijo):
                continue
        return fragmento
    return None


def _evaluar_ca004(contexto: dict[str, Any]) -> dict[str, str]:
    body = contexto.get("body") or ""
    if isinstance(body, str):
        fragmento = _tiene_referencia_tarea(body)
        if fragmento:
            return {
                "code": "CA-004",
                "result": "cumple",
                "observed": f"referencia en body: {fragmento!r}",
            }

    return {
        "code": "CA-004",
        "result": "no_cumple",
        "observed": "sin referencia a tarea en body",
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
