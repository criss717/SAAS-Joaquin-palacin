"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { TimeEngine } from "@/lib/time-engine";

export async function getMachines() {
  return await prisma.machineCatalog.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { parts: true },
      },
    },
  });
}

export async function createMachine(name: string, description?: string) {
  try {
    const machine = await prisma.machineCatalog.create({
      data: { name, description },
    });
    revalidatePath("/catalog");
    return { success: true, machine };
  } catch (error: unknown) {
    console.error("Error creating machine:", error);
    return { success: false, error: "Error al crear la máquina." };
  }
}

export async function deleteMachine(id: string) {
  try {
    await prisma.machineCatalog.delete({ where: { id } });
    revalidatePath("/catalog");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al eliminar la máquina." };
  }
}

// -----------------------------------------------------
// MOTOR DE LANZAMIENTO A PRODUCCIÓN
// -----------------------------------------------------

export async function launchMachineToProject(machineId: string, projectName: string) {
  try {
    // 1. Cargar toda la máquina con sus piezas y operaciones
    const machine = await prisma.machineCatalog.findUnique({
      where: { id: machineId },
      include: {
        parts: {
          include: {
            operations: { orderBy: { orderIndex: "asc" } }
          }
        }
      }
    });

    if (!machine) return { success: false, error: "Máquina no encontrada." };

    // 2. Obtener configuración de horarios y festivos
    let schedules = await prisma.workSchedule.findMany({ orderBy: { validFrom: "asc" } });
    const holidays = await prisma.holiday.findMany();

    // Si no hay horarios definidos, crear uno básico por defecto (8 a 14 y 16 a 18)
    if (schedules.length === 0) {
      const defaultSchedule = await prisma.workSchedule.create({
        data: {
          name: "Horario General (Default)",
          validFrom: new Date("2020-01-01"),
          validUntil: new Date("2050-12-31"),
          workingDays: "[1,2,3,4,5]",
          shifts: JSON.stringify([{ start: "08:00", end: "14:00" }, { start: "16:00", end: "18:00" }])
        }
      });
      schedules = [defaultSchedule];
    }

    // Inicializar Motor de Tiempo
    const engine = new TimeEngine(schedules, holidays);

    // 3. Crear el Proyecto Base y sus Etapas Kanban estándar
    const project = await prisma.project.create({
      data: {
        name: projectName,
        stage: "Planeación y Diseño",
        stages: {
          create: [
            { name: "Planeación y Diseño", color: "#f59e0b", order: 0 },
            { name: "Pendiente", color: "#94a3b8", order: 1 },
            { name: "Pedido Externo", color: "#8b5cf6", order: 2 },
            { name: "Fabricación Taller", color: "#3b82f6", order: 3 },
            { name: "Listo", color: "#22c55e", order: 4 },
          ]
        }
      }
    });

    // 4. Diccionario temporal para mapear IDs originales de CatalogPart a los nuevos IDs de Task
    const partIdToTaskId = new Map<string, string>();
    const today = new Date();
    today.setHours(8, 0, 0, 0); // Inicio estándar a las 08:00 AM

    // Clonación Recursiva Helper
    async function clonePart(partId: string, parentTaskId?: string) {
      const part = machine!.parts.find(p => p.id === partId);
      if (!part) return;

      // Un ensamble no tiene "horas estimadas" per se en el catálogo, pero podemos 
      // sumar las horas de sus operaciones o poner un default.
      const totalOpHours = (part.operations as { estimatedHours: number }[]).reduce((acc, op) => acc + (op.estimatedHours || 0), 0);
      const endDate = engine.addBusinessHours(today, Math.max(8, totalOpHours)); 

      // Crear la Tarea/Ensamble
      const newTaskPart = await prisma.task.create({
        data: {
          name: part.name + (part.quantity > 1 ? ` (x${part.quantity})` : ""),
          projectId: project.id,
          parentId: parentTaskId,
          isAssembly: true,
          stage: "Pendiente",
          status: "EN_PROCESO", 
          progress: 0,
          startDate: today,
          endDate: endDate,
          estimatedHours: totalOpHours || 8,
        }
      });
      
      partIdToTaskId.set(part.id, newTaskPart.id);

      // Clonar operaciones de esta pieza
      let opsStartDate = new Date(today);
      for (const opRaw of part.operations) {
        const op = opRaw as { name: string; estimatedHours: number };
        // Cálculo preciso mediante el motor
        const opsEndDate = engine.addBusinessHours(opsStartDate, op.estimatedHours || 8);

        await prisma.task.create({
          data: {
            name: op.name,
            projectId: project.id,
            parentId: newTaskPart.id,
            isAssembly: false, 
            stage: "Pendiente",
            status: "EN_PROCESO",
            progress: 0,
            startDate: opsStartDate,
            endDate: opsEndDate,
            estimatedHours: op.estimatedHours,
          }
        });
        
        // La siguiente operación empieza cuando termina esta (cascada simple)
        opsStartDate = opsEndDate;
      }

      // Clonar piezas hijas recursivamente
      const subParts = machine!.parts.filter(p => p.parentId === part.id);
      for (const sp of subParts) {
        await clonePart(sp.id, newTaskPart.id);
      }
    }

    // Identificar piezas raíz (sin padre) y disparar recursividad
    const rootParts = machine.parts.filter(p => !p.parentId);
    for (const rp of rootParts) {
      await clonePart(rp.id);
    }

    const cookieStore = await cookies();
    cookieStore.set("activeProjectId", project.id, { path: "/", maxAge: 60 * 60 * 24 * 30 });

    revalidatePath("/");
    revalidatePath("/gantt");
    return { success: true, projectId: project.id };
  } catch (error) {
    console.error("Error launching project:", error);
    return { success: false, error: "Error interno al clonar máquina a producción." };
  }
}
