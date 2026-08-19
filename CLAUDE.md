# pfg-backend

API de un sistema de gestion de personal/cursos para un proyecto de tesis de grado (UCU). Stack: NestJS + Prisma (PostgreSQL) + TypeScript.

## Estructura

Cada feature vive en `backend/src/features/<nombre>/` (kebab-case, dominio en **español**: `cursos`, `usuarios`, `subalternos`, `auth`, `auditoria`, etc.) con `<nombre>.module.ts`, `<nombre>.controller.ts`, `<nombre>.service.ts`, `<nombre>.service.spec.ts` y una carpeta `dto/`. No hay capa de repository: los services inyectan `PrismaService` (`src/lib/prisma.service.ts`) y llaman a Prisma directo.

## Convenciones clave

- DTOs con `class-validator` + `class-transformer` + `@nestjs/swagger` en la misma clase. Nombres: `CreateXDto`, `UpdateXDto`, `XDto`, `ListXQueryDto`.
- Todos los endpoints estan protegidos por defecto (`JwtAuthGuard` + `PermissionsGuard` globales). Usar `@Public()` para desprotegerlos o `@RequirePermissions('entidad.verbo')` para requerir permiso especifico.
- Respuestas envueltas automaticamente por `ServiceResponseInterceptor` en `{ service_response: { service_status, service_data } }` — el controller/service devuelve el dato "crudo", no lo envuelvas a mano.
- Errores: usar las excepciones estandar de Nest (`NotFoundException`, `ConflictException`, etc.), no crear excepciones custom. El filtro global las transforma automaticamente.
- IDs son `BigInt` en Prisma; no convertirlos a string a mano, el interceptor ya lo hace.
- Tests con Jest, un `.service.spec.ts` por service, mockeando `PrismaService` a mano con factories (`makeX()`).

## Comandos

- Build: `npm run build`
- Tests: `npm run test`
- Dev: `npm run start:dev`

## Spec Driven Development

Este repo forma parte de un flujo de SDD junto con `pfg-frontend`, orquestado desde la carpeta raiz `Tesis-UCU` (ver `../specs/README.md` y `../.claude/skills/run-spec-workflow`). Los skills de este repo son:

- `.claude/skills/implement-backend-spec` — implementa una spec siguiendo estas convenciones.
- `.claude/skills/write-backend-tests` — genera tests siguiendo el patron existente.

Antes de implementar algo nuevo a mano, revisar si corresponde usar esos skills.
