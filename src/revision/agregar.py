"""Agregacion determinista: dimensiones, recompensa, recomendacion, confianza y prioridad."""

from __future__ import annotations

import re
from typing import Any

from revision.analizar import DIMENSIONES, insumo_truncado, sanitizar_texto_modelo
from revision.config import ConfigEscala, cargar_escala, nivel_para_monto, rango_nivel
from revision.marcos import (
    anotar_criterios,
    fuente_de_condicion,
    marco_de_criterio,
    normalizar_modo_ejecucion,
)

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
_ETIQUETA_NIVEL = {
    "cumple": "cumple",
    "cumple_parcialmente": "cumple parcialmente",
    "no_cumple": "no cumple",
    "evidencia_insuficiente": "evidencia insuficiente",
    "no_verificable": "no verificable",
}
# RF-12: situación que el análisis nunca resuelve con los insumos de la solicitud.
LIMITE_INFORMACION_EXTERNA = (
    "Las decisiones que dependen de información ajena a la solicitud, como la "
    "política de distribución de pagos por persona contribuidora o el presupuesto "
    "de la campaña, no se resuelven con este análisis"
)

_RESUMEN_APROBAR_ORDEN: list[tuple[str, str, int]] = [
    ("cumplimiento_alcance", "Alcance", 5),
    ("calidad_tecnica", "calidad técnica", 7),
    ("riesgos_seguridad", "seguridad", 6),
    ("proporcionalidad", "proporcionalidad", 5),
]


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
    admissibility: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cfg = config or cargar_escala()
    monto = int(requested_amount or 0)
    requested_level = nivel_para_monto(monto, cfg)

    # Sin admisibilidad no hay análisis de proporcionalidad: no se sugiere nivel ni monto.
    if (admissibility or {}).get("outcome") == "no_admisible":
        return {
            "requestedAmount": monto,
            "requestedLevel": requested_level,
            "suggestedLevel": None,
            "suggestedAmount": None,
            "levelMismatch": False,
        }

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


def _banda_confianza(score: float, conf: dict[str, Any]) -> str:
    """alto si score >= alto_desde; medio si score >= medio_desde; si no bajo (Tabla 34)."""
    umbral_alto = float(conf.get("alto_desde", 0.85))
    umbral_medio = float(conf.get("medio_desde", 0.60))
    if score >= umbral_alto:
        return "alto"
    if score >= umbral_medio:
        return "medio"
    return "bajo"


def _es_modo_reglas(meta: dict[str, Any]) -> bool:
    modo = normalizar_modo_ejecucion(meta.get("modoEjecucion"))
    return modo == "reglas"


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
            f"Proporción de evidencia insuficiente ({ratio:.2f}) supera el umbral"
        )

    if meta.get("dependeInformacionExterna"):
        pen = float(penalizaciones.get("dependencia_externa", 0.40))
        score -= pen
        motivo = meta.get("motivoDependencia") or "dependencia de información externa"
        reasons.append(str(sanitizar_texto_modelo(str(motivo)) or motivo))

    if _es_modo_reglas(meta):
        pen = float(
            penalizaciones.get("reglas", penalizaciones.get("simulado", 0.20))
        )
        score -= pen
        reasons.append(
            "Análisis con motor de reglas, sin modelo de lenguaje"
        )

    for reason in meta.get("confidenceReasons") or []:
        if reason and reason not in reasons:
            reasons.append(str(reason))

    score = max(0.0, min(1.0, score))
    band = _banda_confianza(score, conf)

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


def _evidencia_corta(texto: str, max_len: int = 200) -> str:
    limpio = sanitizar_texto_modelo(texto) or texto
    limpio = " ".join(str(limpio).split())
    if len(limpio) <= max_len:
        return limpio
    return limpio[: max_len - 1].rstrip() + "..."


def _fundamento_de_criterio(c: dict[str, Any]) -> dict[str, str]:
    codigo = str(c.get("code") or "")
    marco = str(c.get("marco") or "")
    if not marco:
        marco = marco_de_criterio(codigo).marco
    nivel = str(c.get("level") or "")
    return {
        "code": codigo,
        "nivel": nivel,
        "marco": marco,
        "evidencia": _evidencia_corta(str(c.get("evidence") or "")),
    }


