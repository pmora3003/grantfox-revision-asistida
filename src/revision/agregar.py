"""Agregacion determinista: dimensiones, recompensa, recomendacion, confianza y prioridad."""

from __future__ import annotations

from typing import Any

from revision.analizar import DIMENSIONES, insumo_truncado, sanitizar_texto_modelo
from revision.config import ConfigEscala, cargar_escala, nivel_para_monto, rango_nivel

_NIVELES_NO_SATISFECHOS = frozenset({"no_cumple", "cumple_parcialmente"})
_ORDEN_SEVERIDAD = {"alta": 3, "media": 2, "baja": 1}
_RAZONES_TAREA_NO_VERIFICABLE = frozenset(
    {
        "No se pudo comprobar la correspondencia con la tarea",
    }
)
_SUPERVISION_SCOPE = {
    "alto": "confirmacion",
    "medio": "criterios_no_satisfechos",
    "bajo": "analisis_completo",
}


def agregar_dimensiones(criterios: list[dict[str, Any]]) -> list[dict[str, Any]]:
    por_dim: dict[str, list[dict[str, Any]]] = {d: [] for d in DIMENSIONES}
    for c in criterios:
        dim = c.get("dimension")
        if dim in por_dim:
            por_dim[dim].append(c)

    salida: list[dict[str, Any]] = []
    for dim in DIMENSIONES:
        items = por_dim[dim]
        unmet = [
            c["code"]
            for c in items
            if c.get("level") in _NIVELES_NO_SATISFECHOS
        ]
        n_no = sum(1 for c in items if c.get("level") == "no_cumple")
        n_parcial = sum(1 for c in items if c.get("level") == "cumple_parcialmente")
        n_insuf = sum(1 for c in items if c.get("level") == "evidencia_insuficiente")
        n_ok = sum(1 for c in items if c.get("level") == "cumple")
        assessment = (
            f"{n_ok} cumplen, {n_parcial} parciales, {n_no} no cumplen, "
            f"{n_insuf} con evidencia insuficiente"
        )
        salida.append(
            {
                "dimension": dim,
                "assessment": assessment,
                "unmetCriteria": unmet,
            }
        )
    return salida


def agregar_reward(
    requested_amount: int | float | None,
    meta: dict[str, Any],
    config: ConfigEscala | None = None,
) -> dict[str, Any]:
    cfg = config or cargar_escala()
    monto = int(requested_amount or 0)
    requested_level = nivel_para_monto(monto, cfg)

    suggested_level = meta.get("suggestedLevel") or requested_level or "bajo"
    if suggested_level not in ("bajo", "medio", "alto", "spike"):
        suggested_level = requested_level or "bajo"

    rango = rango_nivel(suggested_level, cfg)
    suggested_amount = meta.get("suggestedAmount")
    if suggested_amount is None:
        suggested_amount = monto if requested_level == suggested_level else (
            rango[0] if rango else monto
        )
    suggested_amount = int(suggested_amount)
    if rango:
        lo, hi = rango
        if hi is None:
            suggested_amount = max(lo, suggested_amount)
        else:
            suggested_amount = max(lo, min(hi, suggested_amount))

    return {
        "requestedAmount": monto,
        "requestedLevel": requested_level,
        "suggestedLevel": suggested_level,
        "suggestedAmount": suggested_amount,
        "levelMismatch": requested_level != suggested_level,
    }


def _ratio_evidencia_insuficiente(criterios: list[dict[str, Any]]) -> float:
    total = len(criterios) or 1
    n_insuf = sum(1 for c in criterios if c.get("level") == "evidencia_insuficiente")
    return n_insuf / total


