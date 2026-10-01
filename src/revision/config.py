"""Carga de configuracion YAML del prototipo."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

CAMPOS_ETIQUETADO = frozenset(
    {
        "expected",
        "note",
        "source",
        "anchor",
        "labeled_at",
        "label_review",
        "rubric_version",
        "excluded",
    }
)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_RUTA_ESCALA_DEFAULT = _REPO_ROOT / "config" / "escala.yaml"
_RUTA_ADMISIBILIDAD_DEFAULT = _REPO_ROOT / "config" / "admisibilidad.yaml"


@dataclass(frozen=True)
class RangoNivel:
    nombre: str
    minimo: int
    maximo: int


@dataclass(frozen=True)
class ConfigEscala:
    version: str
    fecha: str
    niveles: tuple[RangoNivel, ...]
    confianza: dict[str, Any]
    severidad: dict[str, str]
    pesos_severidad: dict[str, int]
    modelo: dict[str, Any]
    raw: dict[str, Any]


@dataclass(frozen=True)
class ConfigAdmisibilidad:
    version: str
    fecha: str
    condiciones: tuple[dict[str, Any], ...]
    raw: dict[str, Any]

    def parametros_ca(self, codigo: str) -> dict[str, Any]:
        for cond in self.condiciones:
            if cond.get("codigo") == codigo:
                return dict(cond.get("parametros") or {})
        return {}


def _cargar_yaml(ruta: Path) -> dict[str, Any]:
    with ruta.open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict):
        raise ValueError(f"YAML invalido en {ruta}")
    return data


def cargar_escala(ruta: Path | None = None) -> ConfigEscala:
    path = ruta or _RUTA_ESCALA_DEFAULT
    raw = _cargar_yaml(path)
    niveles = tuple(
        RangoNivel(
            nombre=str(item["nombre"]),
            minimo=int(item["min"]),
            maximo=int(item["max"]),
        )
        for item in raw.get("niveles", [])
    )
    return ConfigEscala(
        version=str(raw.get("version", "")),
        fecha=str(raw.get("fecha", "")),
        niveles=niveles,
        confianza=dict(raw.get("confianza") or {}),
        severidad=dict(raw.get("severidad") or {}),
        pesos_severidad=dict(raw.get("pesos_severidad") or {}),
        modelo=dict(raw.get("modelo") or {}),
        raw=raw,
    )


def cargar_admisibilidad(ruta: Path | None = None) -> ConfigAdmisibilidad:
    path = ruta or _RUTA_ADMISIBILIDAD_DEFAULT
    raw = _cargar_yaml(path)
    condiciones = tuple(dict(c) for c in raw.get("condiciones", []))
    return ConfigAdmisibilidad(
        version=str(raw.get("version", "")),
        fecha=str(raw.get("fecha", "")),
        condiciones=condiciones,
        raw=raw,
    )


def nivel_para_monto(monto: int | float, config: ConfigEscala | None = None) -> str | None:
    cfg = config or cargar_escala()
    valor = int(monto)
    for nivel in cfg.niveles:
        if nivel.minimo <= valor <= nivel.maximo:
            return nivel.nombre
    return None


def rango_nivel(nombre: str, config: ConfigEscala | None = None) -> tuple[int, int] | None:
    cfg = config or cargar_escala()
    for nivel in cfg.niveles:
        if nivel.nombre == nombre:
            return (nivel.minimo, nivel.maximo)
    return None
