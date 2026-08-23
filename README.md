# Vecino Centinela

Plataforma web de seguridad y organización comunitaria para vecinos, líderes y un súper administrador.

## Estado actual

Base inicial del monorepo creada con:
- Backend FastAPI.
- Frontend Next.js + TypeScript.
- Docker Compose para PostgreSQL, Redis, API y web.
- Modelos iniciales, autenticación y seed de desarrollo.

## Arquitectura

- `apps/api`: FastAPI, SQLAlchemy, Alembic.
- `apps/web`: Next.js, TypeScript, Tailwind CSS.
- `packages/ui`: componentes compartidos.
- `packages/config`: configuración compartida.
- `packages/types`: tipos compartidos.
- `infra`: Docker, Nginx y scripts.

## Roles

- Súper administrador: acceso total.
- Líder: administra un vecindario o sector.
- Centinela: vecino normal con reportes y consulta.

## Instalación local

1. Copia `.env.example` a `.env`.
2. Levanta la base:
   ```bash
   docker compose up -d postgres redis
   ```
3. Instala dependencias del backend y frontend.
4. Ejecuta migraciones y seed.

## Docker

```bash
docker compose up -d
docker compose logs -f
docker compose down
```

## Próximos pasos

- Completar CRUDs y permisos.
- Añadir auditoría avanzada.
- Integrar mapa comunitario.
- Mejorar dashboards por rol.

