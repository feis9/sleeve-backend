import { PrismaClient } from "@prisma/client";

// Un solo cliente de Prisma para todo el servidor: cada instancia abre sus propias conexiones.
export const prisma = new PrismaClient();
