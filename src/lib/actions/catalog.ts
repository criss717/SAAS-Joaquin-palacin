"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

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

    // 2. Crear el Proyecto Base y sus Etapas Kanban estándar
    const project = await prisma.project.create({
      data: {
        name: projectName,
        stage: "Planeación",
        stages: {
          create: [
            { name: "Planeación", color: "#f59e0b", order: 0 },
            { name: "Pendiente", color: "#94a3b8", order: 1 },
            { name: "En Proceso", color: "#3b82f6", order: 2 },
            { name: "Listo", color: "#22c55e", order: 3 },
          ]
        }
      }
    });

    // 3. Diccionario temporal para mapear IDs originales de CatalogPart a los nuevos IDs de Task
    const partIdToTaskId = new Map<string, string>();
    const today = new Date();
    today.setHours(8, 0, 0, 0); // Inicio estándar a las 08:00 AM

    // Clonación Recursiva Helper
    async function clonePart(partId: string, parentTaskId?: string) {
      const part = machine!.parts.find(p => p.id === partId);
      if (!part) return;

      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 5); // Estimado básico para ensambles

      // Crear la Tarea/Ensamble
      const newTaskPart = await prisma.task.create({
        data: {
          name: part.name + (part.quantity > 1 ? ` (x${part.quantity})` : ""),
          projectId: project.id,
          parentId: parentTaskId,
          isAssembly: true,
          stage: "Pendiente",
          status: "EN_PROCESO", // Estado inicial
          progress: 0,
          startDate: today,
          endDate: endDate,
        }
      });
      
      partIdToTaskId.set(part.id, newTaskPart.id);

      // Clonar operaciones de esta pieza
      let opsStartDate = new Date(today);
      for (const op of part.operations) {
        const opsEndDate = new Date(opsStartDate);
        opsEndDate.setDate(opsEndDate.getDate() + Math.max(1, op.estimatedDays));

        await prisma.task.create({
          data: {
            name: op.name,
            projectId: project.id,
            parentId: newTaskPart.id,
            isAssembly: false, // ¡Es mano de obra!
            stage: "Pendiente",
            status: "EN_PROCESO",
            progress: 0,
            startDate: new Date(opsStartDate),
            endDate: new Date(opsEndDate),
          }
        });
        
        // La siguiente operación empieza cuando termina esta (cascada simple)
        opsStartDate = new Date(opsEndDate);
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
