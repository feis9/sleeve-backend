// Deduplicación de pedidos en vuelo. Si llega un pedido por algo que ya se está buscando (por ejemplo, dos
// teléfonos abren el mismo disco al mismo tiempo, o la app pide el catálogo mientras otra pantalla pide uno
// de esos discos), el segundo no sale a Discogs: espera la respuesta del primero y recibe lo mismo.
// La réplica no alcanza para esto: mientras el primer pedido viaja, la edición todavía no está en la base.

// Lo que se está buscando ahora, por clave ("edicion:1517028", "busqueda:696998020719").
const enCurso = new Map<string, Promise<unknown>>();

// Ejecuta buscar() una sola vez por clave mientras esté en curso. Cuando termina (bien o mal), la clave se libera:
// esto no es un caché, el resultado lo guarda la réplica. Si falla, todos los que esperaban reciben el mismo error.
export function unaVez<T>(clave: string, buscar: () => Promise<T>): Promise<T> {
  const existente = enCurso.get(clave);
  if (existente) {
    console.log(`${clave} ya se está pidiendo: se espera esa respuesta`);
    return existente as Promise<T>;
  }
  const promesa = buscar().finally(() => enCurso.delete(clave));
  enCurso.set(clave, promesa);
  return promesa;
}
