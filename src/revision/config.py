"""Carga de configuracion YAML del prototipo."""

from __future__ import annotations

from dataclasses import dataclass, field
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
        "excluded",
        "esperado",
    }
)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_RUTA_ESCALA_DEFAULT = _REPO_ROOT / "config" / "escala.yaml"
_RUTA_ADMISIBILIDAD_DEFAULT = _REPO_ROOT / "config" / "admisibilidad.yaml"


@dataclass(frozen=True)
class RangoNivel:
    nombre: str
    minimo: int
    maximo: int | None  # None = sin techo (p. ej. spike abierto)


@dataclass(frozen=True)
class ConfigEscala:
    version: str
    fecha: str
    niveles: tuple[RangoNivel, ...]
    confianza: dict[str, Any]
    severidad: dict[str, str]
    pesos_severidad: dict[str, int]
    modelo: dict[str, Any]
    techo_observado: int | None
    raw: dict[str, Any]
    recomendacion: dict[str, Any] = field(default_factory=dict)


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


def _parse_maximo(valor: Any) -> int | None:
    if valor is None:
        return None
    return int(valor)


def cargar_escala(ruta: Path | None = None) -> ConfigEscala:
    path = ruta or _RUTA_ESCALA_DEFAULT
    raw = _cargar_yaml(path)
    niveles = tuple(
        RangoNivel(
            nombre=str(item["nombre"]),
            minimo=int(item["min"]),
            maximo=_parse_maximo(item.get("max")),
        )
        for item in raw.get("niveles", [])
    )
    techo = raw.get("techo_observado")
    return ConfigEscala(
        version=str(raw.get("version", "")),
        fecha=str(raw.get("fecha", "")),
        niveles=niveles,
        confianza=dict(raw.get("confianza") or {}),
        severidad=dict(raw.get("severidad") or {}),
        pesos_severidad=dict(raw.get("pesos_severidad") or {}),
        modelo=dict(raw.get("modelo") or {}),
        techo_observado=int(techo) if techo is not None else None,
        raw=raw,
        recomendacion=dict(raw.get("recomendacion") or {}),
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


def umbral_spike(config: ConfigEscala | None = None) -> int:
    """Maximo del nivel alto; por encima empieza spike (CR-023 y afines)."""
    cfg = config or cargar_escala()
    for nivel in cfg.niveles:
        if nivel.nombre == "alto" and nivel.maximo is not None:
            return int(nivel.maximo)
    return 100


def nivel_para_monto(monto: int | float, config: ConfigEscala | None = None) -> str | None:
    cfg = config or cargar_escala()
    valor = int(monto)
    for nivel in cfg.niveles:
        if nivel.maximo is None:
            if valor >= nivel.minimo:
                return nivel.nombre
        elif nivel.minimo <= valor <= nivel.maximo:
            return nivel.nombre
    # Por debajo del minimo de la escala: se reporta como bajo; el caller anota el limite.
    if cfg.niveles:
        minimo_escala = min(n.minimo for n in cfg.niveles)
        if valor < minimo_escala:
            return "bajo"
    return None


def rango_nivel(
    nombre: str, config: ConfigEscala | None = None
) -> tuple[int, int | None] | None:
    cfg = config or cargar_escala()
    for nivel in cfg.niveles:
        if nivel.nombre == nombre:
            return (nivel.minimo, nivel.maximo)
    return None
