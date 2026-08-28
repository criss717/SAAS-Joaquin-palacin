"use server";

import prisma from "@/lib/prisma";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { addCalendarDays } from "@/lib/external-calendar";

export async function setActiveProjectCookie(projectId: string) {
  const cookieStore = await cookies();
  cookieStore.set("activeProjectId", projectId, { path: "/", maxAge: 60 * 60 * 24 * 30 }); // 30 días
  revalidatePath("/");
  revalidatePath("/gantt");
  return { success: true };
}

export async function createEmptyProject(name: string, startDate: Date) {
  try {
    const project = await prisma.project.create({
      data: {
        name,
        startDate: new Date(startDate),
        stage: "Planeación y Diseño",
        stages: {
          create: [
            { name: "Planeación y Diseño", color: "#f59e0b", order: 0 },
            { name: "Fabricación Taller", color: "#3b82f6", order: 1 },
            { name: "Ensambles Taller", color: "#a855f7", order: 2 },
            { name: "Terminado Taller", color: "#22c55e", order: 3 },
            { name: "Pedido Externo", color: "#ef4444", order: 4 },
            { name: "Entregado Externo", color: "#065f46", order: 5 }
          ],
        },
      },
    });

    // Cambiar automáticamente la cookie al proyecto recién creado
    const cookieStore = await cookies();
    cookieStore.set("activeProjectId", project.id, { path: "/", maxAge: 60 * 60 * 24 * 30 });

    revalidatePath("/");
    revalidatePath("/gantt");
    return { success: true, project };
  } catch (error) {
    console.error("Error creating empty project:", error);
    return { success: false, error: "Error al crear el proyecto vacío." };
  }
}

export async function deleteProjectAction(projectId: string) {
  try {
    await prisma.project.delete({ where: { id: projectId } });

    const cookieStore = await cookies();
    if (cookieStore.get("activeProjectId")?.value === projectId) {
      cookieStore.delete("activeProjectId");
    }

    revalidatePath("/");
    revalidatePath("/gantt");
    return { success: true };
  } catch (error) {
    console.error("Error deleting project:", error);
    return { success: false, error: "Error al eliminar el proyecto." };
  }
}

export async function updateProjectAction(projectId: string, name: string) {
  try {
    await prisma.project.update({
      where: { id: projectId },
      data: { name },
    });
    revalidatePath("/");
    revalidatePath("/gantt");
    return { success: true };
  } catch (error) {
    console.error("Error updating project:", error);
    return { success: false, error: "Error al actualizar el proyecto." };
  }
}

/**
 * DESPLAZAMIENTO INTELIGENTE DE PROYECTO
 * Desplaza todas las tareas (que no tengan progreso ni estén terminadas)
 * según el delta de horas laborales entre la fecha de inicio antigua y la nueva.
 */
export async function shiftProjectDates(projectId: string, newStartDate: Date) {
  const { TimeEngine } = await import("@/lib/time-engine");

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { tasks: true }
    });

    if (!project) return { success: false, error: "Proyecto no encontrado." };

    const oldStart = new Date(project.startDate);
    const newStartRaw = new Date(newStartDate);
    // Forzar 08:00 AM para el inicio del proyecto
    newStartRaw.setHours(8, 0, 0, 0);

    // 1. Obtener motor de tiempo
    const schedules = await prisma.workSchedule.findMany({ orderBy: { validFrom: "asc" } });
    const holidays = await prisma.holiday.findMany();
    const engine = new TimeEngine(schedules, holidays);

    // 2. Normalizar el propio inicio del proyecto y calcular delta
    const newStart = engine.getNextAvailableWorkingSlot(newStartRaw);
    const isForward = newStart >= oldStart;
    const absDeltaHours = isForward
      ? engine.calculateBusinessHours(oldStart, newStart)
      : engine.calculateBusinessHours(newStart, oldStart);

    const deltaHours = isForward ? absDeltaHours : -absDeltaHours;

    if (deltaHours === 0 && newStart.getTime() === oldStart.getTime()) {
      return { success: true, movedTasks: 0 };
    }

    // 3. Actualizar tareas elegibles (status != HECHO y progress == 0)
    let movedCount = 0;
    const tasksToUpdate = project.tasks.filter(t => t.status !== "HECHO" && t.progress === 0);

    await prisma.$transaction(
      tasksToUpdate.map(t => {
        const oldTaskStart = new Date(t.startDate);
        const oldTaskEnd = new Date(t.endDate);

        let newTaskStart: Date;
        let newTaskEnd: Date;

        if (deltaHours >= 0) {
          // Desplazar inicio
          newTaskStart = engine.getNextAvailableWorkingSlot(engine.addBusinessHours(oldTaskStart, deltaHours));

          if ((t.deliveryDays || 0) > 0) {
            // Pedido externo: usa calendario genérico de proveedores (sin agosto)
            newTaskEnd = addCalendarDays(newTaskStart, t.deliveryDays!);
          } else {
            // Fabricación/Otros: Desplazar fin por el mismo delta y normalizarlo
            newTaskEnd = engine.getNextAvailableWorkingSlot(engine.addBusinessHours(oldTaskEnd, deltaHours));
          }
        } else {
          // Para retroceder, usamos desplazamiento por milisegundos y normalizamos el resultado
          const diffMs = newStart.getTime() - oldStart.getTime();
          newTaskStart = engine.getNextAvailableWorkingSlot(new Date(oldTaskStart.getTime() + diffMs));
          newTaskEnd = engine.getNextAvailableWorkingSlot(new Date(oldTaskEnd.getTime() + diffMs));
        }

        movedCount++;
        return prisma.task.update({
          where: { id: t.id },
          data: {
            startDate: newTaskStart,
            endDate: newTaskEnd
          }
        });
      })
    );

    // 4. Actualizar fecha del proyecto
    await prisma.project.update({
      where: { id: projectId },
      data: { startDate: newStart }
    });

    console.log(`[ShiftProject] Successfully moved ${movedCount} tasks for project ${projectId}`);

    // Única revalidación al final para evitar timeouts/input stream errors
    revalidatePath("/", "layout");

    return { success: true, movedTasks: movedCount };
  } catch (error) {
    console.error("Error shifting project:", error);
    return { success: false, error: "Error al desplazar las fechas del proyecto. Por favor, refresca e intenta de nuevo." };
  }
}
