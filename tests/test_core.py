"""Pruebas del nucleo deterministico."""

from __future__ import annotations

from pathlib import Path

import pytest

from revision.admisibilidad import evaluar_admisibilidad
from revision.clasificar import clasificar_archivo, clasificar_entrega
from revision.config import (
    CAMPOS_ETIQUETADO,
    cargar_admisibilidad,
    cargar_escala,
    nivel_para_monto,
    umbral_spike,
)
from revision.normalizar import anonimizar_texto, cargar_golden, normalizar

_CAMPOS_CONTEXTO_ESPERADOS = {
    "prUrl",
    "headSha",
    "title",
    "body",
    "merged",
    "state",
    "linkedIssueTitle",
    "linkedIssueBody",
    "diff",
    "truncated",
    "fileStats",
    "ciConclusion",
    "reviewCommentCount",
}

_REPO = Path(__file__).resolve().parents[1]
_GOLDEN = _REPO / "data" / "golden-set.jsonl"


def _claves_recursivas(obj: object, prefijo: str = "") -> set[str]:
    claves: set[str] = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            ruta = f"{prefijo}.{k}" if prefijo else k
            claves.add(ruta)
            claves |= _claves_recursivas(v, ruta)
    elif isinstance(obj, list):
        for item in obj:
            claves |= _claves_recursivas(item, prefijo)
    return claves


def _requiere_golden() -> None:
    if not _GOLDEN.is_file():
        pytest.skip(f"golden set ausente: {_GOLDEN}")


def test_normalizar_no_filtra_etiquetado_en_golden():
    _requiere_golden()
    registros = cargar_golden(_GOLDEN)
    assert len(registros) == 66
    for registro in registros:
        salida = normalizar(registro)
        claves = _claves_recursivas(salida)
        assert CAMPOS_ETIQUETADO.isdisjoint(claves)
        assert set(salida.keys()) == {"id", "context", "requested_amount"}
        assert set(salida["context"].keys()) == _CAMPOS_CONTEXTO_ESPERADOS


def test_normalizar_no_filtra_esperado_sintetico():
    registro = {
        "id": "sintetico:0",
        "esperado": {"recommendation": "aprobar"},
        "expected": {"recommendation": "APPROVE"},
        "note": "no debe filtrarse",
        "context": {
            "title": "PR",
            "body": "fixes #1",
            "merged": True,
            "state": "closed",
            "diff": "diff --git a/a.rs b/a.rs\n",
            "fileStats": [],
        },
        "requested_amount": 40,
    }
    salida = normalizar(registro)
    claves = _claves_recursivas(salida)
    assert "esperado" in CAMPOS_ETIQUETADO
    assert CAMPOS_ETIQUETADO.isdisjoint(claves)
    assert "esperado" not in salida
    assert "expected" not in salida
    assert "note" not in salida


def test_anonimizar_tambien_en_diff():
    stellar = "G" + ("A" * 55)
    eth = "0x" + ("ab" * 20)
    registro = {
        "id": "sintetico:1",
        "context": {
            "title": f"contact me@example.com {stellar}",
            "body": f"wallet {eth}",
            "diff": f"+ email me@example.com\n+ stellar {stellar}\n+ eth {eth}\n",
            "merged": True,
            "state": "closed",
            "fileStats": [],
        },
        "requested_amount": 30,
    }
    salida = normalizar(registro)
    for campo in ("title", "body", "diff"):
        texto = salida["context"][campo]
        assert "me@example.com" not in texto
        assert stellar not in texto
        assert eth not in texto
        assert "[redactado]" in texto
    assert anonimizar_texto(None) is None


def test_admisibilidad_determinista_golden():
    _requiere_golden()
    config = cargar_admisibilidad()
    registros = cargar_golden(_GOLDEN)
    conteo_fallas: dict[str, int] = {
        "CA-001": 0,
        "CA-002": 0,
        "CA-003": 0,
        "CA-004": 0,
    }

    for registro in registros:
        entrada = normalizar(registro)
        clasificacion = clasificar_entrega(entrada["context"].get("fileStats") or [])
        r1 = evaluar_admisibilidad(entrada, clasificacion, config)
        r2 = evaluar_admisibilidad(entrada, clasificacion, config)
        assert r1 == r2

        if r1["stoppedAt"] in conteo_fallas:
            conteo_fallas[r1["stoppedAt"]] += 1

    print("Fallas por condicion de admisibilidad (golden-set):")
    for codigo, total in conteo_fallas.items():
        print(f"  {codigo}: {total}")


def test_clasificar_archivo_casos_fijos():
    assert clasificar_archivo("Cargo.lock") == "generado"
    assert clasificar_archivo("src/lib.rs") == "codigo"
    assert clasificar_archivo("README.md") == "documentacion"
    assert clasificar_archivo(".eslintrc.json") == "configuracion"
    assert clasificar_archivo("tests/foo_test.rs") == "pruebas"


def test_admisibilidad_ca002_cinco_archivos():
    config = cargar_admisibilidad()
    entrada = {
        "id": "prueba:0",
        "context": {
            "merged": True,
            "state": "closed",
            "body": "close #1",
            "linkedIssueTitle": "",
            "fileStats": [{"path": f"src/f{i}.rs", "additions": 1, "deletions": 0} for i in range(5)],
        },
        "requested_amount": 50,
    }
    clasificacion = clasificar_entrega(entrada["context"]["fileStats"])
    resultado = evaluar_admisibilidad(entrada, clasificacion, config)
    assert resultado["outcome"] == "no_admisible"
    assert resultado["stoppedAt"] == "CA-002"
    codigos = [c["code"] for c in resultado["conditions"]]
    assert "CA-003" not in codigos
    assert codigos[-1] == "CA-005"


