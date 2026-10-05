"""Carga de marcos de referencia y fuentes (RNF-01)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

_REPO_ROOT = Path(__file__).resolve().parents[2]
_RUTA_MARCOS_DEFAULT = _REPO_ROOT / "config" / "marcos.yaml"


@dataclass(frozen=True)
class EntradaMarco:
    marco: str
    url: str | None


@dataclass(frozen=True)
class ConfigMarcos:
    version: str
    fecha: str
    condiciones: dict[str, EntradaMarco]
    criterios: dict[str, EntradaMarco]
    raw: dict[str, Any]


def _parse_entrada(raw: dict[str, Any] | None) -> EntradaMarco:
    data = raw or {}
    url = data.get("url")
    return EntradaMarco(
        marco=str(data.get("marco") or ""),
        url=None if url is None else str(url),
    )


def cargar_marcos(ruta: Path | None = None) -> ConfigMarcos:
    path = ruta or _RUTA_MARCOS_DEFAULT
    with path.open(encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    if not isinstance(raw, dict):
        raise ValueError(f"YAML invalido en {path}")
    condiciones = {
        str(k): _parse_entrada(v if isinstance(v, dict) else None)
        for k, v in (raw.get("condiciones") or {}).items()
    }
    criterios = {
        str(k): _parse_entrada(v if isinstance(v, dict) else None)
        for k, v in (raw.get("criterios") or {}).items()
    }
    return ConfigMarcos(
        version=str(raw.get("version", "")),
        fecha=str(raw.get("fecha", "")),
        condiciones=condiciones,
        criterios=criterios,
        raw=raw,
    )


def marco_de_criterio(
    codigo: str, config: ConfigMarcos | None = None
) -> EntradaMarco:
    cfg = config or cargar_marcos()
    return cfg.criterios.get(codigo) or EntradaMarco(marco="", url=None)


def fuente_de_condicion(
    codigo: str, config: ConfigMarcos | None = None
) -> EntradaMarco:
    cfg = config or cargar_marcos()
    return cfg.condiciones.get(codigo) or EntradaMarco(marco="", url=None)


def anotar_criterio(
    criterio: dict[str, Any], config: ConfigMarcos | None = None
) -> dict[str, Any]:
    entrada = marco_de_criterio(str(criterio.get("code") or ""), config)
    out = dict(criterio)
    out["marco"] = entrada.marco
    out["marcoUrl"] = entrada.url
    return out


def anotar_criterios(
    criterios: list[dict[str, Any]], config: ConfigMarcos | None = None
) -> list[dict[str, Any]]:
    cfg = config or cargar_marcos()
    return [anotar_criterio(c, cfg) for c in criterios]


def anotar_condicion(
    condicion: dict[str, Any], config: ConfigMarcos | None = None
) -> dict[str, Any]:
    entrada = fuente_de_condicion(str(condicion.get("code") or ""), config)
    out = dict(condicion)
    out["fuente"] = entrada.marco
    out["fuenteUrl"] = entrada.url
    return out


def anotar_condiciones(
    condiciones: list[dict[str, Any]], config: ConfigMarcos | None = None
) -> list[dict[str, Any]]:
    cfg = config or cargar_marcos()
    return [anotar_condicion(c, cfg) for c in condiciones]


def normalizar_modo_ejecucion(modo: str | None) -> str | None:
    """Lee 'simulado' legado como 'reglas'."""
    if modo is None:
        return None
    if modo == "simulado":
        return "reglas"
    return modo
