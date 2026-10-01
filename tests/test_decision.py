"""Pruebas del registro de decision humana (RF16 / RG-02 / RG-03)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from revision.decision import registrar_decision


def _preparar_run(carpeta: Path, contribution_id: str, recomendacion: str, monto: int) -> None:
    salida = {
        "contributionId": contribution_id,
        "recommendation": {"value": recomendacion},
        "reward": {"requestedAmount": monto},
    }
    archivo = carpeta / f"{contribution_id.replace(':', '_')}.json"
    archivo.write_text(json.dumps(salida, ensure_ascii=False), encoding="utf-8")
    registro = {
        "contributionId": contribution_id,
        "executedAt": "2026-09-30T12:00:00Z",
        "archivo": str(archivo),
        "recommendation": recomendacion,
    }
    with (carpeta / "registro.jsonl").open("w", encoding="utf-8") as fh:
        fh.write(json.dumps(registro, ensure_ascii=False) + "\n")


def test_registrar_decision_coincide(tmp_path: Path):
    cid = "contrib:1"
    _preparar_run(tmp_path, cid, "aprobar", 60)
    reg = registrar_decision(
        contributionId=cid,
        decisionFinal="aprobar",
        montoAprobado=60,
        justificacion="Coincide con la recomendacion",
        revisor="REV-01",
        carpeta=tmp_path,
    )
    assert reg["recomendacionEmitida"] == "aprobar"
    assert reg["decisionFinal"] == "aprobar"
    assert reg["montoPropuesto"] == 60
    assert reg["montoAprobado"] == 60
    assert reg["diferenciaMonto"] == 0
    assert reg["coincideConRecomendacion"] is True
    assert reg["revisor"] == "REV-01"
    assert "registradoEn" in reg

    lineas = (tmp_path / "decisiones.jsonl").read_text(encoding="utf-8").strip().splitlines()
    assert len(lineas) == 1
    guardado = json.loads(lineas[0])
    assert guardado["contributionId"] == cid
    assert guardado["justificacion"] == "Coincide con la recomendacion"


def test_registrar_decision_ajusta_monto(tmp_path: Path):
    cid = "contrib:2"
    _preparar_run(tmp_path, cid, "aprobar", 80)
    reg = registrar_decision(
        contributionId=cid,
        decisionFinal="ajustar_monto",
        montoAprobado=50,
        justificacion="Monto alto para el alcance",
        revisor="ADM-12",
        carpeta=tmp_path,
    )
    assert reg["coincideConRecomendacion"] is False
    assert reg["diferenciaMonto"] == -30
    assert reg["montoAprobado"] == 50


def test_registrar_decision_revisor_invalido(tmp_path: Path):
    cid = "contrib:3"
    _preparar_run(tmp_path, cid, "rechazar", 40)
    with pytest.raises(ValueError, match="revisor invalido"):
        registrar_decision(
            contributionId=cid,
            decisionFinal="rechazar",
            montoAprobado=0,
            justificacion="Sin codigo",
            revisor="Ana Perez",
            carpeta=tmp_path,
        )


def test_registrar_decision_sin_run(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        registrar_decision(
            contributionId="inexistente:0",
            decisionFinal="aprobar",
            montoAprobado=20,
            justificacion="Sin historial",
            revisor="REV-01",
            carpeta=tmp_path,
        )


def test_registrar_decision_valor_invalido(tmp_path: Path):
    cid = "contrib:4"
    _preparar_run(tmp_path, cid, "aprobar", 40)
    with pytest.raises(ValueError, match="decisionFinal invalida"):
        registrar_decision(
            contributionId=cid,
            decisionFinal="maybe",
            montoAprobado=40,
            justificacion="Valor no permitido",
            revisor="REV-01",
            carpeta=tmp_path,
        )
