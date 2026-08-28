"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { TimeEngine } from "@/lib/time-engine";
import { addCalendarDays } from "@/lib/external-calendar";

async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("No autorizado: debes iniciar sesión");
  return session;
}

async function requireAdmin() {
  const session = await requireAuth();
  if (session.user.role !== "ADMIN") {
    throw new Error("No autorizado: se requiere rol de administrador");
  }
  return session;
}

/**
 * Normaliza una fecha o string YYYY-MM-DD a las 12:00:00 UTC (medio día)
 * para evitar desplazamientos por huso horario (ej: UTC en Docker vs UTC+2 en navegador).
 */
function normalizeDateToMidday(val: Date | string): Date {
  if (typeof val === "string") {
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12, 0, 0));
    }
  }
  const d = new Date(val);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
}

/**
 * Recalcula automáticamente todas las tareas activas de taller (no terminadas ni canceladas)
 * de uno o todos los proyectos cuando se actualiza el calendario laboral (horarios, turnos, festivos o horas extras).
 */
export async function recalculateActiveProjectSchedules(targetProjectId?: string) {
  try {
    const schedules = await prisma.workSchedule.findMany({ orderBy: { validFrom: "asc" } });
    const holidays = await prisma.holiday.findMany();
    const engine = new TimeEngine(schedules, holidays);

    // 1. Obtener proyectos a recalcular
    const projects = targetProjectId
      ? await prisma.project.findMany({ where: { id: targetProjectId } })
      : await prisma.project.findMany();

    let totalUpdated = 0;

    for (const project of projects) {
      // 2. Cargar todas las tareas del proyecto con sus relaciones de dependencia
      const allTasks = await prisma.task.findMany({
        where: { projectId: project.id },
        include: {
          predecessors: {
            include: { predecessor: { select: { id: true, endDate: true, status: true, stage: true } } }
          },
          successors: {
            include: { successor: { select: { id: true } } }
          }
        },
        orderBy: { orderIndex: "asc" }
      });

      if (allTasks.length === 0) continue;

      // Mapa para rastrear las fechas efectivas de fin (originales o recalculadas)
      const effectiveEndDates = new Map<string, Date>();
      const effectiveStartDates = new Map<string, Date>();
      allTasks.forEach(t => {
        effectiveEndDates.set(t.id, new Date(t.endDate));
        effectiveStartDates.set(t.id, new Date(t.startDate));
      });

      // 3. Ordenamiento topológico (Kahn's Algorithm) para resolver en orden de dependencias
      const inDegree = new Map<string, number>();
      const taskMap = new Map<string, typeof allTasks[0]>();
      allTasks.forEach(t => {
        taskMap.set(t.id, t);
        inDegree.set(t.id, t.predecessors.length);
      });

      const queue: string[] = [];
      allTasks.forEach(t => {
        if (t.predecessors.length === 0) queue.push(t.id);
      });

      const orderedTaskIds: string[] = [];
      while (queue.length > 0) {
        const id = queue.shift()!;
        orderedTaskIds.push(id);
        const t = taskMap.get(id);
        if (t) {
          t.successors.forEach(s => {
            const succId = s.successor.id;
            const currentDegree = inDegree.get(succId) || 0;
            const newDegree = currentDegree - 1;
            inDegree.set(succId, newDegree);
            if (newDegree === 0) {
              queue.push(succId);
            }
          });
        }
      }

      // Añadir cualquier tarea restante (en caso de islas o ciclos no detectados)
      allTasks.forEach(t => {
        if (!orderedTaskIds.includes(t.id)) orderedTaskIds.push(t.id);
      });

      // 4. Recalcular cada tarea activa en orden topológico
      for (const taskId of orderedTaskIds) {
        const task = taskMap.get(taskId);
        if (!task) continue;

        // Omitir tareas ya terminadas o canceladas
        const isDone = task.status === "HECHO" ||
          task.stage.toLowerCase().includes("terminado") ||
          task.stage.toLowerCase().includes("entregado") ||
          task.status === "CANCELADO";

        if (isDone) continue;

        const isExternal = (task.deliveryDays || 0) > 0 ||
          task.stage === "Pedido Externo" ||
          task.stage === "Entregado Externo";

        // Los pedidos externos NO dependen del calendario ni turnos de taller: se conservan intactos
        if (isExternal) {
          effectiveStartDates.set(task.id, new Date(task.startDate));
          effectiveEndDates.set(task.id, new Date(task.endDate));
          continue;
        }

        // Determinar fecha de inicio para tareas de taller
        let newStart: Date;
        if (task.predecessors.length > 0) {
          // Tomar la fecha de fin más tardía de todas sus predecesoras
          let maxPredEnd: Date | null = null;
          for (const p of task.predecessors) {
            const predEnd = effectiveEndDates.get(p.predecessor.id) ?? new Date(p.predecessor.endDate);
            if (!maxPredEnd || predEnd.getTime() > maxPredEnd.getTime()) {
              maxPredEnd = predEnd;
            }
          }

          if (maxPredEnd) {
            newStart = engine.getNextAvailableWorkingSlot(maxPredEnd);
          } else {
            newStart = engine.getNextAvailableWorkingSlot(new Date(task.startDate));
          }
        } else {
          // Tarea raíz sin predecesoras: alinear al primer slot laborable
          newStart = engine.getNextAvailableWorkingSlot(new Date(task.startDate));
        }

        // Determinar fecha de fin según motor laboral
        const hours = task.estimatedHours && task.estimatedHours > 0 ? task.estimatedHours : 8;
        const newEnd = engine.addBusinessHours(newStart, hours);

        effectiveStartDates.set(task.id, newStart);
        effectiveEndDates.set(task.id, newEnd);

        const origStart = new Date(task.startDate);
        const origEnd = new Date(task.endDate);

        // Solo actualizar en BD si cambiaron significativamente (> 1 minuto)
        if (Math.abs(newStart.getTime() - origStart.getTime()) >= 60_000 ||
            Math.abs(newEnd.getTime() - origEnd.getTime()) >= 60_000) {
          await prisma.task.update({
            where: { id: task.id },
            data: { startDate: newStart, endDate: newEnd }
          });
          totalUpdated++;
        }
      }
    }

    revalidatePath("/");
    revalidatePath("/gantt");
    revalidatePath("/admin/schedule");
    return { success: true, updatedTasks: totalUpdated };
  } catch (error) {
    console.error("Error recalculating active project schedules:", error);
    return { success: false, error: "Error al recalcular las fechas de los proyectos." };
  }
}

