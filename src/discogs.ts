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

// Una edición completa, tal como la devuelve GET /releases/{id} (solo los campos que usamos).
type DiscogsRelease = {
  id: number;
  title: string;
  year?: number;
  country?: string | null;
  artists?: { name: string; anv?: string; join?: string }[];
  labels?: { name: string }[];
  formats?: { name: string; descriptions?: string[] }[];
  genres?: string[];
  identifiers?: { type: string; value: string }[];
  community?: { rating?: { average?: number } };
  companies?: { name: string; entity_type_name: string }[];
  images?: { type: string; uri: string }[];
  tracklist?: { position: string; type_: string; title: string; duration?: string }[];
};

// Discogs desambigua nombres repetidos con un número: "Pink Floyd (2)". Para mostrar no sirve.
function sinNumero(nombre: string) {
  return nombre.replace(/ \(\d+\)$/, "");
}

// Plantas de prensado que ya usamos en los datos de la demo, con su país (criterio del Sprint 1).
// Se busca por coincidencia parcial del nombre que figura en "Pressed By".
const PLANTAS: { nombre: string; pais: string }[] = [
  { nombre: "mpo", pais: "France" },
  { nombre: "united record pressing", pais: "US" },
  { nombre: "vantiva", pais: "Mexico" },
  { nombre: "pallas", pais: "Germany" },
  { nombre: "optimal media", pais: "Germany" },
];

// Criterio de país: el de Discogs. Si no hay uno ubicable, el de la planta de prensado.
// null si tampoco se conoce la planta: la app muestra la edición sin mapa.
function paisDe(release: DiscogsRelease): string | null {
  const pais = release.country?.trim();
  if (pais && !["Worldwide", "Unknown"].includes(pais)) return pais;
  const plantas = (release.companies ?? []).filter((c) => c.entity_type_name === "Pressed By");
  for (const planta of plantas) {
    const conocida = PLANTAS.find((p) => planta.name.toLowerCase().includes(p.nombre));
    if (conocida) return conocida.pais;
  }
  return null;
}

// Edición con la forma del tipo Release de la app. coverUrl reemplaza al coverColor del mock.
export async function getRelease(id: number) {
  const r = await discogsGet<DiscogsRelease>(`/releases/${id}`);
  const formato = r.formats?.[0];
  const tapa = r.images?.find((i) => i.type === "primary") ?? r.images?.[0];
  const codigo = r.identifiers?.find((i) => i.type === "Barcode")?.value;
  return {
    id: String(r.id),
    discogsId: r.id,
    title: r.title,
    // "Art Blakey And The Jazz Messengers*": anv es el nombre como figura en la tapa.
    artist: (r.artists ?? []).map((a) => sinNumero(a.anv || a.name) + (a.join ? ` ${a.join} ` : "")).join("").trim(),
    // Discogs usa 0 cuando no conoce el año.
    year: r.year || null,
    country: paisDe(r),
    // Discogs puede repetir la misma planta (por ejemplo, una por disco): se muestra una vez.
    pressedBy: [...new Set((r.companies ?? []).filter((c) => c.entity_type_name === "Pressed By").map((c) => c.name))],
    label: r.labels?.[0] ? sinNumero(r.labels[0].name) : null,
    // "LP, Album, Reissue", como en los datos de la demo.
    format: formato ? (formato.descriptions?.length ? formato.descriptions.join(", ") : formato.name) : null,
    genre: r.genres?.[0] ?? null,
    barcode: codigo ? codigo.replace(/\D/g, "") : null,
    discogsRating: r.community?.rating?.average ?? null,
    coverUrl: tapa?.uri ?? null,
    // Solo los temas: Discogs también lista encabezados ("Side A") con type_ "heading".
    tracklist: (r.tracklist ?? [])
      .filter((t) => t.type_ === "track")
      .map((t) => (t.duration ? { position: t.position, title: t.title, duration: t.duration } : { position: t.position, title: t.title })),
  };
}
