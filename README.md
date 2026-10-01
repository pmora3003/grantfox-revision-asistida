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

## Modos de ejecucion

El pipeline admite tres modos con `--modo`. `auto` es el default: usa el modelo si encuentra `ANTHROPIC_API_KEY` en el entorno o en `.env`, y si no corre el analisis simulado. `real` llama a Anthropic y falla con un error claro si falta la clave. `simulado` aplica reglas heuristicas deterministicas sobre el diff, sin red, y marca la salida con `modoEjecucion: "simulado"` y el modelo `simulado-heuristico`.

La clave solo vive en `.env` local o en el secreto del repositorio en GitHub Actions. Nunca va en el frontend ni en los JSON publicados.

## Cómo lo corro

Revisar el golden set local (no publicado) con el modo automatico:

```bash
revisar --todos
```

Una contribución por id:

```bash
revisar --id "HASH:0"
```

Analisis simulado (sin clave ni llamadas al modelo):

```bash
revisar --todos --modo simulado
```

Forzar el modelo (exige la clave):

```bash
revisar --todos --modo real
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

Agregados publicables para la demo (sin ids ni casos individuales):

```bash
python evaluar.py --carpeta runs-golden --publicar
```

Eso escribe `web/public/metricas.json`. El golden set no se publica: son decisiones internas. Lo uso solo en local con `evaluar.py`. Si corro revisiones sobre `data/golden-set.jsonl`, el export a `web/public/datos.json` se omite con advertencia (o uso `--no-exportar` para silenciar la intencion).

## Demo web

La demo es una app React en `web/`. Publico doce PR reales del conjunto de evaluacion (solo insumos normalizados mas la salida del prototipo en `web/public/datos.json`). Las etiquetas internas del golden set no van al repo ni al sitio. Los casos sinteticos de prueba siguen en `data/casos-prueba.jsonl`; los uso en tests automatizados, no en la demo publicada. GitHub Pages: https://pmora3003.github.io/grantfox-revision-asistida/

Para regenerar la muestra de demo hace falta el golden set local (`data/golden-set.jsonl`, gitignored):

```bash
python scripts/muestra_demo.py
```

Eso escribe `data/casos-demo.jsonl` con ids `PR-01` a `PR-12` y muestra una tabla resumen en consola. Luego corro el pipeline sobre esa muestra:

```bash
revisar --casos data/casos-demo.jsonl --todos --modo simulado
```

Eso vuelve a correr el analisis y escribe `web/public/datos.json`. Sobre el golden set local uso `--no-exportar` para no tocar la demo:

```bash
revisar --casos data/golden-set.jsonl --todos --modo simulado --no-exportar --salida runs-golden
```

Tambien sirve solo exportar desde `runs/`:

```bash
revisar --exportar-web --casos data/casos-demo.jsonl
```

Luego hago commit de `data/casos-demo.jsonl` y de `web/public/datos.json` si cambiaron.

Para verla en local:

```bash
cd web && npm install && npm run dev
```

## Clave en GitHub Pages

El sitio en Pages es estatico. La clave de Anthropic no viaja al navegador ni se embebe en el frontend. Quien administra el repo la guarda como secreto `ANTHROPIC_API_KEY` y el workflow de deploy corre el pipeline con ese valor. Sin el secreto, el deploy publica el analisis simulado.

El dueño del repo la configura asi:

```bash
gh secret set ANTHROPIC_API_KEY -R pmora3003/grantfox-revision-asistida
```

## Pipeline

Leo cada registro, lo normalizo quitando campos de etiquetado, clasifico archivos, evalúo admisibilidad con YAML versionado, y si pasa analizo los 23 criterios (modelo o heuristicas segun el modo). Luego agrego recomendación, confianza y prioridad, y guardo en `runs/`.

| Módulo | Rol |
|--------|-----|
| `normalizar` | Entrada limpia desde el archivo de casos |
| `clasificar` | Tipos de archivo y volumen |
| `admisibilidad` | Condiciones CA-001 a CA-005 |
| `analizar` | Criterios CR con el modelo |
| `simulado` | Criterios CR con heuristicas sin modelo |
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
