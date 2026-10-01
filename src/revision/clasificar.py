"""Clasificacion de archivos del conjunto de diferencias."""

from __future__ import annotations

import os
from typing import Any

TipoArchivo = str  # codigo | pruebas | documentacion | generado | configuracion

_LOCKFILES = frozenset(
    {
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "Cargo.lock",
        "poetry.lock",
        "Gemfile.lock",
        "go.sum",
        "composer.lock",
        "bun.lockb",
    }
)

_SOURCE_EXTENSIONS = frozenset(
    {
        ".rs",
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".py",
        ".go",
        ".sol",
        ".java",
        ".kt",
        ".swift",
        ".c",
        ".cpp",
        ".h",
        ".cs",
        ".rb",
        ".php",
        ".vue",
        ".svelte",
        ".move",
        ".css",
        ".scss",
        ".html",
        ".sql",
        ".sh",
    }
)

_DOC_EXTENSIONS = frozenset({".md", ".mdx", ".rst", ".txt", ".adoc"})
_CONFIG_EXTENSIONS = frozenset({".json", ".yaml", ".yml", ".toml", ".ini", ".cfg"})


def _nombre_archivo(path: str) -> str:
    return path.replace("\\", "/").split("/")[-1]


def _extension(path: str) -> str:
    _, ext = os.path.splitext(path.replace("\\", "/"))
    return ext.lower()


def _es_generado(path: str) -> bool:
    norm = path.replace("\\", "/")
    lower = norm.lower()
    nombre = _nombre_archivo(norm)

    if nombre in _LOCKFILES:
        return True
    if lower.endswith(".min.js") or lower.endswith(".map"):
        return True
    if "/dist/" in lower or lower.startswith("dist/"):
        return True
    if "/build/" in lower or lower.startswith("build/"):
        return True
    if "__snapshots__" in lower or lower.endswith(".snap"):
        return True
    if "/snapshots/" in lower or lower.startswith("snapshots/"):
        return True
    if "/test_snapshots/" in lower or lower.startswith("test_snapshots/"):
        return True
    if lower.endswith(".json") and (
        "/test_snapshots/" in lower or lower.startswith("test_snapshots/")
    ):
        return True
    if "/generated/" in lower or lower.startswith("generated/"):
        return True
    return False


def _es_pruebas(path: str) -> bool:
    norm = path.replace("\\", "/")
    lower = norm.lower()
    nombre = _nombre_archivo(lower)

    if "/test/" in lower or "/tests/" in lower:
        return True
    if "/__tests__/" in lower or lower.startswith("__tests__/"):
        return True
    if "_test." in lower or lower.endswith("_test.py") or lower.endswith("_test.rs"):
        return True
    if ".test." in lower or ".spec." in lower:
        return True
    if nombre.startswith("test_") and nombre.endswith(".py"):
        return True
    if nombre.endswith("tests.rs"):
        return True
    return False


def _es_documentacion(path: str) -> bool:
    norm = path.replace("\\", "/")
    lower = norm.lower()
    nombre = _nombre_archivo(lower)

    if _extension(path) in _DOC_EXTENSIONS:
        return True
    if "/docs/" in lower or lower.startswith("docs/"):
        return True
    if nombre in ("license", "changelog", "todo", "license.md", "changelog.md", "todo.md"):
        return True
    if nombre.startswith("license") or nombre.startswith("changelog") or nombre.startswith("todo"):
        if _extension(path) in _DOC_EXTENSIONS or "." not in nombre:
            return True
    upper_names = {nombre.upper(), nombre}
    if nombre in ("LICENSE", "CHANGELOG", "TODO") or upper_names & {"LICENSE", "CHANGELOG", "TODO"}:
        return True
    if nombre.lower() in ("license", "changelog", "todo"):
        return True
    return False


def _es_configuracion(path: str) -> bool:
    norm = path.replace("\\", "/")
    lower = norm.lower()
    nombre = _nombre_archivo(lower)
    ext = _extension(path)

    if ext in _CONFIG_EXTENSIONS:
        return True
    if nombre == ".env.example" or lower.endswith(".env.example"):
        return True
    if nombre.startswith(".") and nombre not in (".", ".."):
        return True
    for prefijo in (".eslintrc", ".prettierrc", ".gitignore", ".editorconfig"):
        if nombre.startswith(prefijo):
            return True
    if nombre.lower() in ("dockerfile", "makefile"):
        return True
    if nombre.endswith(".config.js") or nombre.endswith(".config.ts"):
        return True
    if nombre.endswith(".config.mjs") or nombre.endswith(".config.cjs"):
        return True
    if nombre == "Cargo.toml" or nombre == "package.json":
        return True
    if nombre.startswith("tsconfig") and ext == ".json":
        return True
    if "/.github/" in lower or lower.startswith(".github/"):
        return True
    if ext == "" and not _es_pruebas(path):
        return True
    return False


def clasificar_archivo(path: str) -> TipoArchivo:
    """Clasifica una ruta en uno de los cinco tipos."""
    if _es_generado(path):
        return "generado"
    if _es_pruebas(path):
        return "pruebas"
    if _es_documentacion(path):
        return "documentacion"
    if _es_configuracion(path):
        return "configuracion"
    if _extension(path) in _SOURCE_EXTENSIONS:
        return "codigo"
    return "configuracion"


def clasificar_entrega(file_stats: list[dict[str, Any]]) -> dict[str, Any]:
    """Resume tipos, volumen real y rutas excluidas del volumen."""
    por_archivo: list[dict[str, str]] = []
    conteos = {
        "codigo": 0,
        "pruebas": 0,
        "documentacion": 0,
        "generado": 0,
        "configuracion": 0,
    }
    real_files = 0
    real_additions = 0
    real_deletions = 0
    excluded: list[str] = []

    for item in file_stats or []:
        ruta = str(item.get("path", ""))
        tipo = clasificar_archivo(ruta)
        por_archivo.append({"path": ruta, "tipo": tipo})
        conteos[tipo] += 1

        if tipo in ("codigo", "pruebas", "configuracion"):
            real_files += 1
            real_additions += int(item.get("additions") or 0)
            real_deletions += int(item.get("deletions") or 0)
        elif tipo in ("generado", "documentacion"):
            excluded.append(ruta)

    return {
        "byType": conteos,
        "realVolume": {
            "files": real_files,
            "additions": real_additions,
            "deletions": real_deletions,
        },
        "excludedFromVolume": excluded,
        "porArchivo": por_archivo,
    }
