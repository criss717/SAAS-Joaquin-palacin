"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { TimeEngine } from "@/lib/time-engine";
import type * as ExcelJS from "exceljs";
// ExcelJS se carga dinámicamente en las acciones que lo requieren para evitar pánicos de Turbopack
const NORM_STAGES: Record<string, string> = {
  "planeacion": "Planeación y Diseño",
  "diseño": "Planeación y Diseño",
  "diseno": "Planeación y Diseño",
  "pendiente": "Pendiente",
  "pedido": "Pedido Externo",
  "externo": "Pedido Externo",
  "taller": "Fabricación Taller",
  "fabricacion": "Fabricación Taller",
  "listo": "Listo",
  "terminado": "Listo"
};

function normalizeStageName(input: string): string {
  const low = (input || "").toLowerCase().trim();
  if (!low) return "Pendiente";
  for (const [key, val] of Object.entries(NORM_STAGES)) {
    if (low.includes(key)) return val;
  }
  return "Pendiente";
}

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

export async function updateMachine(id: string, name: string, description?: string) {
  try {
    await prisma.machineCatalog.update({
      where: { id },
      data: { name, description }
    });
    revalidatePath("/catalog");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al actualizar la máquina." };
  }
}

// -----------------------------------------------------
// MOTOR DE LANZAMIENTO A PRODUCCIÓN
// -----------------------------------------------------

export async function launchMachineToProject(machineId: string, projectName: string, startDate: Date) {
  try {
    const startAt = new Date(startDate);
    startAt.setHours(8, 0, 0, 0); // Ajustar inicio a las 08:00 AM del día elegido

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
        startDate: startAt,
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
    const projectStartDate = new Date(startAt);

    // Clonación Recursiva Helper
    async function clonePart(partId: string, parentTaskId?: string) {
      // Definir interfaces locales para Tipado Estricto de los resultados de Prisma
      interface CatalogOp { 
        name: string; 
        estimatedHours: number; 
        preferredStage?: string | null; 
      }
      interface CatalogPartWithOps {
        id: string;
        name: string;
        quantity: number;
        parentId: string | null;
        preferredStage?: string | null;
        operations: CatalogOp[];
      }

      const part = machine!.parts.find(p => p.id === partId) as CatalogPartWithOps | undefined;
      if (!part) return;

      const totalOpHours = part.operations.reduce((acc, op) => acc + (op.estimatedHours || 0), 0);
      const endDate = engine.addBusinessHours(projectStartDate, Math.max(8, totalOpHours)); 

      // Crear la Tarea/Ensamble
      const newTaskPart = await prisma.task.create({
        data: {
          name: part.name + (part.quantity > 1 ? ` (x${part.quantity})` : ""),
          projectId: project.id,
          parentId: parentTaskId,
          isAssembly: true,
          stage: part.preferredStage || "Pendiente",
          status: "EN_PROCESO", 
          startDate: projectStartDate,
          endDate: endDate,
          estimatedHours: totalOpHours || 8,
        }
      });
      
      partIdToTaskId.set(part.id, newTaskPart.id);

      // Clonar operaciones de esta pieza en cascada
      let opsStartDate = new Date(projectStartDate);
      for (const op of part.operations) {
        // Cálculo preciso mediante el motor
        const opsEndDate = engine.addBusinessHours(opsStartDate, op.estimatedHours || 8);

        await prisma.task.create({
          data: {
            name: op.name,
            projectId: project.id,
            parentId: newTaskPart.id,
            isAssembly: false, 
            stage: op.preferredStage || part.preferredStage || "Pendiente",
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

/**
 * IMPORTACIÓN MASIVA DESDE EXCEL (ExcelJS)
 */
export async function importMachineFromExcel(formData: FormData) {
  try {
    const file = formData.get("file") as File;
    if (!file) return { success: false, error: "No se proporcionó ningún archivo." };

    const arrayBuffer = await file.arrayBuffer();
    // Importación dinámica para aligerar la carga del servidor de desarrollo
    // Usamos typeof ExcelJS para evitar que el linter detecte un 'any'
    const exceljs: typeof ExcelJS = await import("exceljs");
    const workbook = new exceljs.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) return { success: false, error: "El Excel está vacío." };

    // 1. Obtener cabeceras y normalizar
    const headers: string[] = [];
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber] = cell.value?.toString().toLowerCase().trim() || "";
    });

    // 2. Crear la Máquina Plantilla
    const machine = await prisma.machineCatalog.create({
      data: { 
        name: file.name.replace(".xlsx", ""), 
        description: `Importado de Excel el ${new Date().toLocaleString()}` 
      }
    });

    // 3. Mapeo temporal para jerarquías y filas
    const rows: { nombre: string; cantidad: number; parentName: string; horas: number; etapa: string }[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const item: Record<string, ExcelJS.CellValue> = {};
      row.eachCell((cell, colNumber) => {
        const h = headers[colNumber];
        if (h) item[h] = cell.value;
      });

      const horasValue = item.horas;
      let horas = 0;
      if (horasValue && typeof horasValue === "object" && "result" in (horasValue as ExcelJS.CellFormulaValue)) {
        horas = Number((horasValue as ExcelJS.CellFormulaValue).result) || 0;
      } else {
        horas = Number(horasValue) || 0;
      }

      rows.push({
        nombre: item.nombre?.toString().trim() || "Sin nombre",
        cantidad: Number(item.cantidad) || 1,
        parentName: item["pertenece a ensamble"]?.toString().trim() || "",
        horas: horas,
        etapa: normalizeStageName(item["etapa inicial"]?.toString() || "")
      });
    });

    // 4. Primera pasada: Crear CatalogPart y guardar IDs por nombre
    const partNameToId = new Map<string, string>();
    for (const r of rows) {
      const part = await prisma.catalogPart.create({
        data: {
          name: r.nombre,
          machineId: machine.id,
          quantity: r.cantidad,
          preferredStage: r.etapa,
        }
      });
      partNameToId.set(r.nombre, part.id);

      // Crear operación por defecto "Fabricar [Nombre]"
      await prisma.catalogOperation.create({
        data: {
          name: `Fabricar ${r.nombre}`,
          partId: part.id,
          estimatedHours: r.horas > 0 ? r.horas : 8,
          preferredStage: r.etapa,
          orderIndex: 0
        }
      });
    }

    // 5. Segunda pasada: Vincular jerarquías
    for (const r of rows) {
      if (r.parentName && partNameToId.has(r.parentName)) {
        await prisma.catalogPart.update({
          where: { id: partNameToId.get(r.nombre) },
          data: { parentId: partNameToId.get(r.parentName) }
        });
      }
    }

    revalidatePath("/catalog");
    return { success: true, machine };
  } catch (error) {
    console.error("Excel Import Error:", error);
    return { success: false, error: "Error procesando el archivo Excel." };
  }
}

