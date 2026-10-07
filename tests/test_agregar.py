"""Pruebas del agregador y del pipeline sin modelo."""

from __future__ import annotations

from pathlib import Path

import pytest

from revision.agregar import agregar, agregar_recomendacion, agregar_reward, _banda_confianza
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


def test_rechazo_directo_no_cumple_rechaza():
    cfg = cargar_escala()
    criterios = _criterios_base({"CR-003": "no_cumple"})
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
    assert "CR-003" in rec["supportingCriteria"]


@pytest.mark.parametrize("codigo", ["CR-001", "CR-011", "CR-014"])
def test_criterio_que_deriva_no_rechaza(codigo):
    cfg = cargar_escala()
    criterios = _criterios_base({codigo: "no_cumple"})
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
    assert rec["value"] == "derivar_revision_humana"
    assert codigo in rec["supportingCriteria"]
    assert codigo in rec["justification"]


def test_rechazo_directo_precede_a_derivacion():
    cfg = cargar_escala()
    criterios = _criterios_base({"CR-001": "no_cumple", "CR-016": "no_cumple"})
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
    assert rec["supportingCriteria"] == ["CR-016"]


def test_cr011_en_severidad_media():
    assert cargar_escala().severidad["CR-011"] == "media"


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


def test_rechazo_directo_sigue_antes_que_mismatch_bajo():
    cfg = cargar_escala()
    criterios = _criterios_base({"CR-003": "no_cumple"})
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
    assert any("por debajo del mínimo" in lim for lim in out["limits"])


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


def test_bandas_confianza_limites():
    conf = cargar_escala().confianza
    assert _banda_confianza(0.86, conf) == "alto"
    assert _banda_confianza(0.85, conf) == "alto"
    assert _banda_confianza(0.84, conf) == "medio"
    assert _banda_confianza(0.60, conf) == "medio"
    assert _banda_confianza(0.59, conf) == "bajo"


def test_no_admisible_sin_monto_sugerido():
    cfg = cargar_escala()
    reward = agregar_reward(90, {}, cfg, {"outcome": "no_admisible", "stoppedAt": "CA-001"})
    assert reward["suggestedLevel"] is None
    assert reward["suggestedAmount"] is None
    assert reward["levelMismatch"] is False
    assert reward["requestedAmount"] == 90


def test_limite_fijo_de_informacion_externa():
    from revision.agregar import LIMITE_INFORMACION_EXTERNA, agregar_limits

    adm = {"outcome": "admisible", "stoppedAt": None, "conditions": []}
    entrada = {"id": "x", "context": {"diff": "", "truncated": False}, "requested_amount": 50}
    limits = agregar_limits(adm, entrada, {"dependeInformacionExterna": False})
    assert LIMITE_INFORMACION_EXTERNA in limits


def test_diff_ordenado_por_tipo_antes_del_tope():
    from revision.analizar import ordenar_diff_por_tipo

    diff = (
        "diff --git a/README_ENTREGA.md b/README_ENTREGA.md\n+doc\n"
        "diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml\n+lock\n"
        "diff --git a/tests/race_test.rs b/tests/race_test.rs\n+prueba\n"
        "diff --git a/src/settlement.rs b/src/settlement.rs\n+codigo"
    )
    orden = [l.split(" b/")[0][len("diff --git a/"):] for l in ordenar_diff_por_tipo(diff).splitlines() if l.startswith("diff --git")]
    assert orden == ["src/settlement.rs", "tests/race_test.rs", "README_ENTREGA.md", "pnpm-lock.yaml"]
