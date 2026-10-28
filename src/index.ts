// dotenv carga las variables de backend/.env (PORT y, más adelante, el token de Discogs).
import "dotenv/config";

import cors from "cors";
import express from "express";

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

// Sin host, Node escucha en todas las interfaces de la PC: el teléfono entra por la IP local.
app.listen(port, () => {
  console.log(`API escuchando en el puerto ${port}`);
});
