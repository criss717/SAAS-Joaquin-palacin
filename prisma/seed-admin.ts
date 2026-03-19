import "dotenv/config"
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  const passwordHash = await bcrypt.hash('123456', 10)

  await prisma.user.upsert({
    where: { email: 'admin@taller.com' },
    update: { 
        passwordHash, 
        role: 'ADMIN', 
        name: 'Admin Taller' 
    },
    create: { 
        name: 'Admin Taller', 
        email: 'admin@taller.com', 
        passwordHash, 
        role: 'ADMIN' 
    },
  })

  console.log('✅ Usuario admin@taller.com (clave: 123456) recreado con éxito.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
