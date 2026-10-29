// Carga las 5 cuentas de prueba con sus colecciones de ejemplo. Se puede correr varias veces: si la cuenta
// ya existe, no la toca (ni su colección, para no devolver discos que el usuario sacó).
import "dotenv/config";

import { prisma } from "./prisma";

// Las cuentas y colecciones de prueba del Sprint 1. Los discos son números de release de Discogs (los de
// DEMO_RELEASE_IDS de la app), del más nuevo al más viejo.
const CUENTAS = [
  {
    id: "u-luca", username: "lucaf", email: "luca@sleeve.app", name: "Luca Faccennini", avatarColor: "#E8A33D",
    coleccion: ["15527003", "4345204", "6546645"],
  },
  {
    id: "u-mica", username: "mica.spins", email: "mica@sleeve.app", name: "Micaela Ruiz", avatarColor: "#C0587E",
    coleccion: ["1517028", "25128898", "30106898", "6546645", "15527003", "4345204"],
  },
  {
    id: "u-tomas", username: "tomas_crate", email: "tomas@sleeve.app", name: "Tomás Vidal", avatarColor: "#4F8A8B",
    coleccion: ["8487517", "25146217", "30170624", "4345204", "1517028"],
  },
  {
    id: "u-sofi", username: "sofi33rpm", email: "sofi@sleeve.app", name: "Sofía Paz", avatarColor: "#7B6CF6",
    coleccion: ["35395852", "6546645", "15527003", "25128898"],
  },
  {
    id: "u-juan", username: "juanjazz", email: "juan@sleeve.app", name: "Juan Ortega", avatarColor: "#3E7CB1",
    coleccion: ["4345204", "30106898"],
  },
];

async function main() {
  const ahora = Date.now();
  for (const { coleccion, ...cuenta } of CUENTAS) {
    if (await prisma.usuario.findUnique({ where: { id: cuenta.id } })) continue;
    await prisma.usuario.create({
      data: {
        ...cuenta,
        password: "vinilo123",
        // Un minuto entre cada disco, para que el orden sea el de la lista.
        coleccion: { create: coleccion.map((releaseId, i) => ({ releaseId, agregadoEn: new Date(ahora - i * 60000) })) },
      },
    });
  }
  console.log(
    `Cuentas de prueba: ${await prisma.usuario.count()} usuarios y ${await prisma.coleccionItem.count()} discos en colecciones`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
