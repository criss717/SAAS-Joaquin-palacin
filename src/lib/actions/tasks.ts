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
  orderIndex: number
  deliveryDays?: number
  estimatedHours?: number
  assignees: TaskAssignee[]
  subTasks: { id: string; name: string; stage: string; status: TaskStatus }[]
  predecessors: { predecessor: { id: string; name: string } }[]
  successors: { successor: { id: string; name: string } }[]
}

// Tipo auxiliar para Prisma antes del aplanado
interface PrismaTaskWithRelations {
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
  orderIndex: number
  estimatedHours: number | null
  deliveryDays: number | null
  createdAt: Date
  updatedAt: Date
  assignees: { user: { id: string; name: string } }[]
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
    orderBy: { orderIndex: "asc" },
  })

  // REPARACIÓN AUTOMÁTICA: Si hay muchas tareas con el mismo index (ej. tras la migración)
  // las re-indexamos secuencialmente por fecha para que el dnd funcione fino.
  const needsRepair = tasks.length > 1 && tasks.every(t => t.orderIndex === 0)
  if (needsRepair) {
    await prisma.$transaction(
      tasks.map((t, i) => 
        prisma.task.update({ where: { id: t.id }, data: { orderIndex: i } })
      )
    )
    // Recargamos para devolver las tareas bien indexadas
    return getTasksByProject(projectId)
  }

  // Aplanar assignees a { id, name }
  return tasks.map((t: unknown) => {
    const task = t as PrismaTaskWithRelations
    return {
      ...task,
      assignees: task.assignees.map(a => ({ id: a.user.id, name: a.user.name })),
    }
  }) as unknown as TaskWithRelations[]
}

/** Actualiza el nombre de una tarea */
export async function updateTaskName(taskId: string, name: string) {
  await requireAuth()
  await prisma.task.update({ where: { id: taskId }, data: { name } })
  revalidatePath("/")
  revalidatePath("/gantt")
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
 * Reordena una tarea y desplaza las demás en la misma columna.
 * Usa una transacción para asegurar consistencia.
 */
export async function reorderTasks(taskId: string, newStage: string, newIndex: number) {
  await requireAuth()
  
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new Error("Tarea no encontrada")

  const oldStage = task.stage
  const projectId = task.projectId

  return prisma.$transaction(async (tx) => {
    // 1. Obtener todas las tareas de la(s) etapa(s) involucrada(s)
    const stagesToUpdate = oldStage === newStage ? [newStage] : [oldStage, newStage]
    
    for (const stageName of stagesToUpdate) {
      const stageTasks = await tx.task.findMany({
        where: { projectId, stage: stageName },
        orderBy: { orderIndex: "asc" }
      })

      let updatedList = [...stageTasks]

      if (stageName === oldStage && stageName === newStage) {
        // Mismo canal: mover dentro del array
        const movingIndex = updatedList.findIndex(t => t.id === taskId)
        if (movingIndex !== -1) {
          const [moved] = updatedList.splice(movingIndex, 1)
          updatedList.splice(newIndex, 0, moved)
        }
      } else if (stageName === oldStage) {
        // Canal origen: quitar la tarea
        updatedList = updatedList.filter(t => t.id !== taskId)
      } else if (stageName === newStage) {
        // Canal destino: insertar la tarea en el nuevo índice
        // Nota: 'task' es la versión antigua, necesitamos insertarla
        const taskToInsert = { ...task, stage: newStage } as unknown as PrismaTaskWithRelations
        updatedList.splice(newIndex, 0, taskToInsert)
      }

      // 2. Aplicar nuevos índices secuenciales
      await Promise.all(
        updatedList.map((t, i) => 
          tx.task.update({
            where: { id: t.id },
            data: { orderIndex: i, stage: stageName }
          })
        )
      )
    }
  })
}

/**
 * Actualiza fechas de tarea y las horas estimadas (si se proveen). NO revalida "/" para evitar fallos de RSC.
 */
export async function updateTaskDates(taskId: string, startDate: Date, endDate: Date, estimatedHours?: number) {
  await requireAuth()
  // Guard: rechazar fechas nulas o inválidas
  if (!startDate || !endDate) throw new Error("Fechas inválidas")
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) throw new Error("Fecha inválida (NaN)")
    
  const dataToUpdate: Record<string, string | number | Date> = { startDate, endDate }
  if (estimatedHours !== undefined) {
    dataToUpdate.estimatedHours = estimatedHours
  }

  await prisma.task.update({ where: { id: taskId }, data: dataToUpdate })
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

/** Actualiza las dependencias (predecesoras) de una tarea */
export async function updateTaskPredecessors(taskId: string, predecessorIds: string[]) {
  await requireAuth()
  // Borramos las dependencias existentes donde esta tarea es la sucesora
  await prisma.taskDependency.deleteMany({ where: { successorId: taskId } })
  // Insertamos las nuevas
  if (predecessorIds.length > 0) {
    await prisma.taskDependency.createMany({
      data: predecessorIds.map(id => ({ successorId: taskId, predecessorId: id }))
    })
  }
  revalidatePath("/gantt")
}

/** Actualiza la tarea padre (ensamble al que pertenece) */
export async function updateTaskParent(taskId: string, parentId: string | null) {
  await requireAuth()
  await prisma.task.update({ where: { id: taskId }, data: { parentId } })
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
  estimatedHours?: number
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

  // Asignar el último orden disponible en esa etapa (count - 1 porque el create ya contó la nueva)
  const count = await prisma.task.count({
    where: { projectId: data.projectId, stage: data.stage }
  })
  const updatedTask = await prisma.task.update({
    where: { id: task.id },
    data: { orderIndex: count - 1 },
    include: {
      assignees: { include: { user: { select: { id: true, name: true } } } },
      subTasks: { select: { id: true, name: true, stage: true, status: true } },
      predecessors: { include: { predecessor: { select: { id: true, name: true } } } },
      successors: { include: { successor: { select: { id: true, name: true } } } },
    }
  })
  
  const flattenedTask = {
    ...(updatedTask as unknown as PrismaTaskWithRelations),
    assignees: (updatedTask as unknown as PrismaTaskWithRelations).assignees.map(a => ({ id: a.user.id, name: a.user.name })),
  }
  // Sí revalidamos "/" porque hay una tarea nueva que deben ver todos
  revalidatePath("/")
  revalidatePath("/gantt")
  return flattenedTask as unknown as TaskWithRelations
}

/** Crea un nuevo proyecto — solo ADMIN */
export async function createProject(data: { name: string; stage?: string }) {
  await requireAdmin()
  const project = await prisma.project.create({ 
    data: {
      ...data,
      stages: {
        create: [
          { name: "Planeación y Diseño", color: "#f59e0b", order: 0 },
          { name: "Ensambles", color: "#a855f7", order: 1 },
          { name: "Piezas / Accesorios", color: "#9ca3af", order: 2 },
          { name: "Pedido Externo", color: "#ef4444", order: 3 },
          { name: "Fabricación Taller", color: "#3b82f6", order: 4 },
          { name: "Listo", color: "#22c55e", order: 5 },
        ]
      }
    } 
  })
  revalidatePath("/")
  return project
}

/** Elimina una tarea y todos sus descendientes (Cascade Delete) */
export async function deleteTask(taskId: string) {
  await requireAuth()
  await prisma.task.delete({ where: { id: taskId } })
  revalidatePath("/")
  revalidatePath("/gantt")
}

/** Lista todos los usuarios — para asignar en tareas */
export async function getUsers() {
  await requireAuth()
  return prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  })
}