def agregar_confianza(
    admissibility: dict[str, Any],
    criterios: list[dict[str, Any]],
    entrada: dict[str, Any],
    meta: dict[str, Any],
    config: ConfigEscala | None = None,
) -> dict[str, Any]:
    cfg = config or cargar_escala()
    conf = cfg.confianza
    penalizaciones = conf.get("penalizaciones") or {}

    if admissibility.get("outcome") == "no_admisible":
        return {
            "score": 1.0,
            "band": "alto",
            "supervision": "confirmacion",
            "supervisionScope": "confirmacion",
            "reasons": ["Resuelto por regla de admisibilidad"],
        }

    score = 1.0
    reasons: list[str] = []

    if insumo_truncado(entrada, meta):
        pen = float(penalizaciones.get("truncado", 0.25))
        score -= pen
        reasons.append("Conjunto de diferencias truncado")

    tarea = meta.get("tareaCorresponde")
    if tarea is False or tarea is None:
        pen = float(penalizaciones.get("tarea_no_corresponde", 0.25))
        score -= pen
        if tarea is False:
            reasons.append("La tarea vinculada no corresponde con la entrega")
        else:
            reasons.append("No se pudo comprobar la correspondencia con la tarea")

    ratio = _ratio_evidencia_insuficiente(criterios)
    umbral = float(conf.get("umbral_evidencia_insuficiente", 0.30))
    if ratio > umbral:
        pen = float(penalizaciones.get("evidencia_insuficiente_excesiva", 0.20))
        score -= pen
        reasons.append(
            f"Proporcion de evidencia insuficiente ({ratio:.2f}) supera el umbral"
        )

    if meta.get("dependeInformacionExterna"):
        pen = float(penalizaciones.get("dependencia_externa", 0.40))
        score -= pen
        motivo = meta.get("motivoDependencia") or "dependencia de informacion externa"
        reasons.append(str(sanitizar_texto_modelo(str(motivo)) or motivo))

    score = max(0.0, min(1.0, score))
    umbral_alto = float(conf.get("alto", 0.90))
    umbral_medio = float(conf.get("medio", 0.70))
    if score >= umbral_alto:
        band = "alto"
    elif score >= umbral_medio:
        band = "medio"
    else:
        band = "bajo"

    supervision = "confirmacion" if band == "alto" else "revision_detallada"
    return {
        "score": round(score, 4),
        "band": band,
        "supervision": supervision,
        "supervisionScope": _SUPERVISION_SCOPE[band],
        "reasons": reasons,
    }


def _solo_razones_tarea_no_verificable(reasons: list[str]) -> bool:
    if not reasons:
        return False
    return all(r in _RAZONES_TAREA_NO_VERIFICABLE for r in reasons)


def agregar_recomendacion(
    admissibility: dict[str, Any],
    criterios: list[dict[str, Any]],
    reward: dict[str, Any],
    confidence: dict[str, Any],
    meta: dict[str, Any],
    config: ConfigEscala | None = None,
) -> dict[str, Any]:
    cfg = config or cargar_escala()
    por_codigo = {c["code"]: c for c in criterios}

    if admissibility.get("outcome") == "no_admisible":
        stopped = admissibility.get("stoppedAt") or "CA"
        return {
            "value": "rechazar",
            "supportingCriteria": [stopped],
            "justification": f"Admisibilidad no superada en {stopped}",
        }

    if meta.get("dependeInformacionExterna"):
        motivo = meta.get("motivoDependencia") or "Depende de informacion externa"
        just = sanitizar_texto_modelo(str(motivo)) or str(motivo)
        return {
            "value": "derivar_revision_humana",
            "supportingCriteria": [],
            "justification": just,
        }

    altas_no: list[str] = []
    for codigo, c in por_codigo.items():
        if codigo == "CR-012":
            continue
        if c.get("level") != "no_cumple":
            continue
        if cfg.severidad.get(codigo) == "alta":
            altas_no.append(codigo)
    if altas_no:
        just = _justificacion(por_codigo, altas_no)
        return {
            "value": "rechazar",
            "supportingCriteria": altas_no,
            "justification": just,
        }

    mismatch = bool(reward.get("levelMismatch"))
    umbral_insuf = float(
        (cfg.confianza or {}).get("umbral_evidencia_insuficiente", 0.30)
    )
    ratio_insuf = _ratio_evidencia_insuficiente(criterios)

    if confidence.get("band") == "bajo":
        reasons = list(confidence.get("reasons") or [])
        # Desajuste claro de nivel no debe quedar oculto por confianza baja
        # solo atribuible a tarea no verificable (tareaCorresponde null).
        if (
            mismatch
            and meta.get("tareaCorresponde") is None
            and _solo_razones_tarea_no_verificable(reasons)
            and ratio_insuf < umbral_insuf
        ):
            return _recomendacion_ajustar_monto(por_codigo, reward)

        return {
            "value": "derivar_revision_humana",
            "supportingCriteria": [],
            "justification": "; ".join(reasons) if reasons else "Confianza baja",
        }

    cr022 = por_codigo.get("CR-022", {})
    cr023 = por_codigo.get("CR-023", {})
    if mismatch or cr022.get("level") == "no_cumple" or cr023.get("level") == "no_cumple":
        return _recomendacion_ajustar_monto(por_codigo, reward)

    return {
        "value": "aprobar",
        "supportingCriteria": [],
        "justification": "Ningun criterio de rechazo o ajuste aplicable",
    }


