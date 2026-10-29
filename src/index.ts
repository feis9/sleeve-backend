// dotenv carga las variables de backend/.env (PORT, DISCOGS_TOKEN y DATABASE_URL).
import "dotenv/config";

import { Prisma } from "@prisma/client";
import cors from "cors";
import express from "express";

import { ConfigError, DiscogsError, searchByBarcode } from "./discogs";
import { edicionConCache } from "./ediciones";
import { prisma } from "./prisma";
import {
  PERFIL_PUBLICO,
  USUARIO_PUBLICO,
  releaseIdValido,
  validarHallazgo,
  validarLogin,
  validarRegistro,
  validarResena,
} from "./usuarios";

const app = express();
const port = Number(process.env.PORT ?? 3000);

// Se registran antes que las rutas: cors() deja que la app llame desde otro origen
// y express.json() convierte el body JSON en req.body.
app.use(cors());
app.use(express.json());

// Prueba mínima: si responde, Express está vivo. Es lo primero que se prueba cuando algo no anda.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// GET /api/discogs/barcode/:code
// Busca en Discogs las ediciones con ese código. Sin resultados no es un error: devuelve [].
app.get("/api/discogs/barcode/:code", async (req, res) => {
  // Se aceptan espacios y guiones porque así viene impreso en la funda ("6 96998 02071 9").
  const code = req.params.code.replace(/[\s-]/g, "");
  // Entre 8 (EAN-8) y 13 dígitos (EAN-13), los tipos que lee el escáner de la app.
  if (!/^\d{8,13}$/.test(code)) {
    return res.status(400).json({ error: "El código tiene que tener entre 8 y 13 dígitos" });
  }
  try {
    res.json(await searchByBarcode(code));
  } catch (e) {
    // Falta el token o Discogs lo rechaza: es un problema nuestro.
    if (e instanceof ConfigError) return res.status(500).json({ error: e.message });
    // Discogs falló o no respondió (aunque haya respondido 500): 502 dice que el problema está en el servicio de afuera.
    if (e instanceof DiscogsError) return res.status(502).json({ error: e.message });
    res.status(502).json({ error: "No se pudo consultar Discogs" });
  }
});

// GET /api/discogs/releases/:id
// Una edición de Discogs con la forma que usa la app (incluye la tapa en coverUrl).
// Si se consultó hace menos de 6 horas sale de la base y no gasta un pedido de Discogs.
app.get("/api/discogs/releases/:id", async (req, res) => {
  // Mismo criterio que parseId de la práctica: entero positivo o 400.
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "El id no es valido" });
  try {
    res.json(await edicionConCache(id));
  } catch (e) {
    if (e instanceof ConfigError) return res.status(500).json({ error: e.message });
    if (e instanceof DiscogsError && e.status === 404) return res.status(404).json({ error: "No existe en Discogs" });
    res.status(502).json({ error: "No se pudo consultar Discogs" });
  }
});

