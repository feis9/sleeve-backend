// Sesiones: al entrar o registrarse, el backend entrega un token y la app lo manda en cada pedido.
// Así el backend sabe quién llama sin que el usuario venga en la URL.

import { createHash, randomBytes } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import { prisma } from "./prisma";

// 30 días: la app no vuelve a pedir login cada vez que se abre, pero un token robado no sirve para siempre.
export const VIGENCIA_SESION_MS = 30 * 24 * 60 * 60 * 1000;

// En la base se guarda el SHA-256 del token, no el token. Si alguien se lleva dev.db, no puede usar
// esas sesiones: para entrar necesita el token, y del hash no se puede volver al token.
// Acá alcanza con SHA-256 (rápido) y no hace falta scrypt como con las contraseñas: el token son 32 bytes
// al azar (256 bits), así que no hay diccionario ni fuerza bruta posible. Una contraseña sí se puede adivinar.
export function hashDelToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Token nuevo y los datos de la fila de Sesion que le corresponde (sin el usuario, que lo pone quien la crea).
// randomBytes usa el generador criptográfico del sistema: Math.random() no sirve, porque se puede predecir.
export function nuevaSesion() {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    fila: { tokenHash: hashDelToken(token), expiraEn: new Date(Date.now() + VIGENCIA_SESION_MS) },
  };
}

// Lo que el middleware deja en res.locals para la ruta que sigue. Se declara acá para que TypeScript
// sepa que res.locals.usuarioId existe y es texto (si no, sería any).
declare global {
  namespace Express {
    interface Locals {
      usuarioId: string;
      tokenHash: string;
    }
  }
}

// 401 con el header que pide el estándar HTTP: le dice al cliente que se autentica con un token Bearer.
function noAutorizado(res: Response, error: string) {
  res.set("WWW-Authenticate", "Bearer").status(401).json({ error });
}

// Middleware de Express: corre antes de la ruta y decide si la deja pasar.
// La app manda el header "Authorization: Bearer <token>". Si el token corresponde a una sesión vigente,
// guarda el usuario en res.locals y llama a next(). Si no, corta con 401 y la ruta nunca se ejecuta.
// Así el usuario sale del token y no de la URL: nadie puede actuar en nombre de otro cambiando un id.
// Es genérico en P (los parámetros de la ruta) para que TypeScript siga sabiendo, en la ruta que viene después,
// que req.params.releaseId es texto. Con un Request común, Express 5 lo tipa como string | string[].
export async function requiereSesion<P>(req: Request<P>, res: Response, next: NextFunction) {
  const [tipo, token] = (req.get("Authorization") ?? "").split(" ");
  if (tipo !== "Bearer" || !token) return noAutorizado(res, "Falta el token de sesión");
  try {
    const tokenHash = hashDelToken(token);
    const sesion = await prisma.sesion.findUnique({ where: { tokenHash } });
    if (!sesion) return noAutorizado(res, "La sesión no es válida");
    if (sesion.expiraEn.getTime() <= Date.now()) {
      // Ya no sirve: se borra para que la tabla no junte sesiones muertas.
      await prisma.sesion.delete({ where: { tokenHash } });
      return noAutorizado(res, "La sesión venció. Volvé a entrar");
    }
    res.locals.usuarioId = sesion.usuarioId;
    res.locals.tokenHash = tokenHash;
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error del servidor" });
  }
}
