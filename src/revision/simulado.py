"""Analisis heuristicos deterministas sin modelo de lenguaje."""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

from revision.analizar import (
    CODIGOS_POR_DIMENSION,
    DIMENSIONES,
    postvalidar_criterios,
    redactar_secretos,
    sanitizar_texto_modelo,
)
from revision.clasificar import clasificar_archivo
from revision.config import ConfigEscala, cargar_escala, nivel_para_monto, rango_nivel, umbral_spike

_PREFIJO = "[simulado] "
_RE_TOKEN = re.compile(r"[A-Za-z_][A-Za-z0-9_]{3,}")
_RE_AC_LINEA = re.compile(r"^\s*-\s+(.+)$")
_RE_IMPORT_EXPORT = re.compile(
    r"(?i)^\+\s*(?:import\s+|from\s+\S+\s+import\s+|export\s+(?:\{|default|async|function|const|class|type|enum))"
)
_RE_ERROR_HANDLING = re.compile(
    r"(?i)(\bthrow\b|\bErr\s*\(|\bcatch\b|\bResult\b|if\s*\(\s*!)"
)
_RE_AUTH = re.compile(
    r"(?i)(\bmiddleware\b|\bauth(?:n|z|enticat|oriz)?\b|\brequireAuth\b|\bauthorize\b)"
)
_RE_VALIDACION = re.compile(
    r"(?i)(\bvalidat|\bschema\b|\bzod\b|\bparse\b|\bsafeParse\b)"
)
_RE_MULTI_CAMBIO = re.compile(
    r"(?i)(\by\s+tambien\b|\bademas\b|\balso\b)"
)
_RE_DEPENDENCIA_EXTERNA = re.compile(
    r"(?i)("
    r"repartir(?:se)?|dividir(?:se)?|splitt(?:ing|ed)?|"
    r"recompensa\s+entre|entre\s+(?:tres|varios|dos|\d+)\s+contribu|"
    r"acuerdo\s+(?:de\s+equipo\s+)?fuera|outside\s+(?:this\s+)?pr|"
    r"among\s+contributors"
    r")"
)
_RE_TODO = re.compile(r"\bTODO\b|\bFIXME\b")
_RE_PLACEHOLDER = re.compile(r"(?i)\bplaceholder\b|\blorem\b|\bcoming soon\b")
_DIRS_CONTENEDOR = frozenset({"src", "lib", "packages", "apps", "contracts"})
_DIRS_SKIP_SECRETO = frozenset(
    {"test", "tests", "__tests__", "fixtures", "mocks", "examples"}
)
_TIPOS_SKIP_SECRETO = frozenset({"pruebas", "documentacion", "generado"})
_RE_SECRET_KV_PRECISO = re.compile(
    r"(?i)\b(password|passwd|secret|token|api_key|apikey|private_key|"
    r"client_secret|access_key)\b"
    r"(\s*[:=]\s*)"
    r"(?P<q>[\"'])(?P<val>[^\"']{16,})(?P=q)"
)
_RE_SECRETOS_ALTA_CONF = [
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bghp_[A-Za-z0-9]{36}\b"),
    re.compile(r"\bxox[bp]-"),
    re.compile(r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----"),
    re.compile(r"\bS[A-Z2-7]{55}\b"),
    re.compile(r"demo_FAKE_[A-Za-z0-9_]+"),
]
_PLACEHOLDER_VALOR = (
    "example",
    "ejemplo",
    "changeme",
    "your_",
    "xxx",
    "<",
    "${",
    "process.env",
    "env(",
    "getenv",
    "os.environ",
    "std::env",
    "dotenv",
    "test",
    "dummy",
    "fake",
)


def _tokens(texto: str | None) -> set[str]:
    if not texto:
        return set()
    return {m.group(0).lower() for m in _RE_TOKEN.finditer(texto)}


def _area_archivo(path: str) -> str:
    partes = path.replace("\\", "/").split("/")
    if not partes:
        return path
    if partes[0] in _DIRS_CONTENEDOR and len(partes) >= 2:
        return "/".join(partes[:2])
    return partes[0]


def _parse_diff(
    diff: str,
) -> list[dict[str, Any]]:
    """Lista de archivos con lineas agregadas (texto, numero de linea nueva)."""
    archivos: list[dict[str, Any]] = []
    actual: dict[str, Any] | None = None
    linea_nueva = 0
    for raw in (diff or "").splitlines():
        if raw.startswith("diff --git "):
            m = re.search(r" b/(.+)$", raw)
            path = m.group(1) if m else "unknown"
            actual = {"path": path, "added": []}
            archivos.append(actual)
            linea_nueva = 0
            continue
        if raw.startswith("+++ "):
            if actual and raw[4:] != "/dev/null":
                path = raw[4:]
                if path.startswith("b/"):
                    path = path[2:]
                actual["path"] = path
            continue
        if raw.startswith("@@"):
            m = re.search(r"\+(\d+)", raw)
            linea_nueva = int(m.group(1)) if m else 0
            continue
        if actual is None:
            continue
        if raw.startswith("+") and not raw.startswith("+++"):
            actual["added"].append({"text": raw[1:], "line": linea_nueva, "raw": raw})
            linea_nueva += 1
        elif raw.startswith("-") and not raw.startswith("---"):
            continue
        else:
            # contexto
            if linea_nueva:
                linea_nueva += 1
    return archivos


def _citar(
    archivos: list[dict[str, Any]],
    predicado: Any | None = None,
    keywords: set[str] | None = None,
) -> tuple[str | None, str | None, int | None]:
    """Primer fragmento de hunk que cumple predicado o solapa keywords."""
    for arch in archivos:
        trozos: list[str] = []
        linea0: int | None = None
        for item in arch["added"]:
            texto = item["text"]
            ok = False
            if predicado is not None and predicado(texto, arch["path"]):
                ok = True
            if keywords:
                if _tokens(texto) & keywords or _tokens(arch["path"]) & keywords:
                    ok = True
            if predicado is None and not keywords:
                ok = bool(texto.strip())
            if not ok:
                if trozos:
                    break
                continue
            if linea0 is None:
                linea0 = item["line"]
            trozos.append(texto)
            frag = "\n".join(trozos)
            if len(frag) >= 300:
                frag = frag[:300]
                frag = redactar_secretos(frag) or frag
                return arch["path"], frag, linea0
        if trozos:
            frag = "\n".join(trozos)[:300]
            frag = redactar_secretos(frag) or frag
            return arch["path"], frag, linea0
    return None, None, None


def _criterio(
    codigo: str,
    dimension: str,
    level: str,
    evidence: str,
    file: str | None = None,
    fragment: str | None = None,
    line: int | None = None,
) -> dict[str, Any]:
    ev = evidence if evidence.startswith(_PREFIJO) else _PREFIJO + evidence
    frag = fragment
    if isinstance(frag, str):
        frag = redactar_secretos(frag)
        if len(frag) > 300:
            frag = frag[:300]
    return {
        "code": codigo,
        "dimension": dimension,
        "level": level,
        "evidence": sanitizar_texto_modelo(ev) or ev,
        "file": file,
        "fragment": sanitizar_texto_modelo(frag) if frag else frag,
        "line": line,
    }


def _insuficiente(codigo: str, dimension: str, motivo: str) -> dict[str, Any]:
    return _criterio(
        codigo,
        dimension,
        "evidencia_insuficiente",
        motivo,
        None,
        None,
        None,
    )


def _lineas_aceptacion(issue_body: str | None) -> list[str]:
    lineas: list[str] = []
    for raw in (issue_body or "").splitlines():
        m = _RE_AC_LINEA.match(raw)
        if m:
            lineas.append(m.group(1).strip())
    return lineas


def _haystack_tokens(archivos: list[dict[str, Any]], paths: list[str]) -> set[str]:
    partes = set(_tokens(" ".join(paths)))
    for arch in archivos:
        partes |= _tokens(arch["path"])
        for item in arch["added"]:
            partes |= _tokens(item["text"])
    return partes


def _nivel_sugerido(
    clasificacion: dict[str, Any],
    config: ConfigEscala,
) -> str:
    sim = dict((config.raw or {}).get("simulado") or {})
    vol = clasificacion.get("realVolume") or {}
    additions = int(vol.get("additions") or 0)
    files = int(vol.get("files") or 0)
    lm = int(sim.get("lineas_medio", 150))
    la = int(sim.get("lineas_alto", 400))
    ls = int(sim.get("lineas_spike", 900))
    am = int(sim.get("archivos_medio", 6))
    aa = int(sim.get("archivos_alto", 10))
    as_ = int(sim.get("archivos_spike", 15))

    orden = {"bajo": 0, "medio": 1, "alto": 2, "spike": 3}

    def por_lineas(n: int) -> str:
        if n >= ls:
            return "spike"
        if n >= la:
            return "alto"
        if n >= lm:
            return "medio"
        return "bajo"

    def por_archivos(n: int) -> str:
        if n >= as_:
            return "spike"
        if n >= aa:
            return "alto"
        if n >= am:
            return "medio"
        return "bajo"

    a = por_lineas(additions)
    b = por_archivos(files)
    return a if orden[a] >= orden[b] else b


def _monto_medio_nivel(nivel: str, config: ConfigEscala) -> int:
    rango = rango_nivel(nivel, config)
    if not rango:
        return 30
    lo, hi = rango
    if hi is None:
        return int(umbral_spike(config) + 25)
    return int((lo + hi) // 2)


def _deps_agregadas(archivos: list[dict[str, Any]]) -> list[tuple[str, str, int]]:
    """(nombre, path, line) de dependencias agregadas en package.json / Cargo.toml."""
    hallados: list[tuple[str, str, int]] = []
    for arch in archivos:
        path = arch["path"]
        nombre = path.replace("\\", "/").split("/")[-1]
        if nombre not in ("package.json", "Cargo.toml"):
            continue
        en_deps = False
        for item in arch["added"]:
            texto = item["text"]
            if nombre == "package.json":
                if re.search(r'"(dependencies|devDependencies)"\s*:', texto):
                    en_deps = True
                    continue
                if en_deps and texto.strip().startswith("}"):
                    en_deps = False
                    continue
                if en_deps:
                    m = re.match(
                        r'^\s*"(?P<name>[^"]+)"\s*:\s*"(?P<ver>[^"]+)"\s*,?\s*$',
                        texto,
                    )
                    if m:
                        hallados.append((m.group("name"), path, item["line"]))
            else:
                if texto.strip() == "[dependencies]" or texto.strip().startswith(
                    "[dependencies."
                ):
                    en_deps = True
                    continue
                if en_deps and texto.strip().startswith("["):
                    en_deps = False
                    continue
                if en_deps:
                    m = re.match(
                        r'^\s*(?P<name>[A-Za-z0-9_-]+)\s*=\s*"[^"]+"\s*$',
                        texto,
                    )
                    if m:
                        hallados.append((m.group("name"), path, item["line"]))
    return hallados


def _lineas_anadidas_texto(archivos: list[dict[str, Any]]) -> list[str]:
    return [item["text"] for arch in archivos for item in arch["added"]]


def _bloques_repetidos(lineas: list[str]) -> bool:
    utiles = [ln.strip() for ln in lineas if ln.strip() and not ln.strip().startswith("//")]
    if len(utiles) < 6:
        return False
    cont: dict[str, int] = defaultdict(int)
    for ln in utiles:
        if len(ln) >= 20:
            cont[ln] += 1
            if cont[ln] >= 3:
                return True
    return False


def _analizar_alcance(
    entrada: dict[str, Any],
    clasificacion: dict[str, Any],
    archivos: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    dim = "cumplimiento_alcance"
    ctx = entrada.get("context") or {}
    issue_title = str(ctx.get("linkedIssueTitle") or "")
    issue_body = str(ctx.get("linkedIssueBody") or "")
    title = str(ctx.get("title") or "")
    body = str(ctx.get("body") or "")
    paths = [str(f.get("path") or "") for f in (ctx.get("fileStats") or [])]
    hay = _haystack_tokens(archivos, paths)
    kw_issue = _tokens(issue_title + " " + issue_body)
    overlap = kw_issue & hay
    tarea = bool(overlap)

    file_o, frag_o, line_o = _citar(archivos, keywords=overlap) if overlap else (None, None, None)

    if overlap:
        cr001 = _criterio(
            "CR-001",
            dim,
            "cumple",
            f"Palabras de la tarea solapan con el diff ({', '.join(sorted(overlap)[:8])})",
            file_o,
            frag_o,
            line_o,
        )
        cr003 = _criterio(
            "CR-003",
            dim,
            "cumple",
            f"Afirmaciones de la tarea tienen respaldo lexical en archivos ({len(overlap)} tokens)",
            file_o,
            frag_o,
            line_o,
        )
    else:
        cr001 = _insuficiente(
            "CR-001",
            dim,
            "Sin solape lexical (>=4 chars) entre la tarea vinculada y el diff",
        )
        # Si hay body/issue pero sin solape, no_cumple es mas fiel a CR-001
        if kw_issue and hay:
            file_any, frag_any, line_any = _citar(archivos)
            cr001 = _criterio(
                "CR-001",
                dim,
                "no_cumple",
                "La tarea vinculada no solapa con rutas ni identificadores del diff",
                file_any,
                frag_any,
                line_any,
            )
        cr003 = _insuficiente(
            "CR-003",
            dim,
            "Sin solape lexical entre descripcion de tarea y el diff",
        )
        if kw_issue and hay:
            file_any, frag_any, line_any = _citar(archivos)
            cr003 = _criterio(
                "CR-003",
                dim,
                "no_cumple",
                "Las afirmaciones de la tarea no aparecen en el diff",
                file_any,
                frag_any,
                line_any,
            )

    ac_lineas = _lineas_aceptacion(issue_body)
    if not ac_lineas:
        cr002 = _insuficiente(
            "CR-002",
            dim,
            "La tarea no declara criterios de aceptacion en lineas '- ...'",
        )
    else:
        hits = 0
        primer_hit: tuple[str | None, str | None, int | None] = (None, None, None)
        for linea in ac_lineas:
            tk = _tokens(linea)
            if tk & hay:
                hits += 1
                if primer_hit[0] is None:
                    primer_hit = _citar(archivos, keywords=tk & hay)
        if hits == len(ac_lineas):
            level = "cumple"
            msg = f"Los {hits} criterios de aceptacion tienen respaldo lexical en el diff"
        elif hits > 0:
            level = "cumple_parcialmente"
            msg = f"{hits} de {len(ac_lineas)} criterios de aceptacion tienen respaldo en el diff"
        else:
            level = "no_cumple"
            msg = "Ningun criterio de aceptacion tiene respaldo lexical en el diff"
            primer_hit = _citar(archivos)
        cr002 = _criterio(
            "CR-002",
            dim,
            level,
            msg,
            primer_hit[0],
            primer_hit[1],
            primer_hit[2],
        )

    kw_title = _tokens(title)
    title_hit = kw_title & hay
    if title_hit:
        f_t, fr_t, l_t = _citar(archivos, keywords=title_hit)
        cr004 = _criterio(
            "CR-004",
            dim,
            "cumple",
            f"Palabras del titulo aparecen en el diff ({', '.join(sorted(title_hit)[:6])})",
            f_t,
            fr_t,
            l_t,
        )
    elif title.strip():
        f_t, fr_t, l_t = _citar(archivos)
        cr004 = _criterio(
            "CR-004",
            dim,
            "cumple_parcialmente",
            "El titulo no solapa con identificadores del diff",
            f_t,
            fr_t,
            l_t,
        )
    else:
        cr004 = _insuficiente("CR-004", dim, "Sin titulo de solicitud para comparar")

    def _es_import(_texto: str, _path: str) -> bool:
        return bool(_RE_IMPORT_EXPORT.match("+" + _texto))

    f_i, fr_i, l_i = _citar(archivos, predicado=lambda t, p: _es_import(t, p))
    if f_i:
        cr005 = _criterio(
            "CR-005",
            dim,
            "cumple",
            "Aparece import/export de modulo nuevo en el diff",
            f_i,
            fr_i,
            l_i,
        )
    else:
        cr005 = _insuficiente(
            "CR-005",
            dim,
            "No se observa import/export de un modulo nuevo en lineas agregadas",
        )

    return [cr001, cr002, cr003, cr004, cr005], {"tareaCorresponde": tarea}


def _analizar_calidad(
    entrada: dict[str, Any],
    clasificacion: dict[str, Any],
    archivos: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    dim = "calidad_tecnica"
    ctx = entrada.get("context") or {}
    by_type = clasificacion.get("byType") or {}
    n_pruebas = int(by_type.get("pruebas") or 0)
    paths = [str(f.get("path") or "") for f in (ctx.get("fileStats") or [])]
    hay = _haystack_tokens(archivos, paths)
    kw_issue = _tokens(
        str(ctx.get("linkedIssueTitle") or "")
        + " "
        + str(ctx.get("linkedIssueBody") or "")
    )
    body = str(ctx.get("body") or "")

    pruebas_paths = [
        p
        for p in paths
        if "test" in p.lower() or p.endswith("_test.rs") or ".spec." in p.lower()
    ]
    if n_pruebas > 0 or pruebas_paths:
        f_p = pruebas_paths[0] if pruebas_paths else None
        fr_p = None
        l_p = None
        if f_p:
            f_p, fr_p, l_p = _citar(
                [a for a in archivos if a["path"] == f_p] or archivos,
            )
        cr006 = _criterio(
            "CR-006",
            dim,
            "cumple",
            f"La clasificacion reporta {n_pruebas} archivo(s) de pruebas",
            f_p,
            fr_p,
            l_p,
        )
    else:
        f_any, fr_any, l_any = _citar(archivos)
        cr006 = _criterio(
            "CR-006",
            dim,
            "no_cumple",
            "No hay archivos de pruebas en la clasificacion",
            f_any,
            fr_any,
            l_any,
        )

    if n_pruebas > 0 or pruebas_paths:
        # tokens en archivos de prueba
        prueba_tok: set[str] = set()
        for arch in archivos:
            if "test" in arch["path"].lower() or arch["path"].endswith("_test.rs"):
                prueba_tok |= _tokens(arch["path"])
                for item in arch["added"]:
                    prueba_tok |= _tokens(item["text"])
        if kw_issue & prueba_tok:
            f_t, fr_t, l_t = _citar(
                [a for a in archivos if "test" in a["path"].lower()],
                keywords=kw_issue & prueba_tok,
            )
            cr007 = _criterio(
                "CR-007",
                dim,
                "cumple",
                "Las pruebas mencionan palabras clave de la tarea",
                f_t,
                fr_t,
                l_t,
            )
        else:
            f_t, fr_t, l_t = _citar(
                [a for a in archivos if "test" in a["path"].lower()] or archivos
            )
            cr007 = _criterio(
                "CR-007",
                dim,
                "cumple_parcialmente",
                "Hay pruebas pero no mencionan palabras clave de la tarea",
                f_t,
                fr_t,
                l_t,
            )
    else:
        cr007 = _insuficiente(
            "CR-007",
            dim,
            "Sin pruebas en la entrega; se valora en CR-006",
        )

    def _err(texto: str, _path: str) -> bool:
        return bool(_RE_ERROR_HANDLING.search(texto))

    f_e, fr_e, l_e = _citar(archivos, predicado=_err)
    if f_e:
        cr008 = _criterio(
            "CR-008",
            dim,
            "cumple",
            "El diff agrega manejo de error (throw/Err/catch/Result/if (!...))",
            f_e,
            fr_e,
            l_e,
        )
    else:
        cr008 = _insuficiente(
            "CR-008",
            dim,
            "No se observan senales claras de manejo de error en lineas agregadas",
        )

    cr009 = _insuficiente(
        "CR-009",
        dim,
        "Requiere convenciones del repositorio de destino, no disponibles en el insumo",
    )

    areas: dict[str, set[str]] = defaultdict(set)
    for p in paths:
        if not p:
            continue
        area = _area_archivo(p)
        areas[area] |= _tokens(p)
    areas_utiles = {
        a: t
        for a, t in areas.items()
        if a.split("/")[0] in _DIRS_CONTENEDOR or "/" in a
    }
    if not areas_utiles:
        areas_utiles = areas

    multi = bool(_RE_MULTI_CAMBIO.search(body))
    unrelated = False
    if len(areas_utiles) >= 2:
        lista = list(areas_utiles.items())
        # sin keyword compartida entre pares de areas
        compartidos = set.intersection(*(t for _, t in lista)) if lista else set()
        # tambien: ninguna keyword de issue aparece en 2+ areas
        issue_en_areas = 0
        for _a, toks in lista:
            if kw_issue & toks:
                issue_en_areas += 1
        if not compartidos and issue_en_areas <= 1:
            unrelated = True

    if unrelated and multi:
        f_a, fr_a, l_a = _citar(archivos)
        cr010 = _criterio(
            "CR-010",
            dim,
            "no_cumple",
            f"Archivos en {len(areas_utiles)} areas sin keyword compartida y el body declara varios cambios",
            f_a,
            fr_a,
            l_a,
        )
    else:
        f_a, fr_a, l_a = _citar(archivos)
        cr010 = _criterio(
            "CR-010",
            dim,
            "cumple",
            "No se observa agrupacion de cambios no relacionados con senales de multi-cambio en el body",
            f_a,
            fr_a,
            l_a,
        )

    signals: list[str] = []
    lineas = _lineas_anadidas_texto(archivos)
    n_todo = sum(1 for ln in lineas if _RE_TODO.search(ln))
    if n_todo >= 3:
        signals.append(f"muchas marcas TODO/FIXME ({n_todo})")
    if any(_RE_PLACEHOLDER.search(ln) for ln in lineas):
        signals.append("texto placeholder o lorem en lineas agregadas")
    if _bloques_repetidos(lineas):
        signals.append("bloques de lineas identicas repetidos")

    if len(signals) >= 2:
        level_011 = "no_cumple"
        msg_011 = "Varias senales de generacion automatica sin revision"
    elif len(signals) == 1:
        level_011 = "cumple_parcialmente"
        msg_011 = f"Senal aislada de automatizacion: {signals[0]}"
    else:
        level_011 = "cumple"
        msg_011 = "No se observan senales claras de generacion automatica"
    f_s, fr_s, l_s = _citar(archivos)
    if signals:
        def _sig(texto: str, _p: str) -> bool:
            return bool(_RE_TODO.search(texto) or _RE_PLACEHOLDER.search(texto))

        f2, fr2, l2 = _citar(archivos, predicado=_sig)
        if f2:
            f_s, fr_s, l_s = f2, fr2, l2
    cr011 = _criterio("CR-011", dim, level_011, msg_011, f_s, fr_s, l_s)

    ci = ctx.get("ciConclusion")
    comments = ctx.get("reviewCommentCount")
    try:
        n_comments = int(comments) if comments is not None else 0
    except (TypeError, ValueError):
        n_comments = 0
    evid_ci = f"ciConclusion={ci}; reviewCommentCount={n_comments}"
    f_c, fr_c, l_c = _citar(archivos)
    if ci == "success" and n_comments == 0:
        cr012 = _criterio(
            "CR-012",
            dim,
            "cumple",
            evid_ci,
            f_c,
            fr_c,
            l_c,
        )
    elif ci == "unknown" or ci is None:
        cr012 = _insuficiente("CR-012", dim, evid_ci + " (sin dato de CI)")
    else:
        # failure u otros: nunca no_cumple solo por CI
        cr012 = _criterio(
            "CR-012",
            dim,
            "cumple_parcialmente",
            evid_ci,
            f_c,
            fr_c,
            l_c,
        )

    return (
        [cr006, cr007, cr008, cr009, cr010, cr011, cr012],
        {"automationSignals": signals},
    )


def _ruta_excluida_secreto(path: str) -> bool:
    """Rutas de prueba/doc/generado o directorios de fixtures/ejemplos."""
    if clasificar_archivo(path) in _TIPOS_SKIP_SECRETO:
        return True
    norm = path.replace("\\", "/").lower()
    nombre = norm.rsplit("/", 1)[-1]
    if nombre == ".env.example" or norm.endswith(".env.example"):
        return True
    partes = [p for p in norm.split("/") if p]
    if any(p in _DIRS_SKIP_SECRETO for p in partes):
        return True
    return False


def _es_placeholder_secreto(valor: str) -> bool:
    low = valor.lower()
    return any(m in low for m in _PLACEHOLDER_VALOR)


def _fragmento_cr013(texto: str) -> str:
    """Cita la linea sin exponer el valor del secreto."""
    frag = redactar_secretos(texto) or texto
    for patron in _RE_SECRETOS_ALTA_CONF:
        frag = patron.sub("[valor omitido]", frag)
    frag = _RE_SECRET_KV_PRECISO.sub(
        lambda m: f"{m.group(1)}{m.group(2)}{m.group('q')}[valor omitido]{m.group('q')}",
        frag,
    )
    return frag or "[valor omitido]"


def _secreto_preciso_en_linea(texto: str) -> bool:
    """CR-013: asignacion literal de clave secreta o formato de alta confianza."""
    for patron in _RE_SECRETOS_ALTA_CONF:
        if patron.search(texto):
            return True
    for m in _RE_SECRET_KV_PRECISO.finditer(texto):
        valor = m.group("val")
        if not _es_placeholder_secreto(valor):
            return True
    return False


def _analizar_seguridad(
    entrada: dict[str, Any],
    clasificacion: dict[str, Any],
    archivos: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    dim = "riesgos_seguridad"
    ctx = entrada.get("context") or {}
    issue_txt = (
        str(ctx.get("linkedIssueTitle") or "")
        + " "
        + str(ctx.get("linkedIssueBody") or "")
        + " "
        + str(ctx.get("body") or "")
    )

    secreto_hit: dict[str, Any] | None = None
    for arch in archivos:
        if _ruta_excluida_secreto(arch["path"]):
            continue
        for item in arch["added"]:
            if _secreto_preciso_en_linea(item["text"]):
                secreto_hit = {
                    "path": arch["path"],
                    "line": item["line"],
                    "fragment": _fragmento_cr013(item["text"]),
                }
                break
        if secreto_hit:
            break

    if secreto_hit:
        cr013 = _criterio(
            "CR-013",
            dim,
            "no_cumple",
            f"Posible secreto en linea agregada (valor omitido) en {secreto_hit['path']}:{secreto_hit['line']}",
            secreto_hit["path"],
            secreto_hit["fragment"],
            secreto_hit["line"],
        )
    else:
        f_a, fr_a, l_a = _citar(archivos)
        cr013 = _criterio(
            "CR-013",
            dim,
            "cumple",
            "No se observan patrones de secreto en lineas agregadas",
            f_a,
            fr_a,
            l_a,
        )

    def _auth(texto: str, path: str) -> bool:
        return bool(_RE_AUTH.search(texto) or _RE_AUTH.search(path))

    f_au, fr_au, l_au = _citar(archivos, predicado=_auth)
    if f_au:
        cr014 = _criterio(
            "CR-014",
            dim,
            "cumple",
            "Senal de middleware o comprobacion de autenticacion en el diff",
            f_au,
            fr_au,
            l_au,
        )
    else:
        cr014 = _insuficiente(
            "CR-014",
            dim,
            "Sin senales claras de auth middleware en el diff",
        )

    def _val(texto: str, path: str) -> bool:
        return bool(_RE_VALIDACION.search(texto) or _RE_VALIDACION.search(path))

    f_v, fr_v, l_v = _citar(archivos, predicado=_val)
    if f_v:
        cr015 = _criterio(
            "CR-015",
            dim,
            "cumple",
            "Senal de funcion o esquema de validacion en el diff",
            f_v,
            fr_v,
            l_v,
        )
    else:
        cr015 = _insuficiente(
            "CR-015",
            dim,
            "Sin senales claras de validacion de entrada en el diff",
        )

    cr016 = _insuficiente(
        "CR-016",
        dim,
        "Sin senal clara de control de seguridad conectado a rutas",
    )
    # reutilizar auth como senal debil de conexion
    if f_au:
        cr016 = _criterio(
            "CR-016",
            dim,
            "cumple_parcialmente",
            "Hay middleware/auth pero no se verifica el cableado completo de rutas",
            f_au,
            fr_au,
            l_au,
        )

    deps = _deps_agregadas(archivos)
    if not deps:
        cr017 = _insuficiente(
            "CR-017",
            dim,
            "El cambio no agrega dependencias en package.json/Cargo.toml",
        )
    else:
        ajenas = []
        for name, path, line in deps:
            if name.lower() not in issue_txt.lower():
                ajenas.append((name, path, line))
        name, path, line = deps[0]
        frag = f"{name} (dependencia agregada)"
        if ajenas:
            cr017 = _criterio(
                "CR-017",
                dim,
                "cumple_parcialmente",
                f"Dependencias agregadas no mencionadas en la tarea: {', '.join(a[0] for a in ajenas[:5])}",
                path,
                frag,
                line,
            )
        else:
            cr017 = _criterio(
                "CR-017",
                dim,
                "cumple",
                "Dependencias agregadas mencionadas en la tarea",
                path,
                frag,
                line,
            )

    cr018 = _insuficiente(
        "CR-018",
        dim,
        "Sin senales claras de ampliacion o restriccion de permisos",
    )

    return [cr013, cr014, cr015, cr016, cr017, cr018], {}


def _analizar_proporcionalidad(
    entrada: dict[str, Any],
    clasificacion: dict[str, Any],
    archivos: list[dict[str, Any]],
    config: ConfigEscala,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    dim = "proporcionalidad"
    ctx = entrada.get("context") or {}
    vol = clasificacion.get("realVolume") or {}
    additions = int(vol.get("additions") or 0)
    deletions = int(vol.get("deletions") or 0)
    files = int(vol.get("files") or 0)
    suggested = _nivel_sugerido(clasificacion, config)
    suggested_amount = _monto_medio_nivel(suggested, config)
    requested = entrada.get("requested_amount")
    try:
        requested_i = int(requested or 0)
    except (TypeError, ValueError):
        requested_i = 0
    requested_level = nivel_para_monto(requested_i, config)
    umbral = umbral_spike(config)

    f_a, fr_a, l_a = _citar(archivos)
    cr019 = _criterio(
        "CR-019",
        dim,
        "cumple",
        f"Volumen real: files={files}, additions={additions}, deletions={deletions}",
        f_a,
        fr_a,
        l_a,
    )
    cr020 = _criterio(
        "CR-020",
        dim,
        "cumple",
        f"Nivel heuristicamente sugerido por volumen/archivos: {suggested}",
        f_a,
        fr_a,
        l_a,
    )
    cr021 = _criterio(
        "CR-021",
        dim,
        "cumple",
        f"Dificultad aproximada por umbrales simulado -> {suggested} (monto medio {suggested_amount})",
        f_a,
        fr_a,
        l_a,
    )

    if requested_level is None:
        cr022 = _insuficiente(
            "CR-022",
            dim,
            "No se pudo situar el monto solicitado en la escala",
        )
    elif requested_level == suggested:
        cr022 = _criterio(
            "CR-022",
            dim,
            "cumple",
            f"Monto solicitado ({requested_i}, nivel {requested_level}) coincide con el sugerido ({suggested})",
            f_a,
            fr_a,
            l_a,
        )
    else:
        cr022 = _criterio(
            "CR-022",
            dim,
            "no_cumple",
            f"Monto solicitado ({requested_i}, nivel {requested_level}) distinto del sugerido ({suggested})",
            f_a,
            fr_a,
            l_a,
        )

    if requested_i > umbral:
        if suggested == "spike":
            cr023 = _criterio(
                "CR-023",
                dim,
                "cumple",
                f"Monto {requested_i} supera umbral_spike={umbral} y el volumen sugiere spike",
                f_a,
                fr_a,
                l_a,
            )
        else:
            cr023 = _criterio(
                "CR-023",
                dim,
                "no_cumple",
                f"Monto {requested_i} supera umbral_spike={umbral} pero el volumen sugiere {suggested}",
                f_a,
                fr_a,
                l_a,
            )
    else:
        cr023 = _criterio(
            "CR-023",
            dim,
            "cumple",
            f"Monto {requested_i} no supera umbral_spike={umbral}; CR-023 no fuerza rechazo",
            f_a,
            fr_a,
            l_a,
        )

    texto_dep = (
        str(ctx.get("body") or "")
        + " "
        + str(ctx.get("linkedIssueBody") or "")
        + " "
        + str(ctx.get("linkedIssueTitle") or "")
    )
    depende = bool(_RE_DEPENDENCIA_EXTERNA.search(texto_dep))
    motivo = None
    if depende:
        motivo = (
            "El body o la tarea mencionan repartir/dividir la recompensa "
            "o un acuerdo fuera del PR"
        )

    meta = {
        "suggestedLevel": suggested,
        "suggestedAmount": suggested_amount,
        "dependeInformacionExterna": depende,
        "motivoDependencia": motivo,
    }
    return [cr019, cr020, cr021, cr022, cr023], meta


def analizar_simulado(
    dimension: str,
    entrada: dict[str, Any],
    clasificacion: dict[str, Any],
    previos: list[dict[str, Any]] | None = None,
    config: ConfigEscala | None = None,
) -> tuple[list[dict[str, Any]], dict[str, int], dict[str, Any]]:
    """Valora una dimension con heuristicas. Misma forma que analizar_dimension."""
    del previos  # disponible por compatibilidad de firma; no altera el resultado
    if dimension not in CODIGOS_POR_DIMENSION:
        raise ValueError(f"Dimension desconocida: {dimension}")

    cfg = config or cargar_escala()
    ctx = entrada.get("context") or {}
    diff = ctx.get("diff") or ""
    if not isinstance(diff, str):
        diff = str(diff)
    archivos = _parse_diff(diff)

    meta: dict[str, Any] = {
        "automationSignals": [],
        "tareaCorresponde": None,
        "modelId": "simulado-v1",
        "diffCapado": False,
    }

    if dimension == "cumplimiento_alcance":
        criterios, extra = _analizar_alcance(entrada, clasificacion, archivos)
        meta.update(extra)
    elif dimension == "calidad_tecnica":
        criterios, extra = _analizar_calidad(entrada, clasificacion, archivos)
        meta.update(extra)
    elif dimension == "riesgos_seguridad":
        criterios, extra = _analizar_seguridad(entrada, clasificacion, archivos)
        meta.update(extra)
    else:
        criterios, extra = _analizar_proporcionalidad(
            entrada, clasificacion, archivos, cfg
        )
        meta.update(extra)

    # asegurar 5/7/6/5 criterios en orden
    por_codigo = {c["code"]: c for c in criterios}
    ordenados = [
        por_codigo[c]
        if c in por_codigo
        else _insuficiente(c, dimension, "Criterio no evaluado por la heuristica")
        for c in CODIGOS_POR_DIMENSION[dimension]
    ]
    ordenados = postvalidar_criterios(ordenados, entrada, meta)
    uso = {"input_tokens": 0, "output_tokens": 0}
    return ordenados, uso, meta


def analizar_todas_simulado(
    entrada: dict[str, Any],
    clasificacion: dict[str, Any],
    config: ConfigEscala | None = None,
) -> tuple[list[dict[str, Any]], dict[str, int], dict[str, Any]]:
    """Ejecuta las cuatro dimensiones en modo simulado."""
    cfg = config or cargar_escala()
    todos: list[dict[str, Any]] = []
    tokens = {"input_tokens": 0, "output_tokens": 0}
    meta: dict[str, Any] = {
        "automationSignals": [],
        "tareaCorresponde": None,
        "suggestedLevel": None,
        "suggestedAmount": None,
        "dependeInformacionExterna": False,
        "motivoDependencia": None,
        "modelId": "simulado-v1",
        "diffCapado": False,
    }

    for dimension in DIMENSIONES:
        previos = todos if dimension == "proporcionalidad" else None
        criterios, uso, m = analizar_simulado(
            dimension, entrada, clasificacion, previos=previos, config=cfg
        )
        todos.extend(criterios)
        tokens["input_tokens"] += uso.get("input_tokens", 0)
        tokens["output_tokens"] += uso.get("output_tokens", 0)
        if dimension == "cumplimiento_alcance":
            meta["tareaCorresponde"] = m.get("tareaCorresponde")
        if dimension == "calidad_tecnica":
            meta["automationSignals"] = list(m.get("automationSignals") or [])
        if dimension == "proporcionalidad":
            meta["suggestedLevel"] = m.get("suggestedLevel")
            meta["suggestedAmount"] = m.get("suggestedAmount")
            meta["dependeInformacionExterna"] = bool(
                m.get("dependeInformacionExterna", False)
            )
            meta["motivoDependencia"] = m.get("motivoDependencia")

    todos = postvalidar_criterios(todos, entrada, meta)
    return todos, tokens, meta