// POST /api/login  { identifier, password }
// identifier es el usuario o el email, como en la app. Contraseña en texto plano: decisión de alcance.
app.post("/api/login", async (req, res) => {
  const datos = validarLogin(req.body);
  if ("error" in datos) return res.status(400).json({ error: datos.error });
  try {
    const where = datos.identifier.includes("@") ? { email: datos.identifier } : { username: datos.identifier };
    const usuario = await prisma.usuario.findUnique({ where, select: { ...USUARIO_PUBLICO, password: true } });
    // Mismo mensaje si no existe o si la contraseña no coincide: no se revela qué cuentas existen.
    if (!usuario || usuario.password !== datos.password) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }
    const { password: _password, ...publico } = usuario;
    res.json(publico);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// POST /api/registro  { username, email, name, password }
app.post("/api/registro", async (req, res) => {
  const datos = validarRegistro(req.body);
  if ("error" in datos) return res.status(400).json({ error: datos.error });
  try {
    const usuario = await prisma.usuario.create({ data: datos, select: USUARIO_PUBLICO });
    res.status(201).json(usuario);
  } catch (e) {
    // P2002: violación de @unique. El usuario o el email ya están en uso.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return res.status(409).json({ error: "Ese usuario o email ya está registrado" });
    }
    console.error(e);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// Una reseña con su autor (perfil público: sin email ni contraseña), para que la app la muestre
// aunque el autor no esté en su mock.
const RESENA_CON_AUTOR = {
  id: true,
  usuarioId: true,
  releaseId: true,
  rating: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  usuario: { select: PERFIL_PUBLICO },
} as const;

// GET /api/resenas?releaseId=…&usuarioId=…
// Todas las reseñas, de la más reciente a la más vieja. Los dos filtros son opcionales.
app.get("/api/resenas", async (req, res) => {
  const { releaseId, usuarioId } = req.query;
  try {
    const resenas = await prisma.resena.findMany({
      where: {
        ...(typeof releaseId === "string" && { releaseId }),
        ...(typeof usuarioId === "string" && { usuarioId }),
      },
      orderBy: { updatedAt: "desc" },
      select: RESENA_CON_AUTOR,
    });
    res.json(resenas);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// PUT /api/usuarios/:usuarioId/resenas/:releaseId  { rating, body }
// Crea la reseña de ese usuario para esa edición o reemplaza la que había (PUT: el resultado es el mismo
// aunque se mande dos veces). Sin tokens, el usuario viene en la URL: es la misma decisión de alcance del login.
app.put("/api/usuarios/:usuarioId/resenas/:releaseId", async (req, res) => {
  const { usuarioId } = req.params;
  // Mismo criterio que /api/discogs/releases/:id: un número de release válido.
  const releaseId = releaseIdValido(req.params.releaseId);
  if (!releaseId) return res.status(400).json({ error: "El id del disco no es valido" });
  const datos = validarResena(req.body);
  if ("error" in datos) return res.status(400).json({ error: datos.error });
  try {
    const resena = await prisma.resena.upsert({
      where: { usuarioId_releaseId: { usuarioId, releaseId } },
      create: { usuarioId, releaseId, ...datos },
      update: datos,
      select: RESENA_CON_AUTOR,
    });
    res.json(resena);
  } catch (e) {
    // P2003: la clave foránea no apunta a ningún usuario.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return res.status(404).json({ error: "El usuario no existe" });
    }
    console.error(e);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// Un disco de la colección con la forma que usa la app: el hallazgo (tipo Find) o null.
type ItemColeccion = {
  releaseId: string;
  agregadoEn: Date;
  latitude: number | null;
  longitude: number | null;
  place: string | null;
  foundAt: Date | null;
};
function itemParaApp(item: ItemColeccion) {
  const conHallazgo = item.latitude !== null && item.longitude !== null && item.foundAt !== null;
  return {
    releaseId: item.releaseId,
    agregadoEn: item.agregadoEn,
    find: conHallazgo
      ? { latitude: item.latitude, longitude: item.longitude, place: item.place, date: item.foundAt!.toISOString() }
      : null,
  };
}

function errorPrisma(e: unknown, codigo: string) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === codigo;
}

// GET /api/usuarios/:id
// Perfil público de un usuario, para ver el de otro coleccionista.
app.get("/api/usuarios/:id", async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id }, select: PERFIL_PUBLICO });
    if (!usuario) return res.status(404).json({ error: "El usuario no existe" });
    res.json(usuario);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// GET /api/usuarios/:id/coleccion
// Los discos de un usuario, del último que agregó al primero, con dónde los encontró.
app.get("/api/usuarios/:id/coleccion", async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.params.id },
      select: { coleccion: { orderBy: { agregadoEn: "desc" } } },
    });
    if (!usuario) return res.status(404).json({ error: "El usuario no existe" });
    res.json(usuario.coleccion.map(itemParaApp));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// PUT /api/usuarios/:id/coleccion/:releaseId
// Agrega el disco a la colección. Si ya estaba, lo deja como está (PUT: mismo resultado si se repite).
app.put("/api/usuarios/:id/coleccion/:releaseId", async (req, res) => {
  const releaseId = releaseIdValido(req.params.releaseId);
  if (!releaseId) return res.status(400).json({ error: "El id del disco no es valido" });
  const usuarioId = req.params.id;
  try {
    const item = await prisma.coleccionItem.upsert({
      where: { usuarioId_releaseId: { usuarioId, releaseId } },
      create: { usuarioId, releaseId },
      update: {},
    });
    res.json(itemParaApp(item));
  } catch (e) {
    if (errorPrisma(e, "P2003")) return res.status(404).json({ error: "El usuario no existe" });
    console.error(e);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// PUT /api/usuarios/:id/coleccion/:releaseId/hallazgo  { latitude, longitude, place, date }
// Dónde y cuándo encontró el disco. Llega después de agregarlo, cuando responde el GPS.
app.put("/api/usuarios/:id/coleccion/:releaseId/hallazgo", async (req, res) => {
  const releaseId = releaseIdValido(req.params.releaseId);
  if (!releaseId) return res.status(400).json({ error: "El id del disco no es valido" });
  const datos = validarHallazgo(req.body);
  if ("error" in datos) return res.status(400).json({ error: datos.error });
  try {
    const item = await prisma.coleccionItem.update({
      where: { usuarioId_releaseId: { usuarioId: req.params.id, releaseId } },
      data: datos,
    });
    res.json(itemParaApp(item));
  } catch (e) {
    // P2025: no hay registro que actualizar. El disco no está en la colección (o el usuario no existe).
    if (errorPrisma(e, "P2025")) return res.status(404).json({ error: "Ese disco no está en la colección" });
    console.error(e);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// DELETE /api/usuarios/:id/coleccion/:releaseId
// Saca el disco de la colección, y con él dónde se encontró.
app.delete("/api/usuarios/:id/coleccion/:releaseId", async (req, res) => {
  const releaseId = releaseIdValido(req.params.releaseId);
  if (!releaseId) return res.status(400).json({ error: "El id del disco no es valido" });
  try {
    await prisma.coleccionItem.delete({ where: { usuarioId_releaseId: { usuarioId: req.params.id, releaseId } } });
    res.status(204).end();
  } catch (e) {
    if (errorPrisma(e, "P2025")) return res.status(404).json({ error: "Ese disco no está en la colección" });
    console.error(e);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// GET /api/ranking
// Todos los usuarios con la cantidad de discos de su colección, de más a menos.
app.get("/api/ranking", async (_req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: { ...PERFIL_PUBLICO, _count: { select: { coleccion: true } } },
      orderBy: { username: "asc" },
    });
    const ranking = usuarios
      .map(({ _count, ...usuario }) => ({ usuario, discos: _count.coleccion }))
      .sort((a, b) => b.discos - a.discos);
    res.json(ranking);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// Sin host, Node escucha en todas las interfaces de la PC: el teléfono entra por la IP local.
app.listen(port, () => {
  console.log(`API escuchando en el puerto ${port}`);
});
