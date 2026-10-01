"""Pruebas del agregador y del pipeline sin modelo."""

from __future__ import annotations

from pathlib import Path

from revision.agregar import agregar, agregar_recomendacion
from revision.analizar import CODIGOS_POR_DIMENSION, criterios_insuficientes
from revision.config import cargar_escala
from revision.esquema import Salida
from revision.normalizar import cargar_golden
from revision.registro import revisar

_REPO = Path(__file__).resolve().parents[1]
_GOLDEN = _REPO / "data" / "golden-set.jsonl"


def _criterios_base(overrides: dict[str, str] | None = None) -> list[dict]:
    overrides = overrides or {}
    items = []
    for dimension, codigos in CODIGOS_POR_DIMENSION.items():
        for codigo in codigos:
            level = overrides.get(codigo, "cumple")
            items.append(
                {
                    "code": codigo,
                    "dimension": dimension,
                    "level": level,
                    "evidence": f"evidencia de {codigo}",
                    "file": "src/a.rs",
                    "fragment": "fn main() {}",
                    "line": None,
                }
            )
    return items


def _entrada(truncated: bool = False, requested_amount: int = 50) -> dict:
    return {
        "id": "test:0",
        "requested_amount": requested_amount,
        "context": {"truncated": truncated},
    }


def test_no_admisible_rechaza():
    adm = {"outcome": "no_admisible", "stoppedAt": "CA-002", "conditions": []}
    criterios = criterios_insuficientes("detenido")
    meta = {"tareaCorresponde": True, "dependeInformacionExterna": False}
    out = agregar(adm, {}, criterios, _entrada(), meta)
    assert out["recommendation"]["value"] == "rechazar"
    assert out["recommendation"]["supportingCriteria"] == ["CA-002"]
    assert out["confidence"]["score"] == 1.0
    assert "Resuelto por regla de admisibilidad" in out["confidence"]["reasons"]


def test_cr012_no_cumple_solo_no_rechaza():
    cfg = cargar_escala()
    criterios = _criterios_base({"CR-012": "no_cumple"})
    adm = {"outcome": "admisible", "stoppedAt": None, "conditions": []}
    meta = {
        "tareaCorresponde": True,
        "dependeInformacionExterna": False,
        "suggestedLevel": "medio",
        "suggestedAmount": 50,
    }
    reward = {
        "requestedAmount": 50,
        "requestedLevel": "medio",
        "suggestedLevel": "medio",
        "suggestedAmount": 50,
        "levelMismatch": False,
    }
    confidence = {"score": 1.0, "band": "alto", "supervision": "confirmacion", "reasons": []}
    rec = agregar_recomendacion(adm, criterios, reward, confidence, meta, cfg)
    assert rec["value"] == "aprobar"


def test_alta_no_cumple_rechaza():
    cfg = cargar_escala()
    criterios = _criterios_base({"CR-001": "no_cumple"})
    adm = {"outcome": "admisible", "stoppedAt": None, "conditions": []}
    meta = {"tareaCorresponde": True, "dependeInformacionExterna": False}
    reward = {
        "requestedAmount": 50,
        "requestedLevel": "medio",
        "suggestedLevel": "medio",
        "suggestedAmount": 50,
        "levelMismatch": False,
    }
    confidence = {"score": 1.0, "band": "alto", "supervision": "confirmacion", "reasons": []}
    rec = agregar_recomendacion(adm, criterios, reward, confidence, meta, cfg)
    assert rec["value"] == "rechazar"
    assert "CR-001" in rec["supportingCriteria"]


def test_dependencia_externa_deriva():
    cfg = cargar_escala()
    criterios = _criterios_base()
    adm = {"outcome": "admisible", "stoppedAt": None, "conditions": []}
    meta = {
        "tareaCorresponde": True,
        "dependeInformacionExterna": True,
        "motivoDependencia": "Politica de pagos entre contribuidores",
    }
    reward = {
        "requestedAmount": 50,
        "requestedLevel": "medio",
        "suggestedLevel": "medio",
        "suggestedAmount": 50,
        "levelMismatch": False,
    }
    confidence = {"score": 0.6, "band": "bajo", "supervision": "revision_detallada", "reasons": []}
    rec = agregar_recomendacion(adm, criterios, reward, confidence, meta, cfg)
    assert rec["value"] == "derivar_revision_humana"


