// Validaciones y datos públicos de los usuarios. Mismas reglas que utils/validation.ts de la app:
// el backend no puede confiar en que la app ya validó.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-z0-9._]{3,30}$/i;
const PASSWORD_MIN = 6;
const NAME_MAX = 50;
// Reseñas: mismas reglas que REVIEW_MIN y REVIEW_MAX de la app.
const REVIEW_MIN = 10;
const REVIEW_MAX = 500;

// Colores de avatar de las cuentas de prueba. A una cuenta nueva le toca uno según su usuario.
const AVATAR_COLORS = ["#E8A33D", "#C0587E", "#4F8A8B", "#7B6CF6", "#3E7CB1"];

// Lo que ve cualquiera de otro usuario (perfil, ranking, autor de una reseña): sin email ni contraseña.
export const PERFIL_PUBLICO = {
  id: true,
  username: true,
  name: true,
  avatarColor: true,
} as const;

// Lo que recibe el propio usuario al entrar o registrarse: todo menos la contraseña. Se usa como select de Prisma,
// así la contraseña ni siquiera sale de la base.
export const USUARIO_PUBLICO = {
  id: true,
  username: true,
  email: true,
  name: true,
  avatarColor: true,
} as const;

function texto(valor: unknown) {
  return typeof valor === "string" ? valor.trim() : "";
}

export type DatosLogin = { identifier: string; password: string };

// Login: usuario o email, como en la app. Devuelve el mensaje de error o los datos limpios.
export function validarLogin(body: unknown): { error: string } | DatosLogin {
  const datos = (body ?? {}) as Record<string, unknown>;
  const identifier = texto(datos.identifier).toLowerCase();
  // La contraseña no se recorta: un espacio puede ser parte de ella.
  const password = typeof datos.password === "string" ? datos.password : "";
  if (!identifier || !password) return { error: "Faltan el usuario o email y la contraseña" };
  return { identifier, password };
}

export type DatosRegistro = { username: string; email: string; name: string; password: string; avatarColor: string };

export function validarRegistro(body: unknown): { error: string } | DatosRegistro {
  const datos = (body ?? {}) as Record<string, unknown>;
  const username = texto(datos.username).toLowerCase();
  const email = texto(datos.email).toLowerCase();
  const name = texto(datos.name);
  const password = typeof datos.password === "string" ? datos.password : "";
  if (!USERNAME_RE.test(username)) return { error: "El usuario tiene que tener entre 3 y 30 letras, números, puntos o guiones bajos" };
  if (!EMAIL_RE.test(email)) return { error: "El email no es válido" };
  if (!name || name.length > NAME_MAX) return { error: `El nombre es obligatorio y tiene hasta ${NAME_MAX} caracteres` };
  if (password.length < PASSWORD_MIN) return { error: `La contraseña tiene que tener al menos ${PASSWORD_MIN} caracteres` };
  const suma = [...username].reduce((total, letra) => total + letra.charCodeAt(0), 0);
  return { username, email, name, password, avatarColor: AVATAR_COLORS[suma % AVATAR_COLORS.length] };
}

export type DatosResena = { rating: number; body: string };

// Reseña: de 1 a 5 estrellas y un texto de 10 a 500 caracteres (sin contar espacios de los bordes).
export function validarResena(body: unknown): { error: string } | DatosResena {
  const datos = (body ?? {}) as Record<string, unknown>;
  const rating = datos.rating;
  const cuerpo = texto(datos.body);
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "La reseña lleva de 1 a 5 estrellas" };
  }
  if (cuerpo.length < REVIEW_MIN || cuerpo.length > REVIEW_MAX) {
    return { error: `La reseña tiene que tener entre ${REVIEW_MIN} y ${REVIEW_MAX} caracteres` };
  }
  return { rating, body: cuerpo };
}

// Número de release de Discogs válido (entero positivo), como texto, o null.
export function releaseIdValido(valor: string) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? String(id) : null;
}

export type DatosHallazgo = { latitude: number; longitude: number; place: string | null; foundAt: Date };

const PLACE_MAX = 100;

// Hallazgo: coordenadas válidas, lugar opcional y fecha. Mismo formato que el tipo Find de la app.
export function validarHallazgo(body: unknown): { error: string } | DatosHallazgo {
  const datos = (body ?? {}) as Record<string, unknown>;
  const { latitude, longitude } = datos;
  if (typeof latitude !== "number" || latitude < -90 || latitude > 90) return { error: "La latitud va de -90 a 90" };
  if (typeof longitude !== "number" || longitude < -180 || longitude > 180) return { error: "La longitud va de -180 a 180" };
  const place = datos.place === null || datos.place === undefined ? null : texto(datos.place);
  if (place !== null && place.length > PLACE_MAX) return { error: `El lugar tiene hasta ${PLACE_MAX} caracteres` };
  const foundAt = new Date(typeof datos.date === "string" ? datos.date : "");
  if (Number.isNaN(foundAt.getTime())) return { error: "La fecha del hallazgo no es válida" };
  return { latitude, longitude, place: place || null, foundAt };
}
