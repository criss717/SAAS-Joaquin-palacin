"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { TaskStatus } from "@prisma/client"

export type TaskAssignee = { id: string; name: string }

export type TaskWithRelations = {
  id: string
  name: string
  stage: string
  status: TaskStatus
  progress: number
  isAssembly: boolean
  startDate: Date
  endDate: Date
  projectId: string
  parentId: string | null
  assignees: TaskAssignee[]
  subTasks: { id: string; name: string; stage: string; status: TaskStatus }[]
  predecessors: { predecessor: { id: string; name: string } }[]
  successors: { successor: { id: string; name: string } }[]
}

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error("No autorizado: debes iniciar sesión")
  return session
}

async function requireAdmin() {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN") throw new Error("Se requiere rol de Administrador")
  return session
}

/** Devuelve todos los proyectos */
export async function getProjects() {
  await requireAuth()
  return prisma.project.findMany({ orderBy: { createdAt: "asc" } })
}

/** Devuelve las tareas de un proyecto con todas sus relaciones */
export async function getTasksByProject(projectId: string): Promise<TaskWithRelations[]> {
  await requireAuth()
  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: {
      assignees: { include: { user: { select: { id: true, name: true } } } },
      subTasks: { select: { id: true, name: true, stage: true, status: true } },
      predecessors: { include: { predecessor: { select: { id: true, name: true } } } },
      successors: { include: { successor: { select: { id: true, name: true } } } },
    },
    orderBy: { startDate: "asc" },
  })
  // Aplanar assignees a { id, name }
  return tasks.map(t => ({
    ...t,
    assignees: t.assignees.map(a => ({ id: a.user.id, name: a.user.name })),
  })) as unknown as TaskWithRelations[]
}

/** Actualiza el estado manual de una tarea */
export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  await requireAuth()
  await prisma.task.update({ where: { id: taskId }, data: { status } })
  revalidatePath("/gantt")
}

/** Actualiza el progreso (0-100) de una tarea */
export async function updateTaskProgress(taskId: string, progress: number) {
  await requireAuth()
  await prisma.task.update({ where: { id: taskId }, data: { progress } })
  revalidatePath("/gantt")
}

/**
 * Actualiza la etapa de una tarea en la BD.
 * NO llama revalidatePath porque el cliente actualiza el estado local directamente.
 */
export async function updateTaskStage(taskId: string, newStage: string) {
  await requireAuth()
  await prisma.task.update({ where: { id: taskId }, data: { stage: newStage } })
  // Solo revalidamos Gantt (otra página)
  revalidatePath("/gantt")
}

/**
 * Actualiza fechas de tarea. NO revalida "/" para evitar que el RSC pise el estado Kanban.
 */
export async function updateTaskDates(taskId: string, startDate: Date, endDate: Date) {
  await requireAuth()
  // Guard: rechazar fechas nulas o inválidas
  if (!startDate || !endDate) throw new Error("Fechas inválidas")
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) throw new Error("Fecha inválida (NaN)")
  await prisma.task.update({ where: { id: taskId }, data: { startDate, endDate } })
  revalidatePath("/gantt")
}

/** Actualiza asignados de una tarea (reemplaza todos) */
export async function updateTaskAssignees(taskId: string, userIds: string[]) {
  await requireAuth()
  await prisma.taskAssignee.deleteMany({ where: { taskId } })
  if (userIds.length > 0) {
    await prisma.taskAssignee.createMany({
      data: userIds.map(userId => ({ taskId, userId })),
    })
  }
  revalidatePath("/gantt")
}

/** Crea una nueva tarea en un proyecto */
export async function createTask(data: {
  name: string
  projectId: string
  parentId?: string
  isAssembly?: boolean
  stage: string
  status?: TaskStatus
  progress?: number
  assigneeIds?: string[]
  predecessorIds?: string[]
  startDate: Date
  endDate: Date
}) {
  await requireAuth()
  const { assigneeIds, predecessorIds, ...rest } = data
  const task = await prisma.task.create({
    data: {
      ...rest,
      assignees: assigneeIds?.length
        ? { create: assigneeIds.map(userId => ({ userId })) }
        : undefined,
      predecessors: predecessorIds?.length
        ? { create: predecessorIds.map(id => ({ predecessorId: id })) }
        : undefined,
    },
    include: {
      assignees: { include: { user: { select: { id: true, name: true } } } },
      subTasks: { select: { id: true, name: true, stage: true, status: true } },
      predecessors: { include: { predecessor: { select: { id: true, name: true } } } },
      successors: { include: { successor: { select: { id: true, name: true } } } },
    }
  })
  
  const flattenedTask = {
    ...task,
    assignees: task.assignees.map(a => ({ id: a.user.id, name: a.user.name })),
  }
  // Sí revalidamos "/" porque hay una tarea nueva que deben ver todos
  revalidatePath("/")
  revalidatePath("/gantt")
  return flattenedTask as unknown as TaskWithRelations
}

/** Crea un nuevo proyecto — solo ADMIN */
export async function createProject(data: { name: string; stage?: string }) {
  await requireAdmin()
  const project = await prisma.project.create({ data })
  revalidatePath("/")
  return project
}

/** Lista todos los usuarios — para asignar en tareas */
export async function getUsers() {
  await requireAuth()
  return prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  })
}
