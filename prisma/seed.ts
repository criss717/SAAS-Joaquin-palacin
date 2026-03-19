import "dotenv/config"
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Limpiar BD
  await prisma.taskDependency.deleteMany()
  await prisma.task.deleteMany()
  await prisma.stage.deleteMany()
  await prisma.project.deleteMany()
  await prisma.user.deleteMany()

  // 1. Crear Usuarios de prueba (1 Admin, 1 Tornero, 1 Soldador)
  const passwordHash = await bcrypt.hash('123456', 10)

  const _admin = await prisma.user.create({
    data: { name: 'Admin Taller', email: 'admin@taller.com', passwordHash, role: 'ADMIN' },
  })

  const juanTornero = await prisma.user.create({
    data: { name: 'Juan (Tornero)', email: 'juan@taller.com', passwordHash, role: 'USER' },
  })

  const pedroSoldador = await prisma.user.create({
    data: { name: 'Pedro (Soldador)', email: 'pedro@taller.com', passwordHash, role: 'USER' },
  })

  console.log('Usuarios creados')

  // 2. Crear Proyecto MVP Decanter
  const project = await prisma.project.create({
    data: {
      name: 'Fabricación Decanter P6 Versión2',
      stage: 'Planeación',
    },
  })

  // 3. Crear Etapas Kanban para el proyecto
  await prisma.stage.createMany({
    data: [
      { name: 'Planeación', color: '#f59e0b', order: 0, projectId: project.id },
      { name: 'Pendiente', color: '#94a3b8', order: 1, projectId: project.id },
      { name: 'En Proceso', color: '#3b82f6', order: 2, projectId: project.id },
      { name: 'Listo', color: '#22c55e', order: 3, projectId: project.id },
    ],
  })
  console.log('Etapas Kanban creadas')

  // 3. Crear Ensamble Padre: Rotor Principal
  const rotor = await prisma.task.create({
    data: {
      name: 'Rotor Principal',
      projectId: project.id,
      isAssembly: true,
      stage: 'Pendiente',
      startDate: new Date('2026-03-20T08:00:00Z'),
      endDate: new Date('2026-03-30T16:00:00Z'),
    },
  })

  // 4. Crear Piezas hijas del Rotor
  const mecanizadoEje = await prisma.task.create({
    data: {
      name: 'Mecanizado de Eje',
      projectId: project.id,
      parentId: rotor.id,
      isAssembly: false,
      stage: 'Pendiente',
      startDate: new Date('2026-03-20T12:00:00Z'),
      endDate: new Date('2026-03-22T12:00:00Z'),
      assignees: { create: { userId: juanTornero.id } },
    },
  })

  const soldadoVirola = await prisma.task.create({
    data: {
      name: 'Soldar Virola',
      projectId: project.id,
      parentId: rotor.id,
      isAssembly: false,
      stage: 'Pendiente',
      startDate: new Date('2026-03-23T12:00:00Z'),
      endDate: new Date('2026-03-25T12:00:00Z'),
      assignees: { create: { userId: pedroSoldador.id } },
    },
  })

  // 5. Crear Dependencias
  await prisma.taskDependency.create({
    data: {
      predecessorId: mecanizadoEje.id,
      successorId: soldadoVirola.id,
    },
  })

  console.log('¡Base de datos sembrada con datos del Decanter!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
