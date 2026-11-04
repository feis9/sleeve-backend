// Hash de contraseñas con scrypt, que viene con Node (módulo crypto): no hace falta instalar nada.
// La base nunca guarda la contraseña: guarda "sal:hash". Si alguien se lleva dev.db, no puede leerlas
// ni probarlas en otros sitios donde el usuario repita la misma.

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// scrypt viene con callback. promisify lo convierte en una función que devuelve una promesa, para usarla con await.
const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

// 16 bytes de sal y 64 de hash: los valores que usa la documentación de Node para scrypt.
const SAL_BYTES = 16;
const HASH_BYTES = 64;

// Devuelve "sal:hash" en hexadecimal. La sal es al azar en cada llamada: dos usuarios con la misma
// contraseña quedan con hashes distintos, y una tabla de hashes precalculados no sirve.
export async function hashear(password: string): Promise<string> {
  const sal = randomBytes(SAL_BYTES);
  const hash = await scryptAsync(password, sal, HASH_BYTES);
  return `${sal.toString("hex")}:${hash.toString("hex")}`;
}

// true si la contraseña corresponde al "sal:hash" guardado. Se recalcula el hash con la misma sal y se comparan.
export async function verificar(password: string, guardado: string): Promise<boolean> {
  const [salHex, hashHex] = guardado.split(":");
  // Un valor sin el formato (por ejemplo, una contraseña en texto plano de una base vieja) nunca coincide.
  if (!salHex || !hashHex || hashHex.length !== HASH_BYTES * 2) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const calculado = await scryptAsync(password, Buffer.from(salHex, "hex"), HASH_BYTES);
  // timingSafeEqual tarda lo mismo aunque los hashes difieran en el primer byte: así el tiempo de respuesta
  // no da pistas sobre cuánto se acertó.
  return timingSafeEqual(calculado, esperado);
}

// Hash de una contraseña cualquiera, calculado una vez al arrancar. El login lo usa cuando el usuario no existe,
// para tardar lo mismo que con uno que sí existe: si no, midiendo el tiempo se sabría qué cuentas están registradas.
export const HASH_DE_RELLENO = hashear(randomBytes(16).toString("hex"));
