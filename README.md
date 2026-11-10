# Sleeve Backend

Servidor de [Sleeve](https://github.com/feis9/sleeve), la red social para coleccionistas de vinilos. Guarda usuarios, sesiones, colecciones, hallazgos y reseñas, y le pide a la API de Discogs los datos y las tapas de los discos. La app (Expo) vive en otro repo y solo le habla a este servidor.

Proyecto de la materia **Programación de Aplicaciones Móviles** (GCO0423), Facultad de Ingeniería y Ciencias Agrarias, UCA.

## Tecnologías

Node.js · Express 5 · Prisma 6 · SQLite · TypeScript (`ts-node-dev` en desarrollo). Es el stack de la Práctica Prisma de la materia.

## Cómo correrlo

Requisitos: Node.js y un token personal de Discogs (https://www.discogs.com/settings/developers → "Generate new token").

```bash
npm install
cp .env.example .env      # y completar DISCOGS_TOKEN
npm run db:init           # crea la base SQLite y carga las cuentas y colecciones de prueba
npm run dev
```

Para comprobarlo: `curl localhost:3000/api/health` tiene que responder `{"ok":true}`.

El `.env` no se sube al repo, porque tiene el token de Discogs. Al repo sube `.env.example`, con las claves y sin valores.

| Variable | Qué es |
| --- | --- |
| `PORT` | Puerto del servidor (3000). La app lo tiene fijo en `utils/api.ts` |
| `DISCOGS_TOKEN` | Token personal de Discogs. Vive solo en el servidor |
| `DATABASE_URL` | Base SQLite. `file:./dev.db` es relativa a `prisma/schema.prisma` |

### Con la app

La app (repo [sleeve](https://github.com/feis9/sleeve)) encuentra al backend con la IP de la computadora donde corre Expo y el puerto 3000. Por eso los dos corren en la misma computadora, el teléfono va en la misma red Wi-Fi y el firewall tiene que dejar entrar conexiones al puerto 3000. Si la app no carga los discos, abrí `http://<IP de la computadora>:3000/api/health` en el navegador del teléfono.

### Base de datos

- `npm run db:init` hace `prisma generate`, `prisma db push` y carga las cuentas de prueba. Se puede repetir: no duplica ni toca las cuentas que ya existen.
- Si `dev.db` es de una versión anterior y el login de las cuentas de prueba da 401 (por ejemplo, porque las contraseñas pasaron a guardarse con hash), borrar `prisma/dev.db` y volver a correr `npm run db:init`.
- Si `db push` se niega por filas viejas en `Edicion` (es la réplica de Discogs, se puede vaciar): `echo 'DELETE FROM "Edicion";' | npx prisma db execute --stdin --schema prisma/schema.prisma`.
- No se usa `prisma migrate dev`.

### Dependencias

`npm audit` da 0 vulnerabilidades. `package.json` fuerza `deepmerge-ts` 8 con `overrides`: Prisma 6 trae la 7, que tiene la falla CVE-2026-40345. Esa dependencia solo la usa la CLI de Prisma para leer `prisma.config.ts`, que el backend no tiene, y la versión 8 se probó con `prisma validate`, `generate` y `db push`. La alternativa que propone `npm audit fix --force` es pasar a Prisma 7, una versión mayor que cambia la configuración.

## Endpoints

Las rutas marcadas "con token" piden el header `Authorization: Bearer <token>`, con el token que devuelven el login y el registro. Las que escriben están en `/api/yo/...` y toman el usuario del token, nunca de la URL. Las lecturas (perfiles, colecciones, reseñas y ranking) son públicas.

| Método | Ruta | Qué hace |
| --- | --- | --- |
| GET | `/api/health` | Prueba de vida: `{"ok":true}` |
| GET | `/api/discogs/barcode/:code` | Ediciones en vinilo con ese código de barras |
| GET | `/api/discogs/releases/:id` | Una edición de Discogs, con su tapa |
| GET | `/api/ediciones?codigo=` | Las ediciones en vinilo con ese código de barras, completas, en una sola respuesta. La búsqueda y cada edición salen de la réplica si tienen menos de 6 horas |
| GET | `/api/ediciones?ids=` | Varias ediciones por número de release (`?ids=1517028,15527003`, hasta 50), en ese orden y en una sola respuesta. Las que no existen se omiten |
| POST | `/api/login` | `{ identifier, password }`: usuario o email. 200 con `{ usuario, token }` o 401 |
| POST | `/api/registro` | `{ username, email, name, password }`. Guarda el hash de la contraseña, nunca la contraseña. 201 con `{ usuario, token }`, 400 o 409 |
| GET | `/api/yo` | Con token: el usuario dueño de la sesión. 401 sin token, con uno inválido o vencido |
| DELETE | `/api/sesion` | Con token: cierra esa sesión (204). Después el token ya no sirve |
| GET | `/api/resenas` | Reseñas con su autor. Filtros opcionales `?releaseId=` y `?usuarioId=` |
| PUT | `/api/yo/resenas/:releaseId` | Con token. `{ rating, body }`: crea o reemplaza tu reseña para esa edición |
| GET | `/api/usuarios/:id` | Perfil público (sin email ni contraseña) |
| GET | `/api/usuarios/:id/coleccion` | Discos de la colección, con dónde se encontró cada uno |
| PUT | `/api/yo/coleccion/:releaseId` | Con token. Agrega el disco a tu colección |
| PUT | `/api/yo/coleccion/:releaseId/hallazgo` | Con token. `{ latitude, longitude, place, date }`: dónde lo encontraste |
| DELETE | `/api/yo/coleccion/:releaseId` | Con token. Saca el disco de tu colección (204) |
| GET | `/api/ranking` | Usuarios ordenados por cantidad de discos |

Un cambio en estas rutas o en lo que devuelven rompe la app. Va con un pull request en cada repo, y se fusiona primero el de este.

### Cuentas de prueba

Las carga `npm run db:init`. Todas usan la contraseña `vinilo123`.

| Usuario | Email |
| --- | --- |
| `lucaf` | luca@sleeve.app |
| `mica.spins` | mica@sleeve.app |
| `tomas_crate` | tomas@sleeve.app |
| `sofi33rpm` | sofi@sleeve.app |
| `juanjazz` | juan@sleeve.app |

## Autenticación

- Las contraseñas se guardan con scrypt y una sal al azar por cuenta (`src/contrasenas.ts`). Ninguna respuesta incluye el hash.
- Login y registro devuelven `{ usuario, token }`. El token son 32 bytes al azar y en la base se guarda solo su SHA-256 (`src/sesiones.ts`). Vence a los 30 días y `DELETE /api/sesion` lo invalida.
- El middleware `requiereSesion` saca el usuario del header `Authorization` y lo deja en `res.locals.usuarioId`.

## Discogs

El servidor le pide a Discogs los datos y las tapas (`src/discogs.ts`) y guarda una réplica de lo que ya consultó, ediciones con su tracklist y búsquedas por código, para no pedir dos veces lo mismo ni pasar el límite de 60 pedidos por minuto. Los términos de uso de Discogs no permiten mostrar datos con más de 6 horas, así que la réplica no devuelve nada de esa antigüedad y `src/purga.ts` lo borra al arrancar y cada 15 minutos. Los pedidos simultáneos a lo mismo salen una sola vez (`src/enCurso.ts`).

This application uses Discogs’ API but is not affiliated with, sponsored or endorsed by Discogs. ‘Discogs’ is a trademark of Zink Media, LLC.

## Estructura

```
src/index.ts          Rutas
src/discogs.ts        Cliente de Discogs y criterio de país
src/ediciones.ts      Réplica de ediciones (vence a las 6 horas)
src/busquedas.ts      Réplica de búsquedas por código
src/enCurso.ts        Pedidos en vuelo: uno solo por cada recurso
src/purga.ts          Borra lo vencido al arrancar y cada 15 minutos
src/contrasenas.ts    Hash de contraseñas
src/sesiones.ts       Token de sesión y requiereSesion
src/usuarios.ts       Validaciones de login y registro
src/seed.ts           Cuentas y colecciones de prueba
prisma/schema.prisma  Modelos
```

## Limitaciones conocidas

- **Sin HTTPS.** La contraseña y el token viajan sin cifrar por la red local. En producción iría HTTPS.
- **Servidor local.** Corre en una computadora del equipo, no hay despliegue.

## Equipo

- Luca Faccennini
- Juan Cruz Gonzalez Montes
