# Revisión asistida GrantFox

Soy Pablo. Este repo es mi prototipo de tesis para GrantFox: ayuda a revisar contribuciones técnicas con reglas fijas y un modelo de lenguaje. No decide nada por sí solo y no se conecta a sistemas productivos.

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

Revisar el golden set local (no publicado) con el modelo:

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

Registrar la decisión humana sobre una recomendación previa:

```bash
revisar --decidir --id DEMO-01 --decision aprobar --monto 60 \
  --justificacion "Coincide con la recomendacion" --revisor REV-01
```

Métricas contra etiquetado humano (solo en local, con el golden set):

```bash
python evaluar.py
```

El golden set no se publica: son decisiones internas. Lo uso solo en local con `evaluar.py`.

## Demo web

La demo es una app React en `web/`. Los datos son casos sintéticos en `data/casos-prueba.jsonl`, con salidas precargadas por el pipeline en `web/public/datos.json`. Está publicada en GitHub Pages: https://pmora3003.github.io/grantfox-revision-asistida/

Para regenerar los datos de la demo:

```bash
revisar --casos data/casos-prueba.jsonl --todos
```

Eso vuelve a correr el pipeline y escribe `web/public/datos.json`. También sirve solo exportar desde `runs/`:

```bash
revisar --exportar-web --casos data/casos-prueba.jsonl
```

Luego hago commit de `web/public/datos.json` si cambió.

Para verla en local:

```bash
cd web && npm install && npm run dev
```

## Pipeline

Leo cada registro, lo normalizo quitando campos de etiquetado, clasifico archivos, evalúo admisibilidad con YAML versionado, y si pasa llamo al modelo por los 23 criterios. Luego agrego recomendación, confianza y prioridad, y guardo en `runs/`.

| Módulo | Rol |
|--------|-----|
| `normalizar` | Entrada limpia desde el archivo de casos |
| `clasificar` | Tipos de archivo y volumen |
| `admisibilidad` | Condiciones CA-001 a CA-005 |
| `analizar` | Criterios CR con el modelo |
| `agregar` | Recompensa, recomendación, confianza |
| `registro` | Orquestación y guardado |
| `exportar` | `web/public/datos.json` para la demo |
| `decision` | Registro de decisión humana |
| `cli` | Comando `revisar` |

## Configuración

`config/escala.yaml` define niveles de recompensa (bajo, medio, alto, spike), umbrales de confianza, severidad por criterio y el nombre del modelo. `config/admisibilidad.yaml` trae la versión de las condiciones de admisibilidad y sus parámetros (por ejemplo mínimo de archivos en CA-002).

La severidad por criterio y la fórmula de prioridad son decisiones propias del proyecto (contexto sección 16): no vienen de un marco externo.

## Resultados

Pendiente de la corrida con el modelo.
