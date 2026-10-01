"""Exporta la ultima revision por contribucion para la demo web."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from revision.normalizar import cargar_golden, normalizar

_REPO_ROOT = Path(__file__).resolve().parents[2]


def _carpeta_abs(carpeta: str | Path) -> Path:
    root = Path(carpeta)
    if not root.is_absolute():
        root = _REPO_ROOT / root
    return root


def _cargar_registro(carpeta: Path) -> list[dict[str, Any]]:
    ruta = carpeta / "registro.jsonl"
    if not ruta.is_file():
        return []
    lineas: list[dict[str, Any]] = []
    with ruta.open(encoding="utf-8") as fh:
        for linea in fh:
            linea = linea.strip()
            if not linea:
                continue
            lineas.append(json.loads(linea))
    return lineas


def _resolver_archivo(archivo: str | None, carpeta: Path) -> Path | None:
    if not archivo:
        return None
    path = Path(archivo)
    if path.is_file():
        return path
    cand = _REPO_ROOT / archivo
    if cand.is_file():
        return cand
    cand2 = carpeta / Path(archivo).name
    if cand2.is_file():
        return cand2
    return None


def _cargar_salida(run: dict[str, Any], carpeta: Path) -> dict[str, Any] | None:
    ruta = _resolver_archivo(run.get("archivo"), carpeta)
    if ruta is None:
        return None
    with ruta.open(encoding="utf-8") as fh:
        return json.load(fh)


def _ultimas_por_contribucion(
    runs: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    por: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in runs:
        cid = str(r.get("contributionId") or "")
        por[cid].append(r)
    ultimas: dict[str, dict[str, Any]] = {}
    for cid, items in por.items():
        items_ord = sorted(items, key=lambda x: str(x.get("executedAt") or ""))
        ultimas[cid] = items_ord[-1]
    return ultimas


def exportar_web(
    carpeta_runs: str | Path = "runs",
    casos_path: str | Path | None = None,
    destino: str | Path = "web/public/datos.json",
) -> Path:
    """Escribe un JSON con {entrada, salida} por caso, ordenado por id."""
    if casos_path is None:
        raise ValueError("casos_path es obligatorio para exportar_web")

    carpeta = _carpeta_abs(carpeta_runs)
    dest = Path(destino)
    if not dest.is_absolute():
        dest = _REPO_ROOT / dest
    dest.parent.mkdir(parents=True, exist_ok=True)

    registros = cargar_golden(casos_path)
    runs = _cargar_registro(carpeta)
    ultimas = _ultimas_por_contribucion(runs)

    payload: list[dict[str, Any]] = []
    for registro in sorted(registros, key=lambda r: str(r.get("id") or "")):
        cid = str(registro.get("id") or "")
        entrada = normalizar(registro)
        run = ultimas.get(cid)
        if run is None:
            continue
        salida = _cargar_salida(run, carpeta)
        if salida is None:
            continue
        payload.append({"entrada": entrada, "salida": salida})

    dest.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return dest