def test_level_mismatch_ajusta_monto():
    cfg = cargar_escala()
    criterios = _criterios_base()
    adm = {"outcome": "admisible", "stoppedAt": None, "conditions": []}
    meta = {
        "tareaCorresponde": True,
        "dependeInformacionExterna": False,
        "suggestedLevel": "alto",
        "suggestedAmount": 90,
    }
    reward = {
        "requestedAmount": 30,
        "requestedLevel": "bajo",
        "suggestedLevel": "alto",
        "suggestedAmount": 90,
        "levelMismatch": True,
    }
    confidence = {"score": 1.0, "band": "alto", "supervision": "confirmacion", "reasons": []}
    rec = agregar_recomendacion(adm, criterios, reward, confidence, meta, cfg)
    assert rec["value"] == "ajustar_monto"


def test_revisar_sin_modelo_golden_valida_esquema():
    registros = cargar_golden(_GOLDEN)
    assert len(registros) == 66
    for registro in registros:
        salida = revisar(registro, sin_modelo=True)
        salida.pop("_tokens", None)
        modelo = Salida.model_validate(salida)
        dump = modelo.model_dump(mode="json")
        assert len(dump["criteria"]) == 23
        assert dump["contributionId"] == registro["id"]
        assert dump["admissibility"]["outcome"] in ("admisible", "no_admisible")
        assert dump["confidence"]["supervisionScope"] in (
            "confirmacion",
            "criterios_no_satisfechos",
            "analisis_completo",
        )
        assert dump["execution"]["instructionHash"]
        assert dump["execution"]["entradaHash"]


def test_confianza_baja_con_mismatch_solo_tarea_null_ajusta():
    """Desajuste de nivel no queda oculto por confianza baja solo por tarea no verificable."""
    cfg = cargar_escala()
    criterios = _criterios_base()
    adm = {"outcome": "admisible", "stoppedAt": None, "conditions": []}
    meta = {
        "tareaCorresponde": None,
        "dependeInformacionExterna": False,
        "suggestedLevel": "alto",
        "suggestedAmount": 90,
    }
    reward = {
        "requestedAmount": 30,
        "requestedLevel": "bajo",
        "suggestedLevel": "alto",
        "suggestedAmount": 90,
        "levelMismatch": True,
    }
    confidence = {
        "score": 0.55,
        "band": "bajo",
        "supervision": "revision_detallada",
        "supervisionScope": "analisis_completo",
        "reasons": ["No se pudo comprobar la correspondencia con la tarea"],
    }
    rec = agregar_recomendacion(adm, criterios, reward, confidence, meta, cfg)
    assert rec["value"] == "ajustar_monto"


def test_confianza_baja_sin_mismatch_deriva():
    cfg = cargar_escala()
    criterios = _criterios_base()
    adm = {"outcome": "admisible", "stoppedAt": None, "conditions": []}
    meta = {
        "tareaCorresponde": None,
        "dependeInformacionExterna": False,
        "suggestedLevel": "medio",
        "suggestedAmount": 50,
    }
    reward = {
        "requestedAmount": 50,
        "requestedLevel": "medio",
        "suggestedLevel": "medio",
        "suggestedAmount": 50,
        "levelMismatch": False,
    }
    confidence = {
        "score": 0.55,
        "band": "bajo",
        "supervision": "revision_detallada",
        "supervisionScope": "analisis_completo",
        "reasons": ["No se pudo comprobar la correspondencia con la tarea"],
    }
    rec = agregar_recomendacion(adm, criterios, reward, confidence, meta, cfg)
    assert rec["value"] == "derivar_revision_humana"


