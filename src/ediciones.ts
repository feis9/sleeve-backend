// Ediciones de Discogs con caché en la base, para no gastar el límite de 60 pedidos por minuto.

import { getRelease } from "./discogs";
import { prisma } from "./prisma";

// La edición más cuándo se consultó a Discogs (ISO 8601). La app lo usa para no mostrar copias de más de 6 horas:
// si una edición sale del caché, su antigüedad empieza a contar desde la consulta, no desde que la recibe la app.
type Edicion = Awaited<ReturnType<typeof getRelease>> & { consultadaEn: string };

// Los términos de uso de la API de Discogs no permiten mostrar datos con más de 6 horas de antigüedad.
const VIGENCIA_MS = 6 * 60 * 60 * 1000;

// La edición desde la base si se consultó hace menos de 6 horas; si no, desde Discogs, y se guarda.
// El caché es best-effort: si la base falla, se sigue directo contra Discogs.
export async function edicionConCache(id: number): Promise<Edicion> {
  try {
    const guardada = await prisma.edicion.findUnique({ where: { id } });
    if (guardada) {
      const antiguedad = Date.now() - guardada.consultadaEn.getTime();
      if (antiguedad < VIGENCIA_MS) {
        console.log(`Edición ${id} desde la base (consultada hace ${Math.round(antiguedad / 60000)} min)`);
        return { ...(JSON.parse(guardada.datos) as Edicion), consultadaEn: guardada.consultadaEn.toISOString() };
      }
    }
  } catch (e) {
    console.error(`No se pudo leer la edición ${id} de la base:`, e);
  }

  // Si Discogs falla, el error sube a la ruta: no se muestra una copia vencida.
  const edicion = await getRelease(id);
  const datos = JSON.stringify(edicion);
  const consultadaEn = new Date();
  try {
    await prisma.edicion.upsert({ where: { id }, create: { id, datos, consultadaEn }, update: { datos, consultadaEn } });
  } catch (e) {
    console.error(`No se pudo guardar la edición ${id} en la base:`, e);
  }
  return { ...edicion, consultadaEn: consultadaEn.toISOString() };
}
