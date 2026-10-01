"""CLI: revisar contribuciones del golden set."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from revision.exportar import exportar
from revision.normalizar import cargar_golden
from revision.registro import guardar, revisar

_REPO_ROOT = Path(__file__).resolve().parents[2]


def _id_corto(contribution_id: str) -> str:
    if ":" in contribution_id:
        base, _, suf = contribution_id.partition(":")
        return f"{base[:12]}:{suf}" if suf else base[:16]
    return contribution_id[:16]


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="revisar",
        description="Ejecuta la revision asistida sobre casos del golden set",
    )
    parser.add_argument(
        "--golden",
        default=str(_REPO_ROOT / "data" / "golden-set.jsonl"),
        help="Ruta al golden-set.jsonl",
    )
    parser.add_argument(
        "--id",
        action="append",
        dest="ids",
        default=None,
        help="Identificador de contribucion (repetible)",
    )
    parser.add_argument(
        "--todos",
        action="store_true",
        help="Procesar todos los registros del golden set",
    )
    parser.add_argument(
        "--sin-modelo",
        action="store_true",
        help="Omitir llamadas al modelo (criterios en evidencia insuficiente)",
    )
    parser.add_argument(
        "--salida",
        default="runs",
        help="Carpeta de salida de ejecuciones",
    )
    parser.add_argument(
        "--exportar-ui",
        action="store_true",
        help="Solo exportar ui/datos.js desde runs (sin revisar)",
    )
    args = parser.parse_args(argv)

    solo_exportar = args.exportar_ui and not args.todos and not args.ids
    if not solo_exportar and not args.todos and not args.ids:
        parser.error("Indique --todos, al menos un --id, o --exportar-ui")

    if not solo_exportar:
        registros = cargar_golden(args.golden)
        if args.ids:
            buscados = set(args.ids)
            seleccion = [r for r in registros if r.get("id") in buscados]
            faltan = buscados - {r.get("id") for r in seleccion}
            if faltan:
                print(
                    f"Advertencia: ids no encontrados: {sorted(faltan)}",
                    file=sys.stderr,
                )
        else:
            seleccion = registros

        for registro in seleccion:
            salida = revisar(registro, sin_modelo=args.sin_modelo)
            guardar(salida, carpeta=args.salida)
            rec = (salida.get("recommendation") or {}).get("value")
            nivel = (salida.get("reward") or {}).get("suggestedLevel")
            banda = (salida.get("confidence") or {}).get("band")
            dur = (salida.get("execution") or {}).get("durationMs")
            cid = str(salida.get("contributionId") or "")
            print(f"{_id_corto(cid)}\t{rec}\t{nivel}\t{banda}\t{dur}ms")

    ruta_ui = exportar(carpeta_runs=args.salida)
    try:
        etiqueta = ruta_ui.relative_to(_REPO_ROOT)
    except ValueError:
        etiqueta = ruta_ui
    print(f"Exportado: {etiqueta}")


if __name__ == "__main__":
    main()