def _recomendacion_ajustar_monto(
    por_codigo: dict[str, dict[str, Any]],
    reward: dict[str, Any],
) -> dict[str, Any]:
    mismatch = bool(reward.get("levelMismatch"))
    cr022 = por_codigo.get("CR-022", {})
    cr023 = por_codigo.get("CR-023", {})
    codes = []
    if mismatch or cr022.get("level") == "no_cumple":
        codes.append("CR-022")
    if cr023.get("level") == "no_cumple":
        codes.append("CR-023")
    just = (
        _justificacion(por_codigo, codes)
        if codes
        else "Desajuste de nivel de monto"
    )
    return {
        "value": "ajustar_monto",
        "supportingCriteria": codes,
        "justification": just,
    }


def _justificacion(por_codigo: dict[str, dict[str, Any]], codes: list[str]) -> str:
    partes: list[str] = []
    for code in codes:
        c = por_codigo.get(code) or {}
        ev = sanitizar_texto_modelo(str(c.get("evidence") or "")) or ""
        partes.append(f"{code}: {ev}".strip())
    return "; ".join(partes)


def agregar_prioridad(
    criterios: list[dict[str, Any]],
    config: ConfigEscala | None = None,
) -> dict[str, Any]:
    """Prioridad = suma de pesos_severidad de criterios no satisfechos.

    La formula concreta es decision del proyecto (contexto 16.5).
    """
    cfg = config or cargar_escala()
    pesos = cfg.pesos_severidad
    unmet = [c for c in criterios if c.get("level") in _NIVELES_NO_SATISFECHOS]
    score = 0
    highest = "baja"
    highest_rank = 0
    if not unmet:
        return {"score": 0, "unmetCount": 0, "highestSeverity": "baja"}

    for c in unmet:
        sev = cfg.severidad.get(c["code"], "baja")
        score += int(pesos.get(sev, 1))
        rank = _ORDEN_SEVERIDAD.get(sev, 1)
        if rank > highest_rank:
            highest_rank = rank
            highest = sev  # type: ignore[assignment]

    return {
        "score": score,
        "unmetCount": len(unmet),
        "highestSeverity": highest,
    }


def agregar_limits(
    admissibility: dict[str, Any],
    entrada: dict[str, Any],
    meta: dict[str, Any],
    config: ConfigEscala | None = None,
) -> list[str]:
    cfg = config or cargar_escala()
    limits = [
        "CA-005 no verificable con el insumo disponible",
        "Contenido de los comentarios de revision no disponible",
    ]
    if insumo_truncado(entrada, meta):
        limits.append("Conjunto de diferencias truncado")
    if meta.get("dependeInformacionExterna"):
        motivo = meta.get("motivoDependencia") or "Dependencia de informacion externa"
        limits.append(str(sanitizar_texto_modelo(str(motivo)) or motivo))
    if admissibility.get("outcome") == "no_admisible":
        stopped = admissibility.get("stoppedAt") or "condicion de admisibilidad"
        limits.append(
            f"Analisis detenido en {stopped}; los 23 criterios quedan en evidencia insuficiente"
        )

    monto = entrada.get("requested_amount")
    if monto is not None and cfg.niveles:
        minimo_escala = min(n.minimo for n in cfg.niveles)
        try:
            monto_int = int(monto)
        except (TypeError, ValueError):
            monto_int = None
        if monto_int is not None and monto_int < minimo_escala:
            limits.append(
                f"Monto solicitado ({monto_int}) por debajo del minimo de la escala "
                f"({minimo_escala})"
            )
    return limits


def agregar(
    admissibility: dict[str, Any],
    clasificacion: dict[str, Any],
    criterios: list[dict[str, Any]],
    entrada: dict[str, Any],
    meta: dict[str, Any] | None = None,
    config: ConfigEscala | None = None,
) -> dict[str, Any]:
    """Calcula dimensiones, reward, confidence, recommendation, priority y limits."""
    cfg = config or cargar_escala()
    meta = meta or {}

    dimensions = agregar_dimensiones(criterios)
    reward = agregar_reward(entrada.get("requested_amount"), meta, cfg)
    confidence = agregar_confianza(admissibility, criterios, entrada, meta, cfg)
    recommendation = agregar_recomendacion(
        admissibility, criterios, reward, confidence, meta, cfg
    )
    priority = agregar_prioridad(criterios, cfg)
    limits = agregar_limits(admissibility, entrada, meta, cfg)
    signals = [
        sanitizar_texto_modelo(str(s)) or ""
        for s in list(meta.get("automationSignals") or [])
    ]

    return {
        "dimensions": dimensions,
        "reward": reward,
        "confidence": confidence,
        "recommendation": recommendation,
        "priority": priority,
        "limits": limits,
        "automationSignals": signals,
    }