/**
 * Acción server pública para disparar la recalculación manual de horarios desde UI.
 */
export async function recalculateActiveProjectSchedulesAction(targetProjectId?: string) {
  await requireAuth();
  return await recalculateActiveProjectSchedules(targetProjectId);
}

// ----------------- GESTIÓN DE HORARIOS / TEMPORADAS -----------------

export async function getWorkSchedules() {
  return await prisma.workSchedule.findMany({
    orderBy: { validFrom: "asc" },
  });
}

export async function upsertWorkSchedule(data: {
  id?: string;
  name: string;
  validFrom: Date | string;
  validUntil: Date | string;
  workingDays: number[];
  shifts: { start: string; end: string }[];
}) {
  try {
    await requireAdmin();

    const vf = normalizeDateToMidday(data.validFrom);
    const vu = normalizeDateToMidday(data.validUntil);

    // Para la validación de solapamiento en BD
    const queryVf = new Date(vf);
    queryVf.setUTCHours(0, 0, 0, 0);
    const queryVu = new Date(vu);
    queryVu.setUTCHours(23, 59, 59, 999);

    // 1. Validar solapamiento: solo rechazar si hay otra temporada con los MISMOS días en el mismo rango de fechas
    const existing = await prisma.workSchedule.findMany({
      where: {
        id: data.id ? { not: data.id } : undefined,
        validFrom: { lte: queryVu },
        validUntil: { gte: queryVf }
      }
    });

    const newDays = new Set(data.workingDays);
    const conflicting = existing.filter(s => {
      const existingDays = JSON.parse(s.workingDays) as number[];
      return existingDays.some((d: number) => newDays.has(d));
    });

    if (conflicting.length > 0) {
      const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
      const sharedDays = [...newDays].filter((d: number) => {
        const existingDays = JSON.parse(conflicting[0].workingDays) as number[];
        return existingDays.includes(d);
      });
      const dayNames = sharedDays.map((d: number) => days[d]).join(", ");
      return { success: false, error: `Los días ${dayNames} ya están cubiertos por "${conflicting[0].name}" en ese rango de fechas.` };
    }

    const payload = {
      name: data.name,
      validFrom: vf,
      validUntil: vu,
      workingDays: JSON.stringify(data.workingDays),
      shifts: JSON.stringify(data.shifts),
    };

    if (data.id) {
      await prisma.workSchedule.update({
        where: { id: data.id },
        data: payload,
      });
    } else {
      await prisma.workSchedule.create({
        data: payload,
      });
    }

    // Recalcular automáticamente todas las tareas activas de taller con el nuevo horario
    await recalculateActiveProjectSchedules();

    revalidatePath("/admin/schedule");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al guardar el horario." };
  }
}

export async function deleteWorkSchedule(id: string) {
  try {
    await requireAdmin();
    await prisma.workSchedule.delete({ where: { id } });

    // Recalcular automáticamente proyectos tras eliminar horario
    await recalculateActiveProjectSchedules();

    revalidatePath("/admin/schedule");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al eliminar el horario." };
  }
}

// ----------------- GESTIÓN DE FESTIVOS -----------------

export async function getHolidays() {
  return await prisma.holiday.findMany({
    orderBy: { startDate: "asc" },
  });
}

export async function createHoliday(name: string, startDate: Date | string, endDate?: Date | string) {
  try {
    await requireAdmin();
    const s = normalizeDateToMidday(startDate);
    const e = endDate ? normalizeDateToMidday(endDate) : normalizeDateToMidday(startDate);

    await prisma.holiday.create({
      data: { 
        name, 
        startDate: s, 
        endDate: e 
      },
    });

    // Recalcular automáticamente proyectos con el nuevo festivo
    await recalculateActiveProjectSchedules();

    revalidatePath("/admin/schedule");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al crear el festivo." };
  }
}

export async function createHolidayBatch(name: string, dates: { start: Date | string; end?: Date | string }[]) {
  try {
    await requireAdmin();
    
    await prisma.holiday.createMany({
      data: dates.map(d => {
        const s = normalizeDateToMidday(d.start);
        const e = d.end ? normalizeDateToMidday(d.end) : normalizeDateToMidday(d.start);
        return { name, startDate: s, endDate: e };
      })
    });

    // Recalcular automáticamente proyectos con los nuevos festivos
    await recalculateActiveProjectSchedules();
    
    revalidatePath("/admin/schedule");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al crear los festivos." };
  }
}

export async function deleteHoliday(id: string) {
  try {
    await requireAdmin();
    await prisma.holiday.delete({ where: { id } });

    // Recalcular automáticamente proyectos tras eliminar festivo
    await recalculateActiveProjectSchedules();

    revalidatePath("/admin/schedule");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al eliminar el festivo." };
  }
}
