"""CLI: revisar contribuciones del golden set."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from revision.decision import registrar_decision
from revision.exportar import exportar_web
from revision.normalizar import cargar_golden
from revision.registro import guardar, resolver_modo, revisar

_REPO_ROOT = Path(__file__).resolve().parents[2]
_CASOS_DEFAULT = str(_REPO_ROOT / "data" / "golden-set.jsonl")


def _parse_modo(valor: str) -> str:
    if valor == "simulado":
        return "reglas"
    if valor not in ("auto", "real", "reglas"):
        raise argparse.ArgumentTypeError(
            f"modo invalido: {valor!r} (use auto, real o reglas)"
        )
    return valor


def _id_corto(contribution_id: str) -> str:
    if ":" in contribution_id:
        base, _, suf = contribution_id.partition(":")
        return f"{base[:12]}:{suf}" if suf else base[:16]
    return contribution_id[:16]


def _casos_en_argv(argv: list[str]) -> bool:
    return any(a == "--casos" or a.startswith("--casos=") for a in argv)


def main(argv: list[str] | None = None) -> None:
    argv_list = list(sys.argv[1:] if argv is None else argv)
    casos_dado = _casos_en_argv(argv_list)

    parser = argparse.ArgumentParser(
        prog="revisar",
        description="Ejecuta la revision asistida sobre casos del golden set",
    )
    parser.add_argument(
        "--casos",
        default=_CASOS_DEFAULT,
        help="Ruta al archivo JSONL de casos (default: data/golden-set.jsonl)",
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
        help="Procesar todos los registros del archivo de casos",
    )
    parser.add_argument(
        "--modo",
        type=_parse_modo,
        default="auto",
        metavar="{auto,real,reglas}",
        help=(
            "Modo de analisis: auto (real si hay ANTHROPIC_API_KEY, si no reglas), "
            "real (requiere clave) o reglas (motor determinista sin modelo). "
            "El alias 'simulado' se acepta y se mapea a reglas."
        ),
    )
    parser.add_argument(
        "--salida",
        default="runs",
        help="Carpeta de salida de ejecuciones",
    )
    parser.add_argument(
        "--exportar-web",
        action="store_true",
        help="Exportar web/public/datos.json desde runs (requiere --casos)",
    )
    parser.add_argument(
        "--no-exportar",
        action="store_true",
        help="No escribir web/public/datos.json tras revisar (p. ej. golden set local)",
    )
    parser.add_argument(
        "--decidir",
        action="store_true",
        help="Registrar decision humana sobre una recomendacion previa (RF16)",
    )
    parser.add_argument(
        "--decision",
        choices=["aprobar", "rechazar", "ajustar_monto", "derivar_revision_humana"],
        help="Decision final del revisor (con --decidir)",
    )
    parser.add_argument(
        "--monto",
        type=float,
        default=None,
        help="Monto aprobado (con --decidir)",
    )
    parser.add_argument(
        "--justificacion",
        default=None,
        help="Justificacion de la decision (con --decidir)",
    )
    parser.add_argument(
        "--revisor",
        default=None,
        help="Codigo del revisor, p. ej. REV-01 (con --decidir)",
    )
    args = parser.parse_args(argv_list)

    if args.decidir:
        if not args.ids or len(args.ids) != 1:
            parser.error("--decidir requiere exactamente un --id")
        if not args.decision:
            parser.error("--decidir requiere --decision")
        if not args.justificacion:
            parser.error("--decidir requiere --justificacion")
        if not args.revisor:
            parser.error("--decidir requiere --revisor")
        registro = registrar_decision(
            contributionId=args.ids[0],
            decisionFinal=args.decision,
            montoAprobado=args.monto,
            justificacion=args.justificacion,
            revisor=args.revisor,
            carpeta=args.salida,
        )
        print(json.dumps(registro, ensure_ascii=False))
        return

    solo_exportar = args.exportar_web and not args.todos and not args.ids
    if solo_exportar and not casos_dado:
        parser.error("--exportar-web solo requiere --casos")
    if not solo_exportar and not args.todos and not args.ids:
        parser.error(
            "Indique --todos, al menos un --id, --decidir, o --exportar-web --casos"
        )

    if not solo_exportar:
        try:
            modo_efectivo = resolver_modo(args.modo)
        except RuntimeError as exc:
            print(str(exc), file=sys.stderr)
            sys.exit(1)
        print(f"Modo de ejecucion: {modo_efectivo} (pedido: {args.modo})")

        try:
            registros = cargar_golden(args.casos)
        except FileNotFoundError as exc:
            print(str(exc), file=sys.stderr)
            sys.exit(1)
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
            salida = revisar(registro, modo=args.modo)
            guardar(salida, carpeta=args.salida)
            rec = (salida.get("recommendation") or {}).get("value")
            nivel = (salida.get("reward") or {}).get("suggestedLevel")
            banda = (salida.get("confidence") or {}).get("band")
            dur = (salida.get("execution") or {}).get("durationMs")
            cid = str(salida.get("contributionId") or "")
            print(f"{_id_corto(cid)}\t{rec}\t{nivel}\t{banda}\t{dur}ms")

    debe_exportar = (
        not args.no_exportar
        and (args.exportar_web or (not solo_exportar and casos_dado))
    )
    if debe_exportar:
        ruta = exportar_web(carpeta_runs=args.salida, casos_path=args.casos)
        if ruta is not None:
            try:
                etiqueta = ruta.relative_to(_REPO_ROOT)
            except ValueError:
                etiqueta = ruta
            print(f"Exportado: {etiqueta}")


if __name__ == "__main__":
    main()