def test_dependencia_externa_sigue_antes_que_mismatch_bajo():
    cfg = cargar_escala()
    criterios = _criterios_base()
    adm = {"outcome": "admisible", "stoppedAt": None, "conditions": []}
    meta = {
        "tareaCorresponde": None,
        "dependeInformacionExterna": True,
        "motivoDependencia": "Politica externa",
        "suggestedLevel": "alto",
        "suggestedAmount": 90,
    }
    reward = {
        "requestedAmount": 30,
        "requestedLevel": "bajo",
        "suggestedLevel": "alto",
        "suggestedAmount": 90,
        "levelMismatch": True,
    }
    confidence = {
        "score": 0.2,
        "band": "bajo",
        "supervision": "revision_detallada",
        "supervisionScope": "analisis_completo",
        "reasons": ["Politica externa"],
    }
    rec = agregar_recomendacion(adm, criterios, reward, confidence, meta, cfg)
    assert rec["value"] == "derivar_revision_humana"


def test_alta_no_cumple_sigue_antes_que_mismatch_bajo():
    cfg = cargar_escala()
    criterios = _criterios_base({"CR-001": "no_cumple"})
    adm = {"outcome": "admisible", "stoppedAt": None, "conditions": []}
    meta = {
        "tareaCorresponde": None,
        "dependeInformacionExterna": False,
        "suggestedLevel": "alto",
        "suggestedAmount": 90,
    }
    reward = {
        "requestedAmount": 30,
        "requestedLevel": "bajo",
        "suggestedLevel": "alto",
        "suggestedAmount": 90,
        "levelMismatch": True,
    }
    confidence = {
        "score": 0.55,
        "band": "bajo",
        "supervision": "revision_detallada",
        "supervisionScope": "analisis_completo",
        "reasons": ["No se pudo comprobar la correspondencia con la tarea"],
    }
    rec = agregar_recomendacion(adm, criterios, reward, confidence, meta, cfg)
    assert rec["value"] == "rechazar"


def test_diff_capado_penaliza_confianza_y_limits():
    adm = {"outcome": "admisible", "stoppedAt": None, "conditions": []}
    criterios = _criterios_base()
    meta = {
        "tareaCorresponde": True,
        "dependeInformacionExterna": False,
        "suggestedLevel": "medio",
        "suggestedAmount": 50,
        "diffCapado": True,
    }
    out = agregar(adm, {}, criterios, _entrada(truncated=False), meta)
    assert "Conjunto de diferencias truncado" in out["confidence"]["reasons"]
    assert "Conjunto de diferencias truncado" in out["limits"]
    assert out["confidence"]["score"] < 1.0


def test_monto_bajo_minimo_anota_limits():
    adm = {"outcome": "admisible", "stoppedAt": None, "conditions": []}
    criterios = _criterios_base()
    meta = {
        "tareaCorresponde": True,
        "dependeInformacionExterna": False,
        "suggestedLevel": "bajo",
        "suggestedAmount": 20,
    }
    out = agregar(adm, {}, criterios, _entrada(requested_amount=10), meta)
    assert any("por debajo del minimo" in lim for lim in out["limits"])


def test_supervision_scope_por_banda():
    adm = {"outcome": "admisible", "stoppedAt": None, "conditions": []}
    criterios = _criterios_base()
    meta = {
        "tareaCorresponde": True,
        "dependeInformacionExterna": False,
        "suggestedLevel": "medio",
        "suggestedAmount": 50,
    }
    out = agregar(adm, {}, criterios, _entrada(), meta)
    assert out["confidence"]["band"] == "alto"
    assert out["confidence"]["supervision"] == "confirmacion"
    assert out["confidence"]["supervisionScope"] == "confirmacion"

    meta_bajo = {
        "tareaCorresponde": None,
        "dependeInformacionExterna": True,
        "motivoDependencia": "externa",
        "suggestedLevel": "medio",
        "suggestedAmount": 50,
    }
    out_bajo = agregar(
        adm, {}, criterios, _entrada(truncated=True), meta_bajo
    )
    assert out_bajo["confidence"]["band"] == "bajo"
    assert out_bajo["confidence"]["supervision"] == "revision_detallada"
    assert out_bajo["confidence"]["supervisionScope"] == "analisis_completo"
