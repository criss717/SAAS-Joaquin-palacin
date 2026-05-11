import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prismaClientSingleton = () => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter })
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
  var prismaVersion: number | undefined
}

const SCHEMA_VERSION = 6; // Incrementamos tras corregir schema name en .env

const prisma = (globalThis.prisma && globalThis.prismaVersion === SCHEMA_VERSION && 'workSchedule' in globalThis.prisma) 
  ? globalThis.prisma 
  : prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma
  globalThis.prismaVersion = SCHEMA_VERSION
}
