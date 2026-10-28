// dotenv carga las variables de backend/.env (PORT, DISCOGS_TOKEN y DATABASE_URL).
import "dotenv/config";

import { Prisma } from "@prisma/client";
import cors from "cors";
import express from "express";

import { ConfigError, DiscogsError, searchByBarcode } from "./discogs";
import { edicionConCache } from "./ediciones";
import { prisma } from "./prisma";
import { USUARIO_PUBLICO, validarLogin, validarRegistro } from "./usuarios";

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

// Sin host, Node escucha en todas las interfaces de la PC: el teléfono entra por la IP local.
app.listen(port, () => {
  console.log(`API escuchando en el puerto ${port}`);
});
