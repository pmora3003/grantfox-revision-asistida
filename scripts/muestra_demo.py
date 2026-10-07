#!/usr/bin/env python3
"""Arma data/casos-demo.jsonl desde el golden set local (12 PR publicos)."""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT / "src"))

from revision.admisibilidad import evaluar_admisibilidad
from revision.clasificar import clasificar_archivo, clasificar_entrega
from revision.config import cargar_admisibilidad
from revision.normalizar import cargar_golden, normalizar

_GOLDEN_DEFAULT = _REPO_ROOT / "data" / "golden-set.jsonl"
_SALIDA_DEFAULT = _REPO_ROOT / "data" / "casos-demo.jsonl"
_N_DEFAULT = 12
_SEMILLA_DEFAULT = 42
_PREFIJO_ID_DEFAULT = 1
_PROP_INADM = 3
_PROP_TOTAL = 12


def _repo_path(path: str | Path) -> Path:
    p = Path(path)
    return p if p.is_absolute() else _REPO_ROOT / p


def _perfil(registro: dict[str, Any], config: Any) -> dict[str, Any]:
    entrada = normalizar(registro)
    ctx = entrada.get("context") or {}
    file_stats = ctx.get("fileStats") or []
    clasificacion = clasificar_entrega(file_stats)
    adm = evaluar_admisibilidad(entrada, clasificacion, config)

    total_add = sum(int(item.get("additions") or 0) for item in file_stats)
    gen_add = sum(
        int(item.get("additions") or 0)
        for item in file_stats
        if clasificar_archivo(str(item.get("path", ""))) == "generado"
    )
    gen_mayoria = total_add > 0 and gen_add > total_add / 2

    ci = ctx.get("ciConclusion")
    trunc = bool(ctx.get("truncated"))
    monto = registro.get("requested_amount")
    try:
        monto_num = float(monto) if monto is not None else 0.0
    except (TypeError, ValueError):
        monto_num = 0.0

    return {
        "registro": registro,
        "orig_id": str(registro.get("id") or ""),
        "stopped_at": adm.get("stoppedAt"),
        "admisible": adm.get("outcome") == "admisible",
        "n_files": len(file_stats),
        "ci": ci,
        "truncated": trunc,
        "requested_amount": monto,
        "ci_falla": adm.get("outcome") == "admisible" and ci != "success",
        "gen_mayoria": adm.get("outcome") == "admisible" and gen_mayoria,
        "trunc_adm": adm.get("outcome") == "admisible" and trunc,
        "monto_alto": adm.get("outcome") == "admisible" and monto_num > 100,
    }


def _elegir_uno(
    candidatos: list[dict[str, Any]],
    rng: random.Random,
    usados: set[str],
) -> dict[str, Any] | None:
    pool = [c for c in candidatos if c["orig_id"] not in usados]
    if not pool:
        return None
    return rng.choice(pool)


def _elegir_n(
    candidatos: list[dict[str, Any]],
    n: int,
    rng: random.Random,
    usados: set[str],
) -> list[dict[str, Any]]:
    elegidos: list[dict[str, Any]] = []
    for _ in range(n):
        item = _elegir_uno(candidatos, rng, usados)
        if item is None:
            break
        usados.add(item["orig_id"])
        elegidos.append(item)
    return elegidos


def _cuotas(n: int) -> tuple[int, int]:
    """Inadmisibles (minimo 2) y admisibles segun n."""
    if n < 2:
        raise ValueError("--n debe ser al menos 2")
    inadm = max(2, round(n * _PROP_INADM / _PROP_TOTAL))
    if inadm >= n:
        inadm = n - 1
    return inadm, n - inadm


def seleccionar(
    perfiles: list[dict[str, Any]],
    rng: random.Random,
    n: int,
) -> list[dict[str, Any]]:
    n_inadm, n_adm = _cuotas(n)
    cantidad = n_inadm + n_adm
    usados: set[str] = set()
    orden: list[dict[str, Any]] = []

    inadm = [p for p in perfiles if not p["admisible"]]
    adm = [p for p in perfiles if p["admisible"]]

    ca001 = [p for p in inadm if p["stopped_at"] == "CA-001"]
    ca002 = [p for p in inadm if p["stopped_at"] == "CA-002"]
    otros_inadm = [p for p in inadm if p["stopped_at"] not in ("CA-001", "CA-002")]

    if ca001:
        pick = _elegir_uno(ca001, rng, usados)
        if pick:
            usados.add(pick["orig_id"])
            orden.append(pick)

    faltan_inadm = n_inadm - len(orden)
    if faltan_inadm > 0:
        orden.extend(_elegir_n(ca002, faltan_inadm, rng, usados))

    faltan_inadm = n_inadm - len(orden)
    if faltan_inadm > 0:
        orden.extend(_elegir_n(otros_inadm, faltan_inadm, rng, usados))

    if len(orden) < n_inadm:
        resto = [p for p in inadm if p["orig_id"] not in usados]
        orden.extend(_elegir_n(resto, n_inadm - len(orden), rng, usados))

    quotas_adm = [
        ("ci_falla", lambda p: p["ci_falla"]),
        ("gen_mayoria", lambda p: p["gen_mayoria"]),
        ("trunc_adm", lambda p: p["trunc_adm"]),
        ("monto_alto", lambda p: p["monto_alto"]),
    ]
    for _nombre, pred in quotas_adm:
        if len(orden) >= cantidad:
            break
        pool = [p for p in adm if pred(p)]
        pick = _elegir_uno(pool, rng, usados)
        if pick:
            usados.add(pick["orig_id"])
            orden.append(pick)

    while len(orden) < cantidad:
        pool = [p for p in adm if p["orig_id"] not in usados]
        pick = _elegir_uno(pool, rng, usados)
        if pick is None:
            break
        usados.add(pick["orig_id"])
        orden.append(pick)

    if len(orden) != cantidad:
        raise RuntimeError(
            f"No se pudieron elegir {cantidad} casos (se obtuvieron {len(orden)})"
        )
    return orden