def _fundamento_de_ca(
    code: str, admissibility: dict[str, Any]
) -> dict[str, str]:
    condicion = next(
        (
            c
            for c in (admissibility.get("conditions") or [])
            if c.get("code") == code
        ),
        None,
    )
    fuente = ""
    evidencia = ""
    nivel = "no_cumple"
    if condicion:
        fuente = str(condicion.get("fuente") or "")
        evidencia = str(condicion.get("observed") or "")
        nivel = str(condicion.get("result") or nivel)
    if not fuente:
        fuente = fuente_de_condicion(code).marco
    return {
        "code": code,
        "nivel": nivel,
        "marco": fuente,
        "evidencia": _evidencia_corta(evidencia),
    }


def _n_cumplen_desde_assessment(assessment: str) -> int:
    m = re.match(r"^(\d+) cumplen", (assessment or "").strip())
    return int(m.group(1)) if m else 0


def _resumen_niveles(etiqueta: str, niveles: list[str]) -> str:
    """Resume los niveles de una dimensión: cuántos cumplen, parcialmente, no y sin evidencia."""
    total = len(niveles)
    n_ok = niveles.count("cumple")
    n_parcial = niveles.count("cumple_parcialmente")
    n_no = niveles.count("no_cumple")
    n_insuf = total - n_ok - n_parcial - n_no

    def verbo(n: int) -> str:
        return "cumple" if n == 1 else "cumplen"

    detalle = [f"{n_ok} de {total} {verbo(n_ok)}"]
    if n_parcial:
        detalle.append(f"{n_parcial} {verbo(n_parcial)} parcialmente")
    if n_no:
        detalle.append(f"{n_no} no {verbo(n_no)}")
    if n_insuf:
        detalle.append(f"{n_insuf} con evidencia insuficiente")
    return f"{etiqueta}: " + ", ".join(detalle)


def _frase_criterio(c: dict[str, Any]) -> str:
    codigo = str(c.get("code") or "")
    nivel = _ETIQUETA_NIVEL.get(str(c.get("level") or ""), str(c.get("level") or ""))
    marco = str(c.get("marco") or marco_de_criterio(codigo).marco)
    evidencia = _evidencia_corta(str(c.get("evidence") or ""))
    if marco:
        return f"{codigo} {nivel} ({marco}): {evidencia}"
    return f"{codigo} {nivel}: {evidencia}"


def _justificacion_parrafo(
    value: str,
    codes: list[str],
    por_codigo: dict[str, dict[str, Any]],
    admissibility: dict[str, Any],
    dimensions: list[dict[str, Any]] | None,
    meta: dict[str, Any],
    confidence: dict[str, Any],
    reward: dict[str, Any] | None = None,
) -> str:
    if value == "rechazar" and admissibility.get("outcome") == "no_admisible":
        stopped = admissibility.get("stoppedAt") or "CA"
        fund = _fundamento_de_ca(stopped, admissibility)
        marco = fund["marco"]
        evidencia = fund["evidencia"]
        if marco:
            return (
                f"Se recomienda rechazar. Admisibilidad no superada en {stopped} "
                f"({marco}): {evidencia}."
            )
        return f"Se recomienda rechazar. Admisibilidad no superada en {stopped}: {evidencia}."

    if value == "derivar_revision_humana" and meta.get("dependeInformacionExterna"):
        motivo = meta.get("motivoDependencia") or "Depende de información externa"
        just = sanitizar_texto_modelo(str(motivo)) or str(motivo)
        return (
            "Se recomienda derivar a revisión humana. "
            "Cláusulas 4B.2 y 13.4 de los Términos y Condiciones exigen revisión "
            f"humana previa: {just}."
        )

    if value == "derivar_revision_humana" and codes:
        frases = [_frase_criterio(por_codigo[c]) for c in codes if c in por_codigo]
        return (
            "Se recomienda derivar a revisión humana. "
            + ". ".join(frases)
            + ". Este criterio no basta por sí solo para rechazar y la decisión "
            "queda en manos de la persona revisora."
        )

    if value == "derivar_revision_humana":
        reasons = list(confidence.get("reasons") or [])
        detalle = "; ".join(reasons) if reasons else "Confianza baja"
        return (
            "Se recomienda derivar a revisión humana. "
            "Cláusulas 4B.2 y 13.4 de los Términos y Condiciones exigen revisión "
            f"humana previa: {detalle}."
        )

    if value == "aprobar":
        por_dim = {
            str(d.get("dimension") or ""): d for d in (dimensions or [])
        }
        partes: list[str] = []
        for dim_key, etiqueta, total in _RESUMEN_APROBAR_ORDEN:
            niveles = [
                str(c.get("level") or "")
                for c in por_codigo.values()
                if str(c.get("dimension") or "") == dim_key
            ]
            if not niveles:
                assessment = str(por_dim.get(dim_key, {}).get("assessment") or "")
                partes.append(
                    f"{etiqueta}: {_n_cumplen_desde_assessment(assessment)} de {total} cumplen"
                )
                continue
            partes.append(_resumen_niveles(etiqueta, niveles))
        resumen = "; ".join(partes)
        rw = reward or {}
        monto = int(rw.get("requestedAmount") or 0)
        nivel = rw.get("requestedLevel") or rw.get("suggestedLevel") or "bajo"
        linea_reward = (
            f"Monto solicitado {monto} USDC, nivel {nivel}, "
            "coincide con el nivel sugerido."
        )
        return (
            "Se recomienda aprobar. Ningún criterio que motive rechazo o derivación "
            "queda sin cumplir. "
            f"{resumen}. {linea_reward}"
        )

    verbos = {
        "rechazar": "Se recomienda rechazar",
        "ajustar_monto": "Se recomienda ajustar el monto",
    }
    cabecera = verbos.get(value, f"Se recomienda {value}")
    frases = [_frase_criterio(por_codigo[c]) for c in codes if c in por_codigo]
    if not frases:
        return f"{cabecera}."
    return f"{cabecera}. " + ". ".join(frases) + "."


