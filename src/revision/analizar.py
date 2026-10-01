"""Analisis de criterios por dimension con el modelo de lenguaje."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from revision.config import ConfigEscala, cargar_escala, umbral_spike
from revision.normalizar import anonimizar_texto

_REPO_ROOT = Path(__file__).resolve().parents[2]
_RUTA_INSTRUCCION = _REPO_ROOT / "prompts" / "instruccion_v1.md"
_DIFF_MAX = 60000

DIMENSIONES = (
    "cumplimiento_alcance",
    "calidad_tecnica",
    "riesgos_seguridad",
    "proporcionalidad",
)

CODIGOS_POR_DIMENSION: dict[str, tuple[str, ...]] = {
    "cumplimiento_alcance": ("CR-001", "CR-002", "CR-003", "CR-004", "CR-005"),
    "calidad_tecnica": (
        "CR-006",
        "CR-007",
        "CR-008",
        "CR-009",
        "CR-010",
        "CR-011",
        "CR-012",
    ),
    "riesgos_seguridad": (
        "CR-013",
        "CR-014",
        "CR-015",
        "CR-016",
        "CR-017",
        "CR-018",
    ),
    "proporcionalidad": ("CR-019", "CR-020", "CR-021", "CR-022", "CR-023"),
}

NIVELES = ("cumple", "cumple_parcialmente", "no_cumple", "evidencia_insuficiente")
_NIVELES_CON_FRAGMENTO = frozenset(
    {"cumple", "cumple_parcialmente", "no_cumple"}
)
_CODIGOS_FORZAR_TRUNCADO = frozenset({"CR-013", "CR-019"})

_RE_SECRET_KV = re.compile(
    r"(?i)\b(password|passwd|secret|token|api_key|apikey|private_key|client_secret)"
    r"(\s*[:=]\s*)"
    r"(?P<q>[\"']?)(?P<val>[^\"'\s]+)(?P=q)"
)

_RE_SECRETOS = [
    re.compile(r"(?i)-----BEGIN[^-]+KEY-----[\s\S]*?-----END[^-]+KEY-----"),
    re.compile(r"(?i)\bsk-[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bS[A-Z2-7]{55}\b"),
    re.compile(r"\b[A-Za-z0-9+/]{33,}={0,2}\b"),
    re.compile(r"\b[0-9a-fA-F]{33,}\b"),
]


def cargar_dotenv(ruta: Path | None = None) -> None:
    """Carga variables KEY=VAL de un archivo .env sin dependencias."""
    path = ruta or (_REPO_ROOT / ".env")
    if not path.is_file():
        return
    for linea in path.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, _, valor = linea.partition("=")
        clave = clave.strip()
        valor = valor.strip().strip("'").strip('"')
        if clave and clave not in os.environ:
            os.environ[clave] = valor


def version_instruccion(ruta: Path | None = None) -> str:
    path = ruta or _RUTA_INSTRUCCION
    texto = path.read_text(encoding="utf-8")
    for linea in texto.splitlines()[:10]:
        if linea.startswith("version:"):
            return linea.split(":", 1)[1].strip()
    return "instruccion-v1"


def _formatear_escala(config: ConfigEscala) -> str:
    lineas = [
        "Niveles de la escala de recompensa (unidades USDC / escala de plataforma):"
    ]
    for nivel in config.niveles:
        lineas.append(
            f"- {nivel.nombre}: {nivel.minimo} a {nivel.maximo}"
        )
    lineas.append(
        "Spike: investigacion exhaustiva, o implementacion completa de una "
        "funcionalidad mayor con volumen elevado de codigo."
    )
    return "\n".join(lineas)


def _texto_instruccion_base(ruta: Path | None = None) -> str:
    path = ruta or _RUTA_INSTRUCCION
    texto = path.read_text(encoding="utf-8")
    if texto.startswith("---"):
        fin = texto.find("---", 3)
        if fin != -1:
            texto = texto[fin + 3 :].lstrip("\n")
    return texto


def instruccion_renderizada(
    config: ConfigEscala | None = None,
    ruta: Path | None = None,
) -> str:
    """Instruccion completa con {escala} y {umbral_spike} resueltos."""
    cfg = config or cargar_escala()
    texto = _texto_instruccion_base(ruta)
    return (
        texto.replace("{escala}", _formatear_escala(cfg))
        .replace("{umbral_spike}", str(umbral_spike(cfg)))
    )


def cargar_instruccion_dimension(
    dimension: str,
    config: ConfigEscala | None = None,
    ruta: Path | None = None,
) -> str:
    """Devuelve la parte comun mas la seccion de la dimension, con placeholders resueltos."""
    cfg = config or cargar_escala()
    texto = _texto_instruccion_base(ruta)

    marcador = f"## DIMENSION {dimension}"
    idx = texto.find(marcador)
    if idx == -1:
        raise ValueError(f"Dimension no encontrada en instruccion: {dimension}")

    primer = texto.find("## DIMENSION ")
    comun = texto[:primer].rstrip() if primer != -1 else texto
    resto = texto[idx:]
    siguiente = re.search(r"\n## DIMENSION ", resto[1:])
    seccion = resto[: siguiente.start() + 1] if siguiente else resto
    prompt = f"{comun}\n\n{seccion.strip()}\n"
    return (
        prompt.replace("{escala}", _formatear_escala(cfg))
        .replace("{umbral_spike}", str(umbral_spike(cfg)))
    )


def _sub_secreto_kv(match: re.Match[str]) -> str:
    return (
        f"{match.group(1)}{match.group(2)}"
        f"{match.group('q')}[valor omitido]{match.group('q')}"
    )


def redactar_secretos(texto: str | None) -> str | None:
    if texto is None:
        return None
    resultado = _RE_SECRET_KV.sub(_sub_secreto_kv, texto)
    for patron in _RE_SECRETOS:
        resultado = patron.sub("[valor omitido]", resultado)
    return resultado


def sanitizar_texto_modelo(texto: str | None) -> str | None:
    """Anonimiza correos/billeteras y redacta secretos (RNF-05, RNF-07)."""
    return redactar_secretos(anonimizar_texto(texto))


def _criterio_vacio(codigo: str, dimension: str, evidencia: str) -> dict[str, Any]:
    return {
        "code": codigo,
        "dimension": dimension,
        "level": "evidencia_insuficiente",
        "evidence": evidencia,
        "file": None,
        "fragment": None,
        "line": None,
    }


def criterios_insuficientes(evidencia: str) -> list[dict[str, Any]]:
    salida: list[dict[str, Any]] = []
    for dimension, codigos in CODIGOS_POR_DIMENSION.items():
        for codigo in codigos:
            salida.append(_criterio_vacio(codigo, dimension, evidencia))
    return salida


def diff_esta_capado(entrada: dict[str, Any]) -> bool:
    """True si el diff supera el tope de caracteres aplicado al modelo."""
    ctx = entrada.get("context") or {}
    diff = ctx.get("diff") or ""
    if not isinstance(diff, str):
        diff = str(diff)
    return len(diff) > _DIFF_MAX


def insumo_truncado(
    entrada: dict[str, Any],
    meta: dict[str, Any] | None = None,
) -> bool:
    ctx = entrada.get("context") or {}
    return bool(ctx.get("truncated")) or bool((meta or {}).get("diffCapado"))


def _neutralizar_marcadores(texto: str) -> str:
    """Evita que el texto de terceros cierre o abra el bloque de datos (RNF-06)."""
    texto = texto.replace("<datos_repositorio", "&lt;datos_repositorio")
    texto = texto.replace("</datos_repositorio", "&lt;/datos_repositorio")
    return texto


def construir_mensaje_usuario(
    dimension: str,
    entrada: dict[str, Any],
    clasificacion: dict[str, Any],
    previos: list[dict[str, Any]] | None,
) -> str:
    """Arma el mensaje de usuario con el bloque <datos_repositorio> neutralizado."""
    ctx = entrada.get("context") or {}
    diff = ctx.get("diff") or ""
    if not isinstance(diff, str):
        diff = str(diff)
    truncado = bool(ctx.get("truncated"))
    diff_capado = False
    if len(diff) > _DIFF_MAX:
        diff = diff[:_DIFF_MAX]
        diff_capado = True
        truncado = True

    file_stats = ctx.get("fileStats") or []
    partes = [
        f"Dimension a valorar: {dimension}",
        f"Clasificacion de archivos (byType): {json.dumps(clasificacion.get('byType'), ensure_ascii=False)}",
        f"Volumen real: {json.dumps(clasificacion.get('realVolume'), ensure_ascii=False)}",
        f"ciConclusion: {ctx.get('ciConclusion')}",
        f"reviewCommentCount: {ctx.get('reviewCommentCount')}",
        f"requested_amount: {entrada.get('requested_amount')}",
        f"truncated: {truncado}",
    ]
    if diff_capado:
        partes.append(
            f"Nota: el conjunto de diferencias se corto a {_DIFF_MAX} caracteres; "
            "tratar como truncado."
        )

    if dimension == "proporcionalidad" and previos:
        compactos = [
            {
                "code": c.get("code"),
                "level": c.get("level"),
                "evidence": (c.get("evidence") or "")[:200],
            }
            for c in previos
        ]
        partes.append(
            "Resultados previos (alcance, calidad, seguridad), compactos:\n"
            + json.dumps(compactos, ensure_ascii=False)
        )

    title = _neutralizar_marcadores(str(ctx.get("title") or ""))
    body = _neutralizar_marcadores(str(ctx.get("body") or ""))
    linked_title = _neutralizar_marcadores(str(ctx.get("linkedIssueTitle") or ""))
    linked_body = _neutralizar_marcadores(str(ctx.get("linkedIssueBody") or ""))
    file_stats_txt = _neutralizar_marcadores(
        json.dumps(file_stats, ensure_ascii=False)
    )
    diff_txt = _neutralizar_marcadores(diff)

    datos = (
        "<datos_repositorio>\n"
        f"title: {title}\n\n"
        f"body:\n{body}\n\n"
        f"linkedIssueTitle: {linked_title}\n\n"
        f"linkedIssueBody:\n{linked_body}\n\n"
        f"fileStats:\n{file_stats_txt}\n\n"
        f"diff:\n{diff_txt}\n"
        "</datos_repositorio>"
    )
    partes.append(datos)
    return "\n".join(partes)


def _esquema_herramienta(dimension: str) -> dict[str, Any]:
    codigos = list(CODIGOS_POR_DIMENSION[dimension])
    props_criterio: dict[str, Any] = {
        "code": {"type": "string", "enum": codigos},
        "level": {"type": "string", "enum": list(NIVELES)},
        "evidence": {"type": "string"},
        "file": {"type": ["string", "null"]},
        "fragment": {"type": ["string", "null"]},
        "line": {
            "type": ["integer", "null"],
            "description": (
                "Numero de linea dentro del archivo en la version nueva, "
                "cuando pueda leerse de las cabeceras del hunk del diff "
                "(por ejemplo @@ -a,b +c,d @@ apunta a la linea c)."
            ),
        },
    }
    required_criterio = ["code", "level", "evidence", "file", "fragment"]

    properties: dict[str, Any] = {
        "criterios": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": props_criterio,
                "required": required_criterio,
                "additionalProperties": False,
            },
        },
        "automationSignals": {
            "type": "array",
            "items": {"type": "string"},
        },
        "tareaCorresponde": {"type": ["boolean", "null"]},
    }
    required = ["criterios", "automationSignals", "tareaCorresponde"]

    if dimension == "proporcionalidad":
        properties.update(
            {
                "suggestedLevel": {
                    "type": "string",
                    "enum": ["bajo", "medio", "alto", "spike"],
                },
                "suggestedAmount": {"type": "integer"},
                "dependeInformacionExterna": {"type": "boolean"},
                "motivoDependencia": {"type": ["string", "null"]},
            }
        )
        required.extend(
            [
                "suggestedLevel",
                "suggestedAmount",
                "dependeInformacionExterna",
                "motivoDependencia",
            ]
        )

    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": False,
    }


def _normalizar_linea(valor: Any) -> int | None:
    if valor is None or valor == "":
        return None
    try:
        return int(valor)
    except (TypeError, ValueError):
        return None


def _normalizar_criterios(
    dimension: str,
    criterios_raw: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    por_codigo: dict[str, dict[str, Any]] = {}
    for item in criterios_raw:
        codigo = str(item.get("code", ""))
        if codigo not in CODIGOS_POR_DIMENSION[dimension]:
            continue
        level = item.get("level")
        if level not in NIVELES:
            level = "evidencia_insuficiente"
        fragment = item.get("fragment")
        if isinstance(fragment, str) and len(fragment) > 300:
            fragment = fragment[:300]
        por_codigo[codigo] = {
            "code": codigo,
            "dimension": dimension,
            "level": level,
            "evidence": sanitizar_texto_modelo(str(item.get("evidence") or "")) or "",
            "file": item.get("file"),
            "fragment": sanitizar_texto_modelo(
                fragment if isinstance(fragment, str) else None
            ),
            "line": _normalizar_linea(item.get("line")),
        }

    salida: list[dict[str, Any]] = []
    for codigo in CODIGOS_POR_DIMENSION[dimension]:
        if codigo in por_codigo:
            salida.append(por_codigo[codigo])
        else:
            salida.append(
                _criterio_vacio(
                    codigo,
                    dimension,
                    "El modelo no devolvio este criterio",
                )
            )
    return salida


def postvalidar_criterios(
    criterios: list[dict[str, Any]],
    entrada: dict[str, Any],
    meta: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """RF06 / RNF-01: fragmento obligatorio; CR-013/CR-019 si el insumo esta truncado."""
    truncado = insumo_truncado(entrada, meta)
    salida: list[dict[str, Any]] = []
    for original in criterios:
        c = dict(original)
        level = c.get("level")
        fragment = c.get("fragment")
        fragment_vacio = fragment is None or (
            isinstance(fragment, str) and not fragment.strip()
        )
        if level in _NIVELES_CON_FRAGMENTO and fragment_vacio:
            c["level"] = "evidencia_insuficiente"
            ev = c.get("evidence") or ""
            prefijo = "Sin fragmento citado: "
            if not str(ev).startswith(prefijo):
                c["evidence"] = prefijo + str(ev)
        if truncado and c.get("code") in _CODIGOS_FORZAR_TRUNCADO:
            c["level"] = "evidencia_insuficiente"
            ev = c.get("evidence") or ""
            prefijo = "Insumo truncado: "
            if not str(ev).startswith(prefijo):
                c["evidence"] = prefijo + str(ev)
        salida.append(c)
    return salida


def analizar_dimension(
    cliente: Any,
    dimension: str,
    entrada: dict[str, Any],
    clasificacion: dict[str, Any],
    previos: list[dict[str, Any]] | None = None,
    config: ConfigEscala | None = None,
) -> tuple[list[dict[str, Any]], dict[str, int], dict[str, Any]]:
    """Valora una dimension. Devuelve (criterios, uso_tokens, meta)."""
    if dimension not in CODIGOS_POR_DIMENSION:
        raise ValueError(f"Dimension desconocida: {dimension}")

    cfg = config or cargar_escala()
    system = cargar_instruccion_dimension(dimension, cfg)
    user = construir_mensaje_usuario(dimension, entrada, clasificacion, previos)

    modelo = str(cfg.modelo.get("nombre", "claude-sonnet-5-5"))
    temperatura = float(cfg.modelo.get("temperatura", 0))
    max_tokens = int(cfg.modelo.get("max_tokens", 4096))

    herramienta = {
        "name": "registrar_criterios",
        "description": "Registra la valoracion de todos los criterios de la dimension.",
        "input_schema": _esquema_herramienta(dimension),
    }

    respuesta = cliente.messages.create(
        model=modelo,
        max_tokens=max_tokens,
        temperature=temperatura,
        system=system,
        messages=[{"role": "user", "content": user}],
        tools=[herramienta],
        tool_choice={"type": "tool", "name": "registrar_criterios"},
    )

    uso = {
        "input_tokens": int(getattr(respuesta.usage, "input_tokens", 0) or 0),
        "output_tokens": int(getattr(respuesta.usage, "output_tokens", 0) or 0),
    }
    model_id = getattr(respuesta, "model", None) or modelo

    args: dict[str, Any] = {}
    for bloque in respuesta.content:
        if getattr(bloque, "type", None) == "tool_use" and getattr(
            bloque, "name", None
        ) == "registrar_criterios":
            args = dict(bloque.input or {})
            break

    criterios = _normalizar_criterios(dimension, list(args.get("criterios") or []))
    signals = [
        sanitizar_texto_modelo(str(s)) or ""
        for s in list(args.get("automationSignals") or [])
    ]
    meta: dict[str, Any] = {
        "automationSignals": signals,
        "tareaCorresponde": args.get("tareaCorresponde"),
        "modelId": model_id,
        "diffCapado": diff_esta_capado(entrada),
    }
    if dimension == "proporcionalidad":
        meta["suggestedLevel"] = args.get("suggestedLevel")
        meta["suggestedAmount"] = args.get("suggestedAmount")
        meta["dependeInformacionExterna"] = bool(
            args.get("dependeInformacionExterna", False)
        )
        motivo = args.get("motivoDependencia")
        if isinstance(motivo, str):
            meta["motivoDependencia"] = sanitizar_texto_modelo(motivo)
        else:
            meta["motivoDependencia"] = motivo

    criterios = postvalidar_criterios(criterios, entrada, meta)
    return criterios, uso, meta


def analizar_todas(
    cliente: Any,
    entrada: dict[str, Any],
    clasificacion: dict[str, Any],
    config: ConfigEscala | None = None,
) -> tuple[list[dict[str, Any]], dict[str, int], dict[str, Any]]:
    """Ejecuta las cuatro dimensiones en orden. Devuelve criterios, tokens y meta agregado."""
    cfg = config or cargar_escala()
    todos: list[dict[str, Any]] = []
    tokens = {"input_tokens": 0, "output_tokens": 0}
    diff_capado = diff_esta_capado(entrada)
    meta: dict[str, Any] = {
        "automationSignals": [],
        "tareaCorresponde": None,
        "suggestedLevel": None,
        "suggestedAmount": None,
        "dependeInformacionExterna": False,
        "motivoDependencia": None,
        "modelId": str(cfg.modelo.get("nombre", "claude-sonnet-5-5")),
        "diffCapado": diff_capado,
    }

    for dimension in DIMENSIONES:
        previos = todos if dimension == "proporcionalidad" else None
        criterios, uso, m = analizar_dimension(
            cliente, dimension, entrada, clasificacion, previos=previos, config=cfg
        )
        todos.extend(criterios)
        tokens["input_tokens"] += uso.get("input_tokens", 0)
        tokens["output_tokens"] += uso.get("output_tokens", 0)
        if m.get("modelId"):
            meta["modelId"] = m["modelId"]
        if dimension == "cumplimiento_alcance":
            meta["tareaCorresponde"] = m.get("tareaCorresponde")
        if dimension == "calidad_tecnica":
            meta["automationSignals"] = list(m.get("automationSignals") or [])
        if dimension == "proporcionalidad":
            meta["suggestedLevel"] = m.get("suggestedLevel")
            meta["suggestedAmount"] = m.get("suggestedAmount")
            meta["dependeInformacionExterna"] = bool(
                m.get("dependeInformacionExterna", False)
            )
            meta["motivoDependencia"] = m.get("motivoDependencia")

    # Reaplica postvalidacion global (p. ej. truncado afecta CR-013/CR-019 de cualquier paso)
    todos = postvalidar_criterios(todos, entrada, meta)
    return todos, tokens, meta