def test_admisibilidad_ca001_cerrada_sin_fusionar():
    config = cargar_admisibilidad()
    entrada = {
        "id": "prueba:1",
        "context": {
            "merged": False,
            "state": "closed",
            "body": "close #2",
            "linkedIssueTitle": "Tarea",
            "fileStats": [{"path": "src/a.rs", "additions": 10, "deletions": 0}] * 6,
        },
        "requested_amount": 50,
    }
    clasificacion = clasificar_entrega(entrada["context"]["fileStats"])
    resultado = evaluar_admisibilidad(entrada, clasificacion, config)
    assert resultado["stoppedAt"] == "CA-001"
    assert resultado["outcome"] == "no_admisible"


def test_admisibilidad_ca001_merged_requiere_estado():
    config = cargar_admisibilidad()
    entrada = {
        "id": "prueba:1b",
        "context": {
            "merged": True,
            "state": "open",
            "body": "fixes #2",
            "fileStats": [{"path": "src/a.rs", "additions": 10, "deletions": 0}] * 6,
        },
        "requested_amount": 50,
    }
    clasificacion = clasificar_entrega(entrada["context"]["fileStats"])
    resultado = evaluar_admisibilidad(entrada, clasificacion, config)
    assert resultado["stoppedAt"] == "CA-001"


def test_admisibilidad_ca003_solo_docs_y_config():
    config = cargar_admisibilidad()
    paths = [
        {"path": "README.md", "additions": 50, "deletions": 0},
        {"path": "docs/guide.md", "additions": 30, "deletions": 0},
        {"path": "package.json", "additions": 5, "deletions": 1},
        {"path": ".eslintrc.json", "additions": 2, "deletions": 0},
        {"path": "tsconfig.json", "additions": 3, "deletions": 0},
        {"path": "LICENSE", "additions": 1, "deletions": 0},
    ]
    entrada = {
        "id": "prueba:2",
        "context": {
            "merged": True,
            "state": "closed",
            "body": "fixes #9",
            "linkedIssueTitle": "",
            "fileStats": paths,
        },
        "requested_amount": 40,
    }
    clasificacion = clasificar_entrega(paths)
    resultado = evaluar_admisibilidad(entrada, clasificacion, config)
    assert resultado["stoppedAt"] == "CA-003"
    assert clasificacion["byType"]["codigo"] == 0
    assert clasificacion["byType"]["pruebas"] == 0


def test_admisibilidad_ca003_solo_pruebas_no_cuenta():
    config = cargar_admisibilidad()
    paths = [{"path": f"tests/t{i}_test.rs", "additions": 5, "deletions": 0} for i in range(6)]
    entrada = {
        "id": "prueba:2b",
        "context": {
            "merged": True,
            "state": "merged",
            "body": "closes #3",
            "fileStats": paths,
        },
        "requested_amount": 40,
    }
    clasificacion = clasificar_entrega(paths)
    resultado = evaluar_admisibilidad(entrada, clasificacion, config)
    assert clasificacion["byType"]["codigo"] == 0
    assert clasificacion["byType"]["pruebas"] >= 1
    assert resultado["stoppedAt"] == "CA-003"


def test_admisibilidad_ca004_sin_fallback_linked_title():
    config = cargar_admisibilidad()
    paths = [{"path": f"src/f{i}.rs", "additions": 1, "deletions": 0} for i in range(6)]
    entrada = {
        "id": "prueba:3",
        "context": {
            "merged": True,
            "state": "closed",
            "body": "Actualiza el contrato sin mencionar tarea",
            "linkedIssueTitle": "Tarea real en plataforma",
            "fileStats": paths,
        },
        "requested_amount": 50,
    }
    clasificacion = clasificar_entrega(paths)
    resultado = evaluar_admisibilidad(entrada, clasificacion, config)
    assert resultado["stoppedAt"] == "CA-004"


def test_admisibilidad_ca004_hash_suelto_con_prefijo():
    config = cargar_admisibilidad()
    paths = [{"path": f"src/f{i}.rs", "additions": 1, "deletions": 0} for i in range(6)]
    for body in ("related #12", "issue #12", "refs #12", "org/repo#12", "Fixes #12"):
        entrada = {
            "id": "prueba:4",
            "context": {
                "merged": True,
                "state": "closed",
                "body": body,
                "fileStats": paths,
            },
            "requested_amount": 50,
        }
        clasificacion = clasificar_entrega(paths)
        resultado = evaluar_admisibilidad(entrada, clasificacion, config)
        assert resultado["outcome"] == "admisible", body


def test_admisibilidad_ca004_hash_suelto_sin_prefijo():
    config = cargar_admisibilidad()
    paths = [{"path": f"src/f{i}.rs", "additions": 1, "deletions": 0} for i in range(6)]
    entrada = {
        "id": "prueba:5",
        "context": {
            "merged": True,
            "state": "closed",
            "body": "Mejora el modulo #12 sin palabra de enlace",
            "fileStats": paths,
        },
        "requested_amount": 50,
    }
    clasificacion = clasificar_entrega(paths)
    resultado = evaluar_admisibilidad(entrada, clasificacion, config)
    assert resultado["stoppedAt"] == "CA-004"


def test_config_nivel_para_monto():
    escala = cargar_escala()
    assert nivel_para_monto(30, escala) == "bajo"
    assert nivel_para_monto(101, escala) == "spike"
    assert nivel_para_monto(200, escala) == "spike"
    assert nivel_para_monto(10, escala) == "bajo"
    assert umbral_spike(escala) == 100
    assert escala.techo_observado == 150
    spike = next(n for n in escala.niveles if n.nombre == "spike")
    assert spike.maximo is None
