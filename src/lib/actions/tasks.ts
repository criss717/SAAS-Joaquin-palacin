"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { TaskStatus } from "@prisma/client"
import { addExternalDays, addCalendarDays } from "@/lib/external-calendar"

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
  unitEstimatedHours?: number
  quantity: number
  catalogPartId?: string | null
  catalogOperationId?: string | null
  materials: {
    id: string;
    material: { id: string; name: string };
    quantityPerUnit: number;
    unitType: { id: string; name: string } | null;
  }[]
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
  unitEstimatedHours: number | null
  quantity: number
  catalogPartId: string | null
  catalogOperationId: string | null
  deliveryDays: number | null
  materialId: string | null
  materialQuantityPerUnit: number | null
  unitTypeId: string | null
  materials: {
    id: string;
    material: { id: string; name: string };
    quantityPerUnit: number;
    unitType: { id: string; name: string } | null;
  }[]
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
      materials: {
        include: {
          material: { select: { id: true, name: true } },
          unitType: { select: { id: true, name: true } }
        }
      },
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
        const taskToInsert = { ...task, stage: newStage }
        updatedList.splice(newIndex, 0, taskToInsert as any)
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

const taskInclude = {
  assignees: { include: { user: { select: { id: true, name: true } } } },
  subTasks: { select: { id: true, name: true, stage: true, status: true } },
  predecessors: { include: { predecessor: { select: { id: true, name: true } } } },
  successors: { include: { successor: { select: { id: true, name: true } } } },
  materials: {
    include: {
      material: { select: { id: true, name: true } },
      unitType: { select: { id: true, name: true } }
    }
  }
} as const

function flattenTask(t: PrismaTaskWithRelations): TaskWithRelations {
  return {
    ...t,
    assignees: t.assignees.map((a) => ({ id: a.user.id, name: a.user.name })),
  } as unknown as TaskWithRelations
}

/**
 * Actualiza fechas de una tarea y propaga el cambio en cadena (BFS) a sus sucesoras.
 * Reglas:
 *  - Solo se mueven tareas con status != "HECHO" y != "CANCELADO".
 *  - Una sucesor con múltiples predecesores espera al más tardío de todos.
 *  - La propagación es anti-cíclica (Set de visitados).
 * Devuelve todas las tareas modificadas (la raíz + las cascadeadas).
 */
export async function updateTaskDatesAndCascade(
  taskId: string,
  startDate: Date,
  endDate: Date,
  estimatedHours?: number,
  unitEstimatedHours?: number
): Promise<{ updated: TaskWithRelations[] }> {
  await requireAuth()
  if (!startDate || !endDate) throw new Error("Fechas inválidas")
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) throw new Error("Fecha inválida (NaN)")

  // Importar TimeEngine dinámicamente (solo server-side)
  const { TimeEngine } = await import("@/lib/time-engine")
  const schedules = await prisma.workSchedule.findMany({ orderBy: { validFrom: "asc" } })
  const holidays = await prisma.holiday.findMany()
  const engine = new TimeEngine(schedules, holidays)

  const updated: TaskWithRelations[] = []

  // 1. Actualizar la tarea raíz
  const dataToUpdate: Record<string, string | number | Date> = { startDate, endDate }
  if (estimatedHours !== undefined) dataToUpdate.estimatedHours = estimatedHours
  if (unitEstimatedHours !== undefined) dataToUpdate.unitEstimatedHours = unitEstimatedHours

  const rootRaw = await prisma.task.update({
    where: { id: taskId },
    data: dataToUpdate,
    include: taskInclude,
  })
  updated.push(flattenTask(rootRaw as unknown as PrismaTaskWithRelations))

  // 2. BFS: cola de trabajo → [{ successorId, latestPredEnd }]
  // Mapa auxiliar: taskId → endDate actual (para calcular max de predecesoras)
  const knownEnds = new Map<string, Date>([[taskId, endDate]])

  // Cola de IDs de sucesores a procesar
  const queue: string[] = rootRaw.successors.map((s) => (s as { successor: { id: string } }).successor.id)
  const visited = new Set<string>([taskId])

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    // Cargar la tarea actual con sus predecesoras
    const currentTask = await prisma.task.findUnique({
      where: { id: currentId },
      include: {
        ...taskInclude,
        predecessors: {
          include: {
            predecessor: { select: { id: true, name: true, endDate: true } }
          }
        }
      }
    })
    if (!currentTask) continue

    // Saltamos HECHO y CANCELADO — trabajo completado o irrelevante
    if (currentTask.status === "HECHO" || currentTask.status === "CANCELADO") continue

    // Calcular la fecha de fin más tardía de TODOS sus predecesores
    let maxPredEnd: Date | null = null
    for (const dep of currentTask.predecessors) {
      const pred = dep.predecessor as { id: string; name: string; endDate: Date }
      // Usamos la fecha actualizada si la procesamos en esta cadena, sino la de BD
      const predEnd = knownEnds.get(pred.id) ?? new Date(pred.endDate)
      if (!maxPredEnd || predEnd > maxPredEnd) {
        maxPredEnd = predEnd
      }
    }

    if (!maxPredEnd) continue // Sin predecesores conocidos, no tocamos

    // Calcular nuevo inicio como el siguiente día laborable tras el predecesor más tardío
    const newStart = engine.getNextWorkingDayStart(new Date(maxPredEnd))

    // Actualizar en ambas direcciones (adelante o atrás).
    // Solo omitimos si la fecha es prácticamente la misma (< 1 min) para evitar escrituras innecesarias.
    const currentStart = new Date(currentTask.startDate)
    if (Math.abs(newStart.getTime() - currentStart.getTime()) < 60_000) continue

    // Calcular nueva fecha de fin respetando horas estimadas o delivery days
    const hours = currentTask.estimatedHours ?? 8
    const isExternal = (currentTask.deliveryDays || 0) > 0
    const newEnd = isExternal
      ? addCalendarDays(new Date(newStart), currentTask.deliveryDays!)
      : engine.addBusinessHours(new Date(newStart), hours)

    // Actualizar en BD
    const updatedRaw = await prisma.task.update({
      where: { id: currentId },
      data: { startDate: newStart, endDate: newEnd },
      include: taskInclude,
    })
    updated.push(flattenTask(updatedRaw as unknown as PrismaTaskWithRelations))
    knownEnds.set(currentId, newEnd)

    // Encolar las sucesoras de esta tarea
    for (const s of updatedRaw.successors) {
      const succId = (s as { successor: { id: string } }).successor.id
      if (!visited.has(succId)) queue.push(succId)
    }
  }

  revalidatePath("/gantt")
  return { updated }
}

