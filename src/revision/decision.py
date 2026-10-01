"""Registro de la decision humana sobre una recomendacion (RF16, RG-02, RG-03)."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]

DECISIONES_VALIDAS = frozenset(
    {
        "aprobar",
        "rechazar",
        "ajustar_monto",
        "derivar_revision_humana",
    }
)

_REVISOR_RE = re.compile(r"^[A-Z]{2,5}-\d{1,4}$")


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


def _ultima_salida(contribution_id: str, carpeta: Path) -> dict[str, Any]:
    runs = _cargar_registro(carpeta)
    por: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in runs:
        cid = str(r.get("contributionId") or "")
        if cid == contribution_id:
            por[cid].append(r)
    items = por.get(contribution_id) or []
    if not items:
        raise FileNotFoundError(
            f"No hay ejecuciones registradas para {contribution_id!r} en {carpeta}"
        )
    items_ord = sorted(items, key=lambda x: str(x.get("executedAt") or ""))
    ultima = items_ord[-1]
    ruta = _resolver_archivo(ultima.get("archivo"), carpeta)
    if ruta is None:
        raise FileNotFoundError(
            f"No se encontro el archivo de la ultima ejecucion de {contribution_id!r}"
        )
    with ruta.open(encoding="utf-8") as fh:
        return json.load(fh)


def registrar_decision(
    contributionId: str,
    decisionFinal: str,
    montoAprobado: int | float | None,
    justificacion: str,
    revisor: str,
    carpeta: str | Path = "runs",
) -> dict[str, Any]:
    """Carga la ultima corrida y agrega una linea a runs/decisiones.jsonl."""
    if decisionFinal not in DECISIONES_VALIDAS:
        raise ValueError(
            f"decisionFinal invalida: {decisionFinal!r}. "
            f"Valores: {sorted(DECISIONES_VALIDAS)}"
        )
    codigo = (revisor or "").strip()
    if not _REVISOR_RE.fullmatch(codigo):
        raise ValueError(
            f"revisor invalido: {revisor!r}. "
            "Debe ser un codigo como REV-01 (patron [A-Z]{2,5}-\\d{1,4}), nunca un nombre"
        )

    root = _carpeta_abs(carpeta)
    root.mkdir(parents=True, exist_ok=True)
    salida = _ultima_salida(contributionId, root)

    recomendacion = (salida.get("recommendation") or {}).get("value")
    monto_propuesto = (salida.get("reward") or {}).get("requestedAmount")
    if monto_propuesto is None:
        monto_propuesto = 0
    monto_propuesto = int(monto_propuesto)
    monto_ok = int(montoAprobado) if montoAprobado is not None else monto_propuesto

    registro = {
        "contributionId": contributionId,
        "registradoEn": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "revisor": codigo,
        "recomendacionEmitida": recomendacion,
        "decisionFinal": decisionFinal,
        "montoPropuesto": monto_propuesto,
        "montoAprobado": monto_ok,
        "diferenciaMonto": monto_ok - monto_propuesto,
        "coincideConRecomendacion": decisionFinal == recomendacion,
        "justificacion": justificacion,
    }

    destino = root / "decisiones.jsonl"
    with destino.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(registro, ensure_ascii=False) + "\n")
    return registro
