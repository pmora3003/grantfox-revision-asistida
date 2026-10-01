"""Normalizacion del insumo y carga del conjunto golden."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

CAMPOS_PERMITIDOS = frozenset(
    {
        "id",
        "context.prUrl",
        "context.headSha",
        "context.title",
        "context.body",
        "context.merged",
        "context.state",
        "context.linkedIssueTitle",
        "context.linkedIssueBody",
        "context.diff",
        "context.truncated",
        "context.fileStats",
        "context.ciConclusion",
        "context.reviewCommentCount",
        "requested_amount",
    }
)

_CAMPOS_CONTEXTO = (
    "prUrl",
    "headSha",
    "title",
    "body",
    "merged",
    "state",
    "linkedIssueTitle",
    "linkedIssueBody",
    "diff",
    "truncated",
    "fileStats",
    "ciConclusion",
    "reviewCommentCount",
)

_RE_EMAIL = re.compile(
    r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
    re.IGNORECASE,
)
_RE_STELLAR = re.compile(r"G[A-Z2-7]{55}")
_RE_ETHEREUM = re.compile(r"0x[a-fA-F0-9]{40}")


def _anonimizar_texto(texto: str) -> str:
    if not texto:
        return texto
    resultado = _RE_EMAIL.sub("[redactado]", texto)
    resultado = _RE_STELLAR.sub("[redactado]", resultado)
    resultado = _RE_ETHEREUM.sub("[redactado]", resultado)
    return resultado


def normalizar(registro: dict[str, Any]) -> dict[str, Any]:
    """Devuelve solo los campos de entrada del modelo, sin etiquetado."""
    ctx_origen = registro.get("context") or {}
    if not isinstance(ctx_origen, dict):
        ctx_origen = {}

    contexto: dict[str, Any] = {}
    for clave in _CAMPOS_CONTEXTO:
        valor = ctx_origen.get(clave)
        if clave in ("title", "body", "linkedIssueTitle", "linkedIssueBody") and isinstance(
            valor, str
        ):
            valor = _anonimizar_texto(valor)
        contexto[clave] = valor

    salida: dict[str, Any] = {
        "id": registro.get("id"),
        "context": contexto,
        "requested_amount": registro.get("requested_amount"),
    }
    return salida


def cargar_golden(path: str | Path) -> list[dict[str, Any]]:
    """Lee el JSONL y devuelve los registros crudos, uno por linea."""
    ruta = Path(path)
    registros: list[dict[str, Any]] = []
    with ruta.open(encoding="utf-8") as fh:
        for linea in fh:
            linea = linea.strip()
            if not linea:
                continue
            registros.append(json.loads(linea))
    return registros
