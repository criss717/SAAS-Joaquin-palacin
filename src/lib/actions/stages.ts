"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error("No autorizado: debes iniciar sesión")
  return session
}

async function requireAdmin() {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN") throw new Error("No autorizado: se requiere rol de Administrador")
  return session
}

export type StageWithCount = {
  id: string
  name: string
  color: string
  order: number
  projectId: string
  _count: { tasks: number }
}

/** Devuelve las etapas de un proyecto (ordenadas) */
export async function getStagesByProject(projectId: string) {
  await requireAuth()
  return prisma.stage.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  })
}

/** Crea una nueva etapa/columna para un proyecto */
export async function createStage(projectId: string, name: string, color: string) {
  await requireAdmin()
  const last = await prisma.stage.findFirst({
    where: { projectId },
    orderBy: { order: "desc" },
  })
  const stage = await prisma.stage.create({
    data: { name, color, projectId, order: (last?.order ?? -1) + 1 },
  })
  revalidatePath("/")
  return stage
}

/** Renombra o cambia el color de una etapa */
export async function updateStage(stageId: string, data: { name?: string; color?: string }) {
  await requireAuth()
  // Actualizamos también las tareas que usan el nombre antiguo (si cambia el nombre)
  if (data.name) {
    const old = await prisma.stage.findUnique({ where: { id: stageId } })
    if (old && old.name !== data.name) {
      await prisma.task.updateMany({
        where: { projectId: old.projectId, stage: old.name },
        data: { stage: data.name },
      })
    }
  }
  await prisma.stage.update({ where: { id: stageId }, data })
  revalidatePath("/")
  revalidatePath("/gantt")
}

/** Elimina una etapa (solo si no tiene tareas) */
export async function deleteStage(stageId: string) {
  await requireAdmin()
  const count = await prisma.task.count({ where: { stage: { equals: (await prisma.stage.findUnique({ where: { id: stageId } }))?.name } } })
  if (count > 0) throw new Error("No se puede eliminar una etapa con tareas asignadas")
  await prisma.stage.delete({ where: { id: stageId } })
  revalidatePath("/")
}

/** Reordena las etapas */
export async function reorderStages(stageIds: string[]) {
  await requireAdmin()
  await Promise.all(
    stageIds.map((id, index) => prisma.stage.update({ where: { id }, data: { order: index } }))
  )
  revalidatePath("/")
}
