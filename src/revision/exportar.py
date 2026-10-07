"""Exporta la ultima revision por contribucion para la demo web."""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from revision.normalizar import cargar_golden, normalizar

_REPO_ROOT = Path(__file__).resolve().parents[2]
_GOLDEN_SET = (_REPO_ROOT / "data" / "golden-set.jsonl").resolve()
_CORRIDAS_DIR = _REPO_ROOT / "web" / "public" / "corridas"
_INDEX_CORRIDAS = _CORRIDAS_DIR / "index.json"


def es_ruta_golden_set(casos_path: str | Path) -> bool:
    """True si la ruta de casos apunta al golden set local (no publicable)."""
    path = Path(casos_path)
    if path.is_absolute():
        return path.resolve() == _GOLDEN_SET
    return (_REPO_ROOT / path).resolve() == _GOLDEN_SET


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


def _armar_payload(
    casos_path: str | Path,
    carpeta: Path,
) -> list[dict[str, Any]]:
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
    return payload


def _meta_corrida(payload: list[dict[str, Any]]) -> tuple[str, str, str]:
    motor = "reglas"
    modelo = "reglas-v1"
    generada = ""
    for item in payload:
        salida = item.get("salida") or {}
        modo = salida.get("modoEjecucion")
        if modo:
            motor = str(modo)
        model = salida.get("model") or {}
        ver = model.get("version") or model.get("name")
        if ver:
            modelo = str(ver)
        ejecutada = str(salida.get("executedAt") or "")
        if ejecutada and ejecutada > generada:
            generada = ejecutada
    if not generada:
        generada = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return motor, modelo, generada


def _escribir_json(dest: Path, payload: list[dict[str, Any]]) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _upsert_indice_corrida(
    corrida_id: str,
    nombre: str,
    archivo: str,
    payload: list[dict[str, Any]],
) -> None:
    motor, modelo, generada = _meta_corrida(payload)
    entrada_indice = {
        "id": corrida_id,
        "nombre": nombre,
        "archivo": archivo,
        "generadaEn": generada,
        "motor": motor,
        "modelo": modelo,
        "casos": len(payload),
    }
    existente: list[dict[str, Any]] = []
    if _INDEX_CORRIDAS.is_file():
        existente = json.loads(_INDEX_CORRIDAS.read_text(encoding="utf-8"))
        if not isinstance(existente, list):
            existente = []
    por_id = {str(item.get("id")): item for item in existente if item.get("id")}
    por_id[corrida_id] = entrada_indice
    ordenados = sorted(por_id.values(), key=lambda x: str(x.get("id") or ""))
    _escribir_json(_INDEX_CORRIDAS, ordenados)


def exportar_web(
    carpeta_runs: str | Path = "runs",
    casos_path: str | Path | None = None,
    destino: str | Path = "web/public/datos.json",
    corrida_id: str | None = None,
    corrida_nombre: str | None = None,
) -> Path | None:
    """Escribe un JSON con {entrada, salida} por caso, ordenado por id."""
    if casos_path is None:
        raise ValueError("casos_path es obligatorio para exportar_web")

    if es_ruta_golden_set(casos_path):
        print(
            "Advertencia: no se exporta a la web cuando --casos es "
            "data/golden-set.jsonl (conjunto local con etiquetas).",
            file=sys.stderr,
        )
        return None

    carpeta = _carpeta_abs(carpeta_runs)
    payload = _armar_payload(casos_path, carpeta)

    if corrida_id:
        cid = corrida_id.strip()
        if not cid:
            raise ValueError("corrida_id no puede estar vacio")
        nombre = (corrida_nombre or cid).strip() or cid
        archivo = f"{cid}.json"
        dest = _CORRIDAS_DIR / archivo
        _escribir_json(dest, payload)
        _upsert_indice_corrida(cid, nombre, archivo, payload)
        return dest

    dest = Path(destino)
    if not dest.is_absolute():
        dest = _REPO_ROOT / dest
    _escribir_json(dest, payload)
    return dest
