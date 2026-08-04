# Cursor — configuración del proyecto

## `.cursor/rules/`

Reglas persistentes para el agente. Archivos `.mdc` con frontmatter:

```yaml
---
description: Qué hace la regla
globs: **/*.ts
alwaysApply: false
---
```

## `.cursor/skills/`

Skills del proyecto (compartidos con quien clone el repo). Cada skill es una carpeta con `SKILL.md`:

```
.cursor/skills/
  deploy-oracle/
    SKILL.md
  xtream-api/
    SKILL.md
```

## `docs/`

Documentación humana del proyecto (no la lee Cursor como skill). Ej.: `docs/self-hosted-proxy.md`.

Los skills **no** van en `docs/skills` — esa ruta no usa Cursor para invocarlos automáticamente.