/** Actualiza la cantidad de una tarea y recalcula sus horas y las de sus sucesoras */
export async function updateTaskQuantity(taskId: string, newQuantity: number) {
  await requireAuth()
  if (newQuantity < 1) throw new Error("La cantidad debe ser al menos 1")

  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new Error("Tarea no encontrada")

  const unitHours = task.unitEstimatedHours || 8
  const newTotalHours = unitHours * newQuantity

  // Propagar cambio de horas (esto recalculará la fecha fin y cascada)
  const { TimeEngine } = await import("@/lib/time-engine")
  const schedules = await prisma.workSchedule.findMany({ orderBy: { validFrom: "asc" } })
  const holidays = await prisma.holiday.findMany()
  const engine = new TimeEngine(schedules, holidays)

  const newEnd = engine.addBusinessHours(new Date(task.startDate), newTotalHours)

  // Actualizar cantidad y unitHours en este paso
  await prisma.task.update({
    where: { id: taskId },
    data: {
      quantity: newQuantity,
      estimatedHours: newTotalHours,
      endDate: newEnd
    }
  })

  // Lanzar cascada desde esta tarea para mover sucesoras si el fin cambió
  return await updateTaskDatesAndCascade(taskId, task.startDate, newEnd, newTotalHours)
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

  // 1. Obtener el padre anterior para limpiar la dependencia si existía
  const oldTask = await prisma.task.findUnique({
    where: { id: taskId },
    select: { parentId: true }
  })

  // 2. Actualizar el parentId
  await prisma.task.update({ where: { id: taskId }, data: { parentId } })

  // 3. Sincronizar Dependencia: El PADRE depende del HIJO ( taskId )
  // Si antes tenía padre, borramos esa relación de dependencia específica
  if (oldTask?.parentId) {
    await prisma.taskDependency.deleteMany({
      where: {
        successorId: oldTask.parentId,
        predecessorId: taskId
      }
    })
  }

  // Si ahora tiene nuevo padre, creamos la dependencia
  if (parentId) {
    await prisma.taskDependency.upsert({
      where: {
        predecessorId_successorId: {
          predecessorId: taskId,
          successorId: parentId
        }
      },
      create: {
        predecessorId: taskId,
        successorId: parentId
      },
      update: {} // No hay nada que actualizar si ya existe
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
  estimatedHours?: number
  unitEstimatedHours?: number
  quantity?: number
  materialId?: string
  materialQuantityPerUnit?: number
  unitTypeId?: string
}) {
  await requireAuth()
  const { assigneeIds, predecessorIds, materialId, materialQuantityPerUnit, unitTypeId, ...rest } = data
  const task = await prisma.task.create({
    data: {
      ...rest,
      assignees: assigneeIds?.length
        ? { create: assigneeIds.map(userId => ({ userId })) }
        : undefined,
      predecessors: predecessorIds?.length
        ? { create: predecessorIds.map(id => ({ predecessorId: id })) }
        : undefined,
      materials: materialId
        ? { create: [{ materialId, quantityPerUnit: materialQuantityPerUnit || 0, unitTypeId: unitTypeId || null }] }
        : undefined
    }
  })

  // Si tiene padre, vinculamos la dependencia: el PADRE depende de esta nueva tarea (HIJO)
  if (data.parentId) {
    await prisma.taskDependency.create({
      data: {
        predecessorId: task.id,
        successorId: data.parentId
      }
    })
  }

  // Desplazar tareas existentes +1 para insertar al inicio de la columna
  await prisma.task.updateMany({
    where: { projectId: data.projectId, stage: data.stage },
    data: { orderIndex: { increment: 1 } }
  })
  const updatedTask = await prisma.task.update({
    where: { id: task.id },
    data: { orderIndex: 0 },
    include: taskInclude
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


/** Obtiene un resumen de materiales para un proyecto o una tarea específica (agrupado por material) */
export async function getProjectMaterialsSummary(projectId: string, taskId?: string) {
  await requireAuth();

  // 1. Obtener todas las tareas del proyecto con sus materiales
  const allTasks = await prisma.task.findMany({
    where: { projectId },
    include: {
      materials: {
        include: {
          material: true,
          unitType: true
        }
      }
    }
  });

  // 2. Definir qué tareas incluir
  let targetTasks = allTasks;
  if (taskId) {
    const getBranchIds = (id: string): string[] => {
      const children = allTasks.filter(t => t.parentId === id);
      return [id, ...children.flatMap(c => getBranchIds(c.id))];
    };
    const branchIds = getBranchIds(taskId);
    targetTasks = allTasks.filter(t => branchIds.includes(t.id));
  }

  // 3. Agrupar por material
  const byMaterial: Record<string, {
    name: string;
    totalQty: number;
    unit: string;
    parts: { name: string; qtyPerUnit: number; pieceQty: number; total: number }[]
  }> = {};

  targetTasks.forEach(t => {
    t.materials.forEach(m => {
      if (!m.material) return;
      const key = m.material.name;
      if (!byMaterial[key]) {
        byMaterial[key] = {
          name: key,
          totalQty: 0,
          unit: m.unitType?.name || "uds",
          parts: []
        };
      }
      const qty = (t.quantity || 1) * (m.quantityPerUnit || 0);
      byMaterial[key].totalQty += qty;
      byMaterial[key].parts.push({
        name: t.name,
        qtyPerUnit: m.quantityPerUnit || 0,
        pieceQty: t.quantity || 1,
        total: qty
      });
    });
  });

  return Object.values(byMaterial);
}

export async function addMaterialToTask(data: {
  taskId: string;
  materialId: string;
  quantityPerUnit: number;
  unitTypeId: string | null;
}) {
  try {
    await requireAuth();
    const link = await prisma.taskMaterial.create({
      data: {
        taskId: data.taskId,
        materialId: data.materialId,
        quantityPerUnit: data.quantityPerUnit,
        unitTypeId: data.unitTypeId
      }
    });
    revalidatePath("/");
    return { success: true, link };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al añadir material." };
  }
}

export async function removeMaterialFromTask(linkId: string) {
  try {
    await requireAuth();
    await prisma.taskMaterial.delete({ where: { id: linkId } });
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al eliminar material." };
  }
}

/** Obtiene todos los materiales únicos registrados */
export async function getMaterials() {
  await requireAuth();
  return prisma.material.findMany({ orderBy: { name: "asc" } });
}

/** Obtiene todos los tipos de unidad registrados */
export async function getUnitTypes() {
  await requireAuth();
  return prisma.unitType.findMany({ orderBy: { name: "asc" } });
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
          { name: "Fabricación Taller", color: "#3b82f6", order: 1 },
          { name: "Ensambles Taller", color: "#a855f7", order: 2 },
          { name: "Terminado Taller", color: "#22c55e", order: 3 },
          { name: "Pedido Externo", color: "#ef4444", order: 4 },
          { name: "Entregado Externo", color: "#065f46", order: 5 }
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

export async function updateTaskIsAssembly(taskId: string, isAssembly: boolean) {
  await requireAdmin();
  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { isAssembly },
    include: taskInclude,
  });
  revalidatePath("/");
  return flattenTask(updated as unknown as PrismaTaskWithRelations);
}

/** Actualiza los días de entrega de un pedido externo */
export async function updateTaskDeliveryDays(taskId: string, deliveryDays: number) {
  await requireAuth();
  await prisma.task.update({ where: { id: taskId }, data: { deliveryDays } });
  revalidatePath("/gantt");
  revalidatePath("/kanban");
}
