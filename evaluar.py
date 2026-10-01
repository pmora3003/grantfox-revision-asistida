"""Evaluacion del prototipo contra el golden set (contexto seccion 15)."""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any

from revision.config import nivel_para_monto
from revision.normalizar import cargar_golden

_REPO_ROOT = Path(__file__).resolve().parent

MAPA_ESPERADO = {
    "APPROVE": "aprobar",
    "REJECT": "rechazar",
    "ADJUST_AMOUNT": "ajustar_monto",
    "NEEDS_HUMAN": "derivar_revision_humana",
}

CLASES = ("aprobar", "rechazar", "ajustar_monto", "derivar_revision_humana")


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


def _pares_consistencia(
    runs: list[dict[str, Any]],
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    por: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in runs:
        cid = str(r.get("contributionId") or "")
        por[cid].append(r)
    pares: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for items in por.values():
        if len(items) < 2:
            continue
        items_ord = sorted(items, key=lambda x: str(x.get("executedAt") or ""))
        pares.append((items_ord[-2], items_ord[-1]))
    return pares


def _p90(valores: list[float]) -> float:
    if not valores:
        return 0.0
    ordenados = sorted(valores)
    idx = int(round(0.9 * (len(ordenados) - 1)))
    return float(ordenados[idx])


def evaluar(golden_path: Path, carpeta: Path) -> dict[str, Any]:
    golden = cargar_golden(golden_path)
    runs = _cargar_registro(carpeta)
    ultimas = _ultimas_por_contribucion(runs)

    total_scored = 0
    aciertos = 0
    por_clase_esp: Counter[str] = Counter()
    por_clase_ok: Counter[str] = Counter()
    matriz: dict[str, Counter[str]] = {c: Counter() for c in CLASES}

    adm_total = 0
    adm_ok = 0
    contenido_total = 0
    contenido_ok = 0

    tier_total = 0
    tier_ok = 0

    excluidos_total = 0
    excluidos_ok = 0

    calib: dict[str, dict[str, int]] = {
        "alto": {"n": 0, "ok": 0},
        "medio": {"n": 0, "ok": 0},
        "bajo": {"n": 0, "ok": 0},
    }

    duraciones: list[float] = []
    modos_ejecucion: set[str] = set()

    for registro in golden:
        cid = str(registro.get("id") or "")
        run = ultimas.get(cid)
        if not run:
            continue

        esperado_raw = (registro.get("expected") or {}).get("recommendation")
        esperado = MAPA_ESPERADO.get(str(esperado_raw), str(esperado_raw))
        obtenido = run.get("recommendation")
        excluded = bool(registro.get("excluded"))

        completa = _cargar_salida(run, carpeta)
        banda = "bajo"
        suggested = None
        es_adm = False
        if completa:
            modo = completa.get("modoEjecucion")
            if modo in ("real", "simulado"):
                modos_ejecucion.add(str(modo))
            banda = (completa.get("confidence") or {}).get("band") or "bajo"
            suggested = (completa.get("reward") or {}).get("suggestedLevel")
            es_adm = (completa.get("admissibility") or {}).get("outcome") == "no_admisible"
            dur = (completa.get("execution") or {}).get("durationMs")
            if dur is not None:
                duraciones.append(float(dur))
        elif run.get("durationMs") is not None:
            duraciones.append(float(run["durationMs"]))

        if excluded:
            excluidos_total += 1
            if obtenido == "derivar_revision_humana":
                excluidos_ok += 1
            continue

        total_scored += 1
        correcto = obtenido == esperado
        if correcto:
            aciertos += 1
            por_clase_ok[esperado] += 1
        por_clase_esp[esperado] += 1
        if esperado in matriz and obtenido in CLASES:
            matriz[esperado][obtenido] += 1

        if es_adm:
            adm_total += 1
            if correcto:
                adm_ok += 1
        else:
            contenido_total += 1
            if correcto:
                contenido_ok += 1

        expected_amount = (registro.get("expected") or {}).get("amount")
        if expected_amount is not None and suggested:
            tier_esp = nivel_para_monto(int(expected_amount))
            if tier_esp:
                tier_total += 1
                if suggested == tier_esp:
                    tier_ok += 1

        if banda in calib:
            calib[banda]["n"] += 1
            if correcto:
                calib[banda]["ok"] += 1

    pares = _pares_consistencia(runs)
    consist_total = 0
    consist_iguales = 0
    for a, b in pares:
        ca = a.get("criteria") or {}
        cb = b.get("criteria") or {}
        for code in set(ca) | set(cb):
            consist_total += 1
            if ca.get(code) == cb.get(code):
                consist_iguales += 1

    acuerdo_total = (aciertos / total_scored) if total_scored else 0.0

    return {
        "n_scored": total_scored,
        "n_excluded": excluidos_total,
        "agreement": {
            "total": round(acuerdo_total, 4),
            "aciertos": aciertos,
            "por_clase": {
                c: {
                    "n": por_clase_esp[c],
                    "aciertos": por_clase_ok[c],
                    "ratio": (
                        round(por_clase_ok[c] / por_clase_esp[c], 4)
                        if por_clase_esp[c]
                        else None
                    ),
                }
                for c in CLASES
            },
        },
        "confusion_matrix": {
            esp: {obt: matriz[esp][obt] for obt in CLASES} for esp in CLASES
        },
        "admissibility_split": {
            "admissibility_resolved": {
                "n": adm_total,
                "aciertos": adm_ok,
                "ratio": round(adm_ok / adm_total, 4) if adm_total else None,
            },
            "content": {
                "n": contenido_total,
                "aciertos": contenido_ok,
                "ratio": (
                    round(contenido_ok / contenido_total, 4) if contenido_total else None
                ),
            },
        },
        "tier_agreement": {
            "n": tier_total,
            "aciertos": tier_ok,
            "ratio": round(tier_ok / tier_total, 4) if tier_total else None,
        },
        "excluded": {
            "n": excluidos_total,
            "derivar_ok": excluidos_ok,
            "ratio": (
                round(excluidos_ok / excluidos_total, 4) if excluidos_total else None
            ),
        },
        "consistency": {
            "pares": len(pares),
            "criteria_compared": consist_total,
            "identical": consist_iguales,
            "ratio": (
                round(consist_iguales / consist_total, 4) if consist_total else None
            ),
        },
        "duration_ms": {
            "n": len(duraciones),
            "median": float(statistics.median(duraciones)) if duraciones else None,
            "p90": _p90(duraciones) if duraciones else None,
            "min": min(duraciones) if duraciones else None,
            "max": max(duraciones) if duraciones else None,
        },
        "modos_ejecucion": sorted(modos_ejecucion),
        "calibration": {
            banda: {
                "n": datos["n"],
                "aciertos": datos["ok"],
                "accuracy": (
                    round(datos["ok"] / datos["n"], 4) if datos["n"] else None
                ),
            }
            for banda, datos in calib.items()
        },
    }


def _pct(v: float | None) -> str:
    if v is None:
        return "-"
    return f"{v * 100:.1f}%"


def _num(v: float | None) -> str:
    if v is None:
        return "-"
    return f"{v:.1f}"


def _md(metricas: dict[str, Any]) -> str:
    a = metricas["agreement"]
    lineas = [
        "# Metricas de evaluacion",
        "",
        f"Casos puntuados: {metricas['n_scored']} "
        f"(excluidos reportados aparte: {metricas['n_excluded']})",
        "",
        "## Coincidencia de recomendacion",
        "",
        f"Total: {a['aciertos']}/{metricas['n_scored']} ({_pct(a['total'])})",
        "",
        "| Clase | N | Aciertos | Ratio |",
        "|---|---:|---:|---:|",
    ]
    for clase, datos in a["por_clase"].items():
        lineas.append(
            f"| {clase} | {datos['n']} | {datos['aciertos']} | {_pct(datos['ratio'])} |"
        )

    lineas.extend(["", "## Matriz de confusion (filas = esperado)", ""])
    lineas.append("| esperado / obtenido | " + " | ".join(CLASES) + " |")
    lineas.append("|---|" + "---:|" * len(CLASES))
    for esp in CLASES:
        vals = [str(metricas["confusion_matrix"][esp][obt]) for obt in CLASES]
        lineas.append(f"| {esp} | " + " | ".join(vals) + " |")

    split = metricas["admissibility_split"]
    lineas.extend(
        [
            "",
            "## Separacion admisibilidad / contenido (RG-05)",
            "",
            f"- Resueltos por admisibilidad: "
            f"{split['admissibility_resolved']['aciertos']}/"
            f"{split['admissibility_resolved']['n']} "
            f"({_pct(split['admissibility_resolved']['ratio'])})",
            f"- Analisis de contenido: "
            f"{split['content']['aciertos']}/{split['content']['n']} "
            f"({_pct(split['content']['ratio'])})",
        ]
    )

    tier = metricas["tier_agreement"]
    lineas.extend(
        [
            "",
            "## Coincidencia de nivel (tier)",
            "",
            f"{tier['aciertos']}/{tier['n']} ({_pct(tier['ratio'])})",
        ]
    )

    ex = metricas["excluded"]
    lineas.extend(
        [
            "",
            "## Excluidos (acierto = derivar_revision_humana)",
            "",
            f"{ex['derivar_ok']}/{ex['n']} ({_pct(ex['ratio'])})",
        ]
    )

    cons = metricas["consistency"]
    lineas.extend(
        [
            "",
            "## Consistencia entre ejecuciones",
            "",
            f"Pares: {cons['pares']}. Criterios identicos: "
            f"{cons['identical']}/{cons['criteria_compared']} ({_pct(cons['ratio'])})",
        ]
    )

    dur = metricas["duration_ms"]
    lineas.extend(
        [
            "",
            "## Tiempo de ejecucion",
            "",
            f"N={dur['n']}. Mediana: {_num(dur['median'])} ms. "
            f"P90: {_num(dur['p90'])} ms.",
        ]
    )

    lineas.extend(["", "## Calibracion por banda de confianza", ""])
    lineas.append("| Banda | N | Aciertos | Accuracy |")
    lineas.append("|---|---:|---:|---:|")
    for banda, datos in metricas["calibration"].items():
        lineas.append(
            f"| {banda} | {datos['n']} | {datos['aciertos']} | "
            f"{_pct(datos['accuracy'])} |"
        )
    lineas.append("")
    return "\n".join(lineas)


def _modo_ejecucion_agregado(modos: list[str]) -> str:
    if not modos:
        return "simulado"
    if len(modos) == 1:
        return modos[0]
    return "mixto"


def metricas_publicas(metricas: dict[str, Any]) -> dict[str, Any]:
    """Solo agregados, sin ids ni datos por caso (publicacion web)."""
    a = metricas["agreement"]
    split = metricas["admissibility_split"]
    tier = metricas["tier_agreement"]
    dur = metricas["duration_ms"]
    cons = metricas["consistency"]

    salida: dict[str, Any] = {
        "fecha": date.today().isoformat(),
        "modoEjecucion": _modo_ejecucion_agregado(metricas.get("modos_ejecucion") or []),
        "totalCasos": metricas["n_scored"],
        "excluidos": metricas["n_excluded"],
        "acuerdoTotal": {
            "aciertos": a["aciertos"],
            "total": metricas["n_scored"],
            "proporcion": a["total"],
        },
        "acuerdoPorClase": {
            c: {"aciertos": a["por_clase"][c]["aciertos"], "total": a["por_clase"][c]["n"]}
            for c in CLASES
        },
        "matrizConfusion": metricas["confusion_matrix"],
        "admisibilidad": {
            "aciertos": split["admissibility_resolved"]["aciertos"],
            "total": split["admissibility_resolved"]["n"],
        },
        "contenido": {
            "aciertos": split["content"]["aciertos"],
            "total": split["content"]["n"],
        },
        "acuerdoNivel": {"aciertos": tier["aciertos"], "total": tier["n"]},
        "duracionMs": {
            "mediana": dur["median"],
            "p90": dur["p90"],
            "min": dur["min"],
            "max": dur["max"],
        },
        "calibracion": {
            banda: {"casos": datos["n"], "aciertos": datos["aciertos"]}
            for banda, datos in metricas["calibration"].items()
        },
    }
    if cons.get("criteria_compared", 0) > 0:
        salida["consistencia"] = {
            "pares": cons["pares"],
            "criteriosComparados": cons["criteria_compared"],
            "identicos": cons["identical"],
            "proporcion": cons["ratio"],
        }
    return salida


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Evalua runs contra el golden set")
    parser.add_argument(
        "--golden",
        default=str(_REPO_ROOT / "data" / "golden-set.jsonl"),
    )
    parser.add_argument(
        "--carpeta",
        default=str(_REPO_ROOT / "runs"),
        help="Carpeta con registro.jsonl y salidas",
    )
    parser.add_argument(
        "--publicar",
        action="store_true",
        help="Escribe web/public/metricas.json (solo agregados, sin casos)",
    )
    args = parser.parse_args(argv)

    golden_path = Path(args.golden)
    if not golden_path.is_file():
        print(
            f"No se encontro el golden set en {golden_path}. "
            "El archivo data/golden-set.jsonl es local y no se versiona; "
            "colocarlo en data/ o indicar --golden PATH.",
            file=sys.stderr,
        )
        sys.exit(1)

    metricas = evaluar(golden_path, Path(args.carpeta))
    out_dir = _REPO_ROOT / "resultados"
    out_dir.mkdir(parents=True, exist_ok=True)

    json_path = out_dir / "metricas.json"
    with json_path.open("w", encoding="utf-8") as fh:
        json.dump(metricas, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    md = _md(metricas)
    (out_dir / "metricas.md").write_text(md, encoding="utf-8")
    print(md)

    if args.publicar:
        pub = metricas_publicas(metricas)
        pub_path = _REPO_ROOT / "web" / "public" / "metricas.json"
        pub_path.parent.mkdir(parents=True, exist_ok=True)
        pub_path.write_text(
            json.dumps(pub, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"\nPublicado: {pub_path.relative_to(_REPO_ROOT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
