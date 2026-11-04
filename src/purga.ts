// Purga de lo vencido. Los términos de Discogs piden no mostrar datos con más de 6 horas y no guardarlos
// más de lo necesario: la réplica ya no muestra lo vencido (leerVigente), y esto además lo borra.

import { VIGENCIA_MS } from "./ediciones";
import { prisma } from "./prisma";

// Cada cuánto se purga. Con 15 minutos, nada de Discogs queda guardado mucho más de 6 horas.
const CADA_MS = 15 * 60 * 1000;

export async function purgarVencidas() {
  const limite = new Date(Date.now() - VIGENCIA_MS);
  try {
    // Los temas, plantas y resultados se borran solos (onDelete: Cascade en schema.prisma).
    // Colecciones y reseñas no se tocan: guardan el número de release sin relación con Edicion.
    const [ediciones, busquedas, sesiones] = await Promise.all([
      prisma.edicion.deleteMany({ where: { consultadaEn: { lte: limite } } }),
      prisma.busquedaCodigo.deleteMany({ where: { consultadaEn: { lte: limite } } }),
      // De paso, las sesiones vencidas que nadie volvió a usar (requiereSesion borra las que se usan).
      prisma.sesion.deleteMany({ where: { expiraEn: { lte: new Date() } } }),
    ]);
    if (ediciones.count + busquedas.count + sesiones.count > 0) {
      console.log(`Purga: ${ediciones.count} ediciones, ${busquedas.count} búsquedas y ${sesiones.count} sesiones vencidas`);
    }
  } catch (e) {
    // Si falla, no pasa nada grave: lo vencido igual no se muestra. Se reintenta en la próxima vuelta.
    console.error("No se pudo purgar lo vencido:", e);
  }
}

// Purga al arrancar (por si el backend estuvo apagado) y después cada 15 minutos.
export function programarPurga() {
  purgarVencidas();
  setInterval(purgarVencidas, CADA_MS);
}