def _recomendacion_con_fundamentos(
    value: str,
    codes: list[str],
    por_codigo: dict[str, dict[str, Any]],
    admissibility: dict[str, Any],
    dimensions: list[dict[str, Any]] | None,
    meta: dict[str, Any],
    confidence: dict[str, Any],
    reward: dict[str, Any] | None = None,
) -> dict[str, Any]:
    fundamentos: list[dict[str, str]] = []
    if admissibility.get("outcome") == "no_admisible" and codes:
        fundamentos = [_fundamento_de_ca(codes[0], admissibility)]
    else:
        for code in codes:
            c = por_codigo.get(code)
            if c:
                fundamentos.append(_fundamento_de_criterio(c))
    return {
        "value": value,
        "supportingCriteria": codes,
        "justification": _justificacion_parrafo(
            value,
            codes,
            por_codigo,
            admissibility,
            dimensions,
            meta,
            confidence,
            reward,
        ),
        "fundamentos": fundamentos,
    }


def agregar_recomendacion(
    admissibility: dict[str, Any],
    criterios: list[dict[str, Any]],
    reward: dict[str, Any],
    confidence: dict[str, Any],
    meta: dict[str, Any],
    config: ConfigEscala | None = None,
    dimensions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    cfg = config or cargar_escala()
    por_codigo = {c["code"]: c for c in criterios}

    if admissibility.get("outcome") == "no_admisible":
        stopped = admissibility.get("stoppedAt") or "CA"
        return _recomendacion_con_fundamentos(
            "rechazar",
            [stopped],
            por_codigo,
            admissibility,
            dimensions,
            meta,
            confidence,
            reward,
        )

    if meta.get("dependeInformacionExterna"):
        return _recomendacion_con_fundamentos(
            "derivar_revision_humana",
            [],
            por_codigo,
            admissibility,
            dimensions,
            meta,
            confidence,
            reward,
        )

    reglas_rec = cfg.recomendacion or {}
    rechazo_directo = [str(c) for c in reglas_rec.get("rechazo_directo") or []]
    derivar_si_no = [str(c) for c in reglas_rec.get("derivar_si_no_cumple") or []]

    rechazos = [
        c for c in rechazo_directo
        if (por_codigo.get(c) or {}).get("level") == "no_cumple"
    ]
    if rechazos:
        return _recomendacion_con_fundamentos(
            "rechazar",
            rechazos,
            por_codigo,
            admissibility,
            dimensions,
            meta,
            confidence,
            reward,
        )

    derivaciones = [
        c for c in derivar_si_no
        if (por_codigo.get(c) or {}).get("level") == "no_cumple"
    ]
    if derivaciones:
        return _recomendacion_con_fundamentos(
            "derivar_revision_humana",
            derivaciones,
            por_codigo,
            admissibility,
            dimensions,
            meta,
            confidence,
            reward,
        )

    mismatch = bool(reward.get("levelMismatch"))
    umbral_insuf = float(
        (cfg.confianza or {}).get("umbral_evidencia_insuficiente", 0.30)
    )
    ratio_insuf = _ratio_evidencia_insuficiente(criterios)

    if confidence.get("band") == "bajo":
        reasons = list(confidence.get("reasons") or [])
        if (
            mismatch
            and meta.get("tareaCorresponde") is None
            and _solo_razones_tarea_no_verificable(reasons)
            and ratio_insuf < umbral_insuf
        ):
            return _recomendacion_ajustar_monto(
                por_codigo, reward, admissibility, dimensions, meta, confidence
            )

        return _recomendacion_con_fundamentos(
            "derivar_revision_humana",
            [],
            por_codigo,
            admissibility,
            dimensions,
            meta,
            confidence,
            reward,
        )

    cr022 = por_codigo.get("CR-022", {})
    cr023 = por_codigo.get("CR-023", {})
    if mismatch or cr022.get("level") == "no_cumple" or cr023.get("level") == "no_cumple":
        return _recomendacion_ajustar_monto(
            por_codigo, reward, admissibility, dimensions, meta, confidence
        )

    return _recomendacion_con_fundamentos(
        "aprobar",
        [],
        por_codigo,
        admissibility,
        dimensions,
        meta,
        confidence,
        reward,
    )


def _recomendacion_ajustar_monto(
    por_codigo: dict[str, dict[str, Any]],
    reward: dict[str, Any],
    admissibility: dict[str, Any],
    dimensions: list[dict[str, Any]] | None,
    meta: dict[str, Any],
    confidence: dict[str, Any],
) -> dict[str, Any]:
    mismatch = bool(reward.get("levelMismatch"))
    cr022 = por_codigo.get("CR-022", {})
    cr023 = por_codigo.get("CR-023", {})
    codes = []
    if mismatch or cr022.get("level") == "no_cumple":
        codes.append("CR-022")
    if cr023.get("level") == "no_cumple":
        codes.append("CR-023")
    if not codes:
        codes = ["CR-022"]
    return _recomendacion_con_fundamentos(
        "ajustar_monto",
        codes,
        por_codigo,
        admissibility,
        dimensions,
        meta,
        confidence,
        reward,
    )


def agregar_prioridad(
    criterios: list[dict[str, Any]],
    config: ConfigEscala | None = None,
) -> dict[str, Any]:
    """Prioridad = suma de pesos_severidad de criterios no satisfechos.

    La formula concreta es decision del proyecto.
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
        "Contenido de los comentarios de revisión no disponible",
        LIMITE_INFORMACION_EXTERNA,
    ]
    if insumo_truncado(entrada, meta):
        limits.append("Conjunto de diferencias truncado")
    if meta.get("dependeInformacionExterna"):
        motivo = meta.get("motivoDependencia") or "Dependencia de información externa"
        limits.append(str(sanitizar_texto_modelo(str(motivo)) or motivo))
    if admissibility.get("outcome") == "no_admisible":
        stopped = admissibility.get("stoppedAt") or "condición de admisibilidad"
        limits.append(
            f"Análisis detenido en {stopped}; los 23 criterios quedan en evidencia insuficiente"
        )

    if _es_modo_reglas(meta):
        limits.append(
            "Análisis con motor de reglas deterministas; no usa el modelo de lenguaje"
        )

    for lim in meta.get("limits") or []:
        if lim and lim not in limits:
            limits.append(str(lim))

    monto = entrada.get("requested_amount")
    if monto is not None and cfg.niveles:
        minimo_escala = min(n.minimo for n in cfg.niveles)
        try:
            monto_int = int(monto)
        except (TypeError, ValueError):
            monto_int = None
        if monto_int is not None and monto_int < minimo_escala:
            limits.append(
                f"Monto solicitado ({monto_int}) por debajo del mínimo de la escala "
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
    meta = dict(meta or {})
    modo = normalizar_modo_ejecucion(meta.get("modoEjecucion"))
    if modo is not None:
        meta["modoEjecucion"] = modo

    criterios = anotar_criterios(criterios)

    dimensions = agregar_dimensiones(criterios)
    reward = agregar_reward(entrada.get("requested_amount"), meta, cfg, admissibility)
    confidence = agregar_confianza(admissibility, criterios, entrada, meta, cfg)
    recommendation = agregar_recomendacion(
        admissibility, criterios, reward, confidence, meta, cfg, dimensions
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
        "criteria": criterios,
    }
