// dotenv carga las variables de backend/.env (PORT y DISCOGS_TOKEN).
import "dotenv/config";

import cors from "cors";
import express from "express";

import { DiscogsError, getRelease, searchByBarcode } from "./discogs";

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
    // Falta el token: es un problema nuestro.
    if (e instanceof DiscogsError && e.status === 500) return res.status(500).json({ error: e.message });
    // Discogs falló o no respondió: 502 dice que el problema está en el servicio de afuera.
    if (e instanceof DiscogsError) return res.status(502).json({ error: e.message });
    res.status(502).json({ error: "No se pudo consultar Discogs" });
  }
});

// GET /api/discogs/releases/:id
// Una edición de Discogs con la forma que usa la app (incluye la tapa en coverUrl).
app.get("/api/discogs/releases/:id", async (req, res) => {
  // Mismo criterio que parseId de la práctica: entero positivo o 400.
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "El id no es valido" });
  try {
    res.json(await getRelease(id));
  } catch (e) {
    if (e instanceof DiscogsError && e.status === 404) return res.status(404).json({ error: "No existe en Discogs" });
    if (e instanceof DiscogsError && e.status === 500) return res.status(500).json({ error: e.message });
    res.status(502).json({ error: "No se pudo consultar Discogs" });
  }
});

// Sin host, Node escucha en todas las interfaces de la PC: el teléfono entra por la IP local.
app.listen(port, () => {
  console.log(`API escuchando en el puerto ${port}`);
});
