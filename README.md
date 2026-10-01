# Revisión asistida GrantFox

Soy Pablo. Este repo es mi prototipo de tesis para GrantFox: ayuda a revisar contribuciones técnicas con reglas fijas y un modelo de lenguaje. No decide nada por sí solo y no se conecta a sistemas productivos. Solo lee un golden set local y escribe salidas en JSON.

## Instalación

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

La clave de Anthropic va en `.env` en la raíz del repo, nunca la subo al git:

```
ANTHROPIC_API_KEY=...
```

## Cómo lo corro

Revisar todo el golden set con el modelo:

```bash
revisar --todos
```

Una contribución por id:

```bash
revisar --id "HASH:0"
```

Sin llamadas al modelo (útil para pruebas rápidas):

```bash
revisar --todos --sin-modelo
```

Regenerar la UI desde `runs/`:

```bash
revisar --exportar-ui
```

Métricas contra etiquetado humano:

```bash
python evaluar.py
```

Ver resultados en el navegador (archivo local, sin servidor):

```bash
open ui/index.html
```

Cada corrida de `revisar` termina exportando `ui/datos.js`.

## Pipeline

Leo cada registro del golden set, lo normalizo quitando campos de etiquetado, clasifico archivos, evalúo admisibilidad con YAML versionado, y si pasa llamo al modelo por los 23 criterios. Luego agrego recomendación, confianza y prioridad, guardo en `runs/` y exporto para la UI.

| Módulo | Rol |
|--------|-----|
| `normalizar` | Entrada limpia desde golden set |
| `clasificar` | Tipos de archivo y volumen |
| `admisibilidad` | Condiciones CA-001 a CA-005 |
| `analizar` | Criterios CR con el modelo |
| `agregar` | Recompensa, recomendación, confianza |
| `registro` | Orquestación y guardado |
| `exportar` | `ui/datos.js` para la UI |
| `cli` | Comando `revisar` |

## Configuración

`config/escala.yaml` define niveles de recompensa (bajo, medio, alto, spike), umbrales de confianza y el nombre del modelo. `config/admisibilidad.yaml` trae la versión de las condiciones de admisibilidad y sus parámetros (por ejemplo mínimo de archivos en CA-002).

## Resultados

Pendiente de la corrida con el modelo.
