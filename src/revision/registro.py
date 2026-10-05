"""Orquestacion del pipeline y registro de ejecuciones."""

from __future__ import annotations

import hashlib
import json
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from revision.admisibilidad import evaluar_admisibilidad
from revision.agregar import agregar
from revision.analizar import (
    analizar_todas,
    cargar_dotenv,
    criterios_insuficientes,
    diff_esta_capado,
    instruccion_renderizada,
    version_instruccion,
)
from revision.clasificar import clasificar_entrega
from revision.config import cargar_admisibilidad, cargar_escala
from revision.esquema import Salida
from revision.marcos import normalizar_modo_ejecucion
from revision.normalizar import normalizar
from revision.reglas import analizar_todas_reglas

_REPO_ROOT = Path(__file__).resolve().parents[2]

Modo = Literal["auto", "real", "reglas", "simulado"]


def _id_seguro(contribution_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", contribution_id)


def os_environ_key() -> str | None:
    import os

    return os.environ.get("ANTHROPIC_API_KEY")


def resolver_modo(modo: Modo = "auto") -> Literal["real", "reglas"]:
    """auto = real si hay ANTHROPIC_API_KEY (env o .env), si no reglas.

    'simulado' se acepta como alias legado de 'reglas'.
    """
    if modo == "simulado":
        modo = "reglas"
    if modo not in ("auto", "real", "reglas"):
        raise ValueError(f"modo invalido: {modo}")
    if modo == "reglas":
        return "reglas"
    cargar_dotenv()
    tiene_clave = bool(os_environ_key())
    if modo == "real":
        if not tiene_clave:
            raise RuntimeError(
                "Modo real requiere ANTHROPIC_API_KEY en el entorno o en .env"
            )
        return "real"
    return "real" if tiene_clave else "reglas"


def _cliente_anthropic() -> Any:
    cargar_dotenv()
    api_key = os_environ_key()
    if not api_key:
        raise RuntimeError("Falta ANTHROPIC_API_KEY en el entorno o en .env")
    import anthropic

    return anthropic.Anthropic(api_key=api_key)


def _hash_sha256_hex(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def _entrada_hash(entrada: dict[str, Any]) -> str:
    return _hash_sha256_hex(
        json.dumps(entrada, sort_keys=True, ensure_ascii=False, default=str)
    )


def revisar(
    registro_crudo: dict[str, Any],
    cliente: Any | None = None,
    sin_modelo: bool = False,
    modo: Modo = "auto",
) -> dict[str, Any]:
    """Pipeline completo: normalizar, clasificar, admisibilidad, analisis, agregar.

    modo: auto|real|reglas (simulado es alias de reglas). sin_modelo conserva el
    atajo de todos los criterios en evidencia_insuficiente (pruebas internas).
    """
    inicio = time.perf_counter()
    cfg_escala = cargar_escala()
    cfg_adm = cargar_admisibilidad()
    instruccion = version_instruccion()
    instruction_text = instruccion_renderizada(cfg_escala)
    instruction_hash = _hash_sha256_hex(instruction_text)

    if sin_modelo:
        modo_efectivo: Literal["real", "reglas"] = "reglas"
    else:
        modo_efectivo = resolver_modo(modo)

    entrada = normalizar(registro_crudo)
    entrada_hash = _entrada_hash(entrada)
    ctx = entrada.get("context") or {}
    head_sha = ctx.get("headSha")
    if head_sha is not None:
        head_sha = str(head_sha)

    clasificacion = clasificar_entrega(ctx.get("fileStats") or [])
    admissibility = evaluar_admisibilidad(entrada, clasificacion, cfg_adm)

    tokens = {"input_tokens": 0, "output_tokens": 0}
    model_name = str(cfg_escala.modelo.get("nombre", "claude-sonnet-5-5"))
    model_version = model_name
    meta: dict[str, Any] = {
        "automationSignals": [],
        "tareaCorresponde": None,
        "suggestedLevel": None,
        "suggestedAmount": None,
        "dependeInformacionExterna": False,
        "motivoDependencia": None,
        "diffCapado": diff_esta_capado(entrada),
        "modoEjecucion": modo_efectivo,
    }

    if admissibility.get("outcome") == "no_admisible":
        criterios = criterios_insuficientes(
            f"Analisis detenido por admisibilidad ({admissibility.get('stoppedAt')})"
        )
        if modo_efectivo == "reglas":
            model_name = "motor-reglas"
            model_version = "reglas-v1"
    elif sin_modelo:
        criterios = criterios_insuficientes("Ejecucion sin modelo")
        model_name = "motor-reglas"
        model_version = "reglas-v1"
    elif modo_efectivo == "reglas":
        criterios, tokens, meta_modelo = analizar_todas_reglas(
            entrada, clasificacion, cfg_escala
        )
        meta.update(meta_modelo)
        meta["modoEjecucion"] = "reglas"
        model_name = "motor-reglas"
        model_version = "reglas-v1"
    else:
        cli = cliente or _cliente_anthropic()
        criterios, tokens, meta_modelo = analizar_todas(
            cli, entrada, clasificacion, cfg_escala
        )
        meta.update(meta_modelo)
        meta["modoEjecucion"] = "real"
        model_version = str(meta_modelo.get("modelId") or model_name)

    agregado = agregar(
        admissibility, clasificacion, criterios, entrada, meta, cfg_escala
    )
    criterios = agregado.get("criteria") or criterios

    duration_ms = int((time.perf_counter() - inicio) * 1000)
    executed_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    file_cls = {
        "byType": clasificacion["byType"],
        "realVolume": clasificacion["realVolume"],
        "excludedFromVolume": clasificacion["excludedFromVolume"],
        "porArchivo": clasificacion.get("porArchivo"),
    }

    truncated_input = bool(ctx.get("truncated")) or bool(meta.get("diffCapado"))
    modo_salida = normalizar_modo_ejecucion(modo_efectivo) or modo_efectivo

    salida_dict: dict[str, Any] = {
        "contributionId": str(entrada.get("id") or registro_crudo.get("id") or ""),
        "executedAt": executed_at,
        "model": {"name": model_name, "version": model_version},
        "instructionVersion": instruccion,
        "headSha": head_sha,
        "modoEjecucion": modo_salida,
        "admissibility": {
            "outcome": admissibility["outcome"],
            "stoppedAt": admissibility.get("stoppedAt"),
            "conditions": admissibility["conditions"],
            "version": admissibility.get("version"),
        },
        "fileClassification": file_cls,
        "criteria": criterios,
        "dimensions": agregado["dimensions"],
        "reward": agregado["reward"],
        "recommendation": agregado["recommendation"],
        "confidence": agregado["confidence"],
        "priority": agregado["priority"],
        "automationSignals": agregado["automationSignals"],
        "limits": agregado["limits"],
        "execution": {
            "durationMs": duration_ms,
            "truncatedInput": truncated_input,
            "instructionHash": instruction_hash,
            "entradaHash": entrada_hash,
        },
    }

    validada = Salida.model_validate(salida_dict)
    resultado = validada.model_dump(mode="json")
    resultado["_tokens"] = tokens
    return resultado


def guardar(salida: dict[str, Any], carpeta: str | Path = "runs") -> Path:
    """Escribe runs/<id_seguro>__<timestamp>__<uuid>.json y append a runs/registro.jsonl."""
    root = Path(carpeta)
    if not root.is_absolute():
        root = _REPO_ROOT / root
    root.mkdir(parents=True, exist_ok=True)

    contribution_id = str(salida.get("contributionId") or "sin_id")
    executed_at = str(salida.get("executedAt") or "")
    stamp = executed_at.replace(":", "").replace("-", "")
    if not stamp:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    sufijo = uuid.uuid4().hex[:8]
    nombre = f"{_id_seguro(contribution_id)}__{stamp}__{sufijo}.json"
    ruta = root / nombre

    tokens = salida.pop("_tokens", None) or {}
    with ruta.open("w", encoding="utf-8") as fh:
        json.dump(salida, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    levels = {c["code"]: c["level"] for c in salida.get("criteria") or []}
    linea = {
        "contributionId": contribution_id,
        "executedAt": salida.get("executedAt"),
        "model": salida.get("model"),
        "instructionVersion": salida.get("instructionVersion"),
        "recommendation": (salida.get("recommendation") or {}).get("value"),
        "criteria": levels,
        "durationMs": (salida.get("execution") or {}).get("durationMs"),
        "tokens": tokens,
        "archivo": str(ruta.relative_to(_REPO_ROOT)) if ruta.is_relative_to(_REPO_ROOT) else str(ruta),
    }
    registro_path = root / "registro.jsonl"
    with registro_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(linea, ensure_ascii=False) + "\n")

    return ruta
