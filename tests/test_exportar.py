"""Pruebas de exportacion web y bloqueo del golden set local."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from revision.exportar import es_ruta_golden_set, exportar_web
from revision.normalizar import cargar_golden
from revision.registro import guardar, revisar

_REPO = Path(__file__).resolve().parents[1]
_CASOS_PRUEBA = _REPO / "data" / "casos-prueba.jsonl"
_DATOS_WEB = _REPO / "web" / "public" / "datos.json"


def test_es_ruta_golden_set():
    assert es_ruta_golden_set("data/golden-set.jsonl")
    assert es_ruta_golden_set(_REPO / "data" / "golden-set.jsonl")
    assert not es_ruta_golden_set("data/casos-demo.jsonl")
    assert not es_ruta_golden_set(_CASOS_PRUEBA)


def test_exportar_web_rechaza_golden_set(tmp_path, capsys):
    dest = tmp_path / "datos.json"
    antes = _DATOS_WEB.read_text(encoding="utf-8") if _DATOS_WEB.is_file() else None

    ruta = exportar_web(
        carpeta_runs=tmp_path,
        casos_path="data/golden-set.jsonl",
        destino=dest,
    )

    assert ruta is None
    assert not dest.exists()
    err = capsys.readouterr().err
    assert "golden-set" in err
    assert "Advertencia" in err

    if antes is not None:
        assert _DATOS_WEB.read_text(encoding="utf-8") == antes


def test_exportar_web_casos_prueba(tmp_path):
    registros = cargar_golden(_CASOS_PRUEBA)
    registro = registros[0]
    salida = revisar(registro, modo="simulado")
    guardar(salida, carpeta=tmp_path)

    dest = tmp_path / "out.json"
    ruta = exportar_web(
        carpeta_runs=tmp_path,
        casos_path=_CASOS_PRUEBA,
        destino=dest,
    )
    assert ruta == dest
    payload = json.loads(dest.read_text(encoding="utf-8"))
    assert isinstance(payload, list)
    assert len(payload) >= 1
    assert "entrada" in payload[0] and "salida" in payload[0]


def test_cli_no_exportar_golden(tmp_path, capsys):
    from revision.cli import main

    golden = _REPO / "data" / "golden-set.jsonl"
    if not golden.is_file():
        pytest.skip("golden set ausente")

    antes = _DATOS_WEB.read_text(encoding="utf-8") if _DATOS_WEB.is_file() else None
    salida_dir = tmp_path / "runs-golden"

    main(
        [
            "--casos",
            str(golden),
            "--id",
            str(cargar_golden(golden)[0]["id"]),
            "--modo",
            "simulado",
            "--no-exportar",
            "--salida",
            str(salida_dir),
        ]
    )
    capsys.readouterr()
    if antes is not None:
        assert _DATOS_WEB.read_text(encoding="utf-8") == antes
