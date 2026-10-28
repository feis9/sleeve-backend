// Carga las 5 cuentas de prueba de la app (data/mock.ts). Se puede correr varias veces: si la cuenta
// ya existe, la deja como está.
import "dotenv/config";

import { prisma } from "./prisma";

// Mismos datos que users y credentials de data/mock.ts. El backend es otro proyecto y no puede importar
// archivos de la app, por eso se repiten acá.
const CUENTAS = [
  { id: "u-luca", username: "lucaf", email: "luca@sleeve.app", name: "Luca Faccennini", avatarColor: "#E8A33D" },
  { id: "u-mica", username: "mica.spins", email: "mica@sleeve.app", name: "Micaela Ruiz", avatarColor: "#C0587E" },
  { id: "u-tomas", username: "tomas_crate", email: "tomas@sleeve.app", name: "Tomás Vidal", avatarColor: "#4F8A8B" },
  { id: "u-sofi", username: "sofi33rpm", email: "sofi@sleeve.app", name: "Sofía Paz", avatarColor: "#7B6CF6" },
  { id: "u-juan", username: "juanjazz", email: "juan@sleeve.app", name: "Juan Ortega", avatarColor: "#3E7CB1" },
];

async function main() {
  for (const cuenta of CUENTAS) {
    await prisma.usuario.upsert({
      where: { id: cuenta.id },
      create: { ...cuenta, password: "vinilo123" },
      update: {},
    });
  }
  console.log(`Cuentas de prueba: ${await prisma.usuario.count()} usuarios en la base`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
