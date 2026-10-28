// Cliente de la API de Discogs. Solo corre en el servidor: el token nunca llega a la app.
// Documentación: https://www.discogs.com/developers

const BASE_URL = "https://api.discogs.com";

// Discogs exige un User-Agent que identifique a la aplicación. Sin uno, puede bloquear los pedidos.
const USER_AGENT = "Sleeve/1.0 +https://github.com/feis9/sleeve";

// Error de Discogs con su status, para que la ruta decida qué responder.
export class DiscogsError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// Una edición tal como la devuelve la búsqueda de Discogs (solo los campos que usamos).
type SearchResult = {
  id: number;
  title: string;
  year?: string;
  country?: string;
  format?: string[];
  label?: string[];
  thumb?: string;
  // Todos los códigos de la edición, como están impresos ("6 96998-02071-9").
  barcode?: string[];
};

// Solo dígitos, y un EAN-13 con 0 adelante es el mismo UPC-A (igual que normalizeBarcode en la app).
function normalizeBarcode(code: string) {
  const digits = code.replace(/\D/g, "");
  return digits.length === 13 && digits.startsWith("0") ? digits.slice(1) : digits;
}

async function discogsGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = process.env.DISCOGS_TOKEN;
  if (!token) throw new DiscogsError("Falta DISCOGS_TOKEN en backend/.env", 500);

  const url = `${BASE_URL}${path}?${new URLSearchParams(params)}`;
  // El token va en el header y no en la URL, para que no quede en ningún log.
  const response = await fetch(url, {
    headers: { Authorization: `Discogs token=${token}`, "User-Agent": USER_AGENT },
  });

  // Discogs permite 60 pedidos por minuto con token. Lo mostramos para ver cuánto queda.
  const restantes = response.headers.get("X-Discogs-Ratelimit-Remaining");
  console.log(`Discogs ${response.status} ${path} (quedan ${restantes ?? "?"} pedidos en el minuto)`);

  if (!response.ok) throw new DiscogsError(`Discogs respondió ${response.status}`, response.status);
  return (await response.json()) as T;
}

// Todas las ediciones (releases) que tienen ese código de barras.
export async function searchByBarcode(barcode: string) {
  const data = await discogsGet<{ results: SearchResult[] }>("/database/search", {
    barcode,
    type: "release",
  });
  // La búsqueda de Discogs no es exacta: con "0000000000000" trae cualquier disco con ceros en algún código.
  // Por eso nos quedamos solo con las ediciones que tienen exactamente este código.
  const buscado = normalizeBarcode(barcode);
  const coinciden = data.results.filter((r) => (r.barcode ?? []).some((b) => normalizeBarcode(b) === buscado));
  console.log(`Discogs devolvió ${data.results.length} ediciones, coinciden ${coinciden.length}`);
  return coinciden.map((r) => ({
    id: r.id,
    title: r.title,
    year: r.year ?? null,
    country: r.country ?? null,
    formats: r.format ?? [],
    labels: r.label ?? [],
    thumb: r.thumb || null,
  }));
}