def _cargar_prurls_excluir(ruta: Path) -> set[str]:
    urls: set[str] = set()
    for registro in cargar_golden(ruta):
        ctx = registro.get("context") or {}
        if isinstance(ctx, dict):
            url = ctx.get("prUrl")
            if url:
                urls.add(str(url))
    return urls


def _escribir_casos(
    elegidos: list[dict[str, Any]],
    destino: Path,
    prefijo_id: int,
) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    with destino.open("w", encoding="utf-8") as fh:
        for i, perfil in enumerate(elegidos):
            caso = normalizar(perfil["registro"])
            caso["id"] = f"PR-{prefijo_id + i:02d}"
            fh.write(json.dumps(caso, ensure_ascii=False) + "\n")


def _imprimir_tabla(elegidos: list[dict[str, Any]], prefijo_id: int) -> None:
    cols = ("demo_id", "orig_id", "files", "amount", "ci", "truncated", "stoppedAt")
    filas: list[tuple[str, ...]] = []
    for i, p in enumerate(elegidos):
        stopped = p["stopped_at"] if p["stopped_at"] else "-"
        trunc = "true" if p["truncated"] else "false"
        amt = p["requested_amount"]
        filas.append(
            (
                f"PR-{prefijo_id + i:02d}",
                p["orig_id"][:20] + ("..." if len(p["orig_id"]) > 20 else ""),
                str(p["n_files"]),
                str(amt),
                str(p["ci"]),
                trunc,
                stopped,
            )
        )
    widths = [len(c) for c in cols]
    for fila in filas:
        widths = [max(w, len(c)) for w, c in zip(widths, fila)]
    sep = "  "

    def fmt_row(cells: tuple[str, ...]) -> str:
        return sep.join(c.ljust(w) for c, w in zip(cells, widths))

    print(fmt_row(cols))
    print(sep.join("-" * w for w in widths))
    for fila in filas:
        print(fmt_row(fila))


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera data/casos-demo.jsonl")
    parser.add_argument(
        "--golden",
        default=str(_GOLDEN_DEFAULT),
        help="Ruta al golden set local (default: data/golden-set.jsonl)",
    )
    parser.add_argument(
        "--salida",
        default=str(_SALIDA_DEFAULT),
        help="Archivo JSONL de salida (default: data/casos-demo.jsonl)",
    )
    parser.add_argument(
        "--n",
        type=int,
        default=_N_DEFAULT,
        help=f"Cantidad de casos (default: {_N_DEFAULT})",
    )
    parser.add_argument(
        "--semilla",
        type=int,
        default=_SEMILLA_DEFAULT,
        help=f"Semilla aleatoria (default: {_SEMILLA_DEFAULT})",
    )
    parser.add_argument(
        "--excluir",
        default=None,
        help="JSONL existente: se omiten registros con el mismo context.prUrl",
    )
    parser.add_argument(
        "--prefijo-id",
        type=int,
        default=_PREFIJO_ID_DEFAULT,
        help=f"Numero inicial para ids PR-XX (default: {_PREFIJO_ID_DEFAULT})",
    )
    args = parser.parse_args()

    golden = _repo_path(args.golden)
    salida = _repo_path(args.salida)
    config = cargar_admisibilidad()
    registros = cargar_golden(golden)
    if args.excluir:
        excluir_urls = _cargar_prurls_excluir(_repo_path(args.excluir))
        registros = [
            r
            for r in registros
            if str((r.get("context") or {}).get("prUrl") or "") not in excluir_urls
        ]
    perfiles = [_perfil(r, config) for r in registros]
    rng = random.Random(args.semilla)
    elegidos = seleccionar(perfiles, rng, args.n)
    _escribir_casos(elegidos, salida, args.prefijo_id)
    print(f"Escrito: {salida.relative_to(_REPO_ROOT)}")
    _imprimir_tabla(elegidos, args.prefijo_id)


if __name__ == "__main__":
    main()
