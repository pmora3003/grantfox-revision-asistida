"""Pruebas del modo simulado sobre data/casos-prueba.jsonl (sin API)."""

from __future__ import annotations

import json
from pathlib import Path

from revision.normalizar import cargar_golden
from revision.registro import revisar
from revision.simulado import _secreto_preciso_en_linea, _ruta_excluida_secreto

_REPO = Path(__file__).resolve().parents[1]
_CASOS = _REPO / "data" / "casos-prueba.jsonl"
_FAKE_KEY = "demo_FAKE_0000000000000000000000000000"
_STELLAR_G = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW"


def test_revisar_casos_prueba_modo_simulado(capsys):
    registros = cargar_golden(_CASOS)
    assert len(registros) >= 8
    por_id = {r["id"]: r for r in registros}

    salidas: dict[str, dict] = {}
    for registro in registros:
        salida = revisar(registro, modo="simulado")
        salida.pop("_tokens", None)
        salidas[salida["contributionId"]] = salida

        assert len(salida["criteria"]) == 23
        assert salida["modoEjecucion"] == "simulado"
        assert salida["model"]["name"] == "simulado-heuristico"
        assert salida["model"]["version"] == "simulado-v1"

    demo05 = salidas["DEMO-05"]
    cr013 = next(c for c in demo05["criteria"] if c["code"] == "CR-013")
    assert cr013["level"] == "no_cumple"
    dump05 = json.dumps(demo05, ensure_ascii=False)
    assert _FAKE_KEY not in dump05
    assert "0000000000000000000000000000" not in dump05

    assert salidas["DEMO-07"]["recommendation"]["value"] == "derivar_revision_humana"
    assert salidas["DEMO-04"]["recommendation"]["value"] == "rechazar"
    assert salidas["DEMO-04"]["admissibility"]["stoppedAt"] == "CA-003"
    assert salidas["DEMO-08"]["recommendation"]["value"] == "rechazar"
    assert salidas["DEMO-08"]["admissibility"]["stoppedAt"] == "CA-002"
    assert salidas["DEMO-02"]["recommendation"]["value"] != "rechazar"

    # Tabla informativa: recomendacion vs etiqueta (no se aserta igualdad total)
    print("")
    print(f"{'caso':<10} {'obtenido':<28} {'esperado':<28}")
    for cid in sorted(salidas):
        rec = salidas[cid]["recommendation"]["value"]
        esperado = (por_id[cid].get("esperado") or {}).get("recomendacion", "?")
        marca = "ok" if rec == esperado else "diff"
        print(f"{cid:<10} {rec:<28} {esperado:<28} {marca}")

    captured = capsys.readouterr()
    assert "DEMO-01" in captured.out
    assert "esperado" in captured.out


def test_cr013_no_dispara_por_clave_publica_ni_token_en_pruebas():
    assert len(_STELLAR_G) == 56
    assert _STELLAR_G.startswith("G")
    assert not _secreto_preciso_en_linea(f'const pub = "{_STELLAR_G}";')
    assert not _secreto_preciso_en_linea(
        'const tokenType = "bearer-token-type-value";'
    )
    assert _ruta_excluida_secreto("tests/auth_token.test.ts")
    assert _ruta_excluida_secreto("src/__tests__/session.spec.ts")
    assert _ruta_excluida_secreto("fixtures/secrets.env")
    assert _ruta_excluida_secreto(".env.example")
    assert not _ruta_excluida_secreto("src/webhooks/payment.ts")
    assert _secreto_preciso_en_linea(f'const API_KEY = "{_FAKE_KEY}";')
