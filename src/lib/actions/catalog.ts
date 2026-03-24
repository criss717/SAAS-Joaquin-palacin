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
  "piezas": "Piezas / Accesorios",
  "accesorios": "Piezas / Accesorios",
  "pendiente": "Piezas / Accesorios",
  "pedido": "Pedido Externo",
  "externo": "Pedido Externo",
  "proveedor": "Pedido Externo",
  "taller": "Fabricación Taller",
  "fabricacion": "Fabricación Taller",
  "ensambles": "Ensambles",
  "ensamble": "Ensambles",
  "listo": "Listo",
  "terminado": "Listo"
};

function normalizeStageName(input: string): string {
  const low = (input || "").toLowerCase().trim();
  if (!low) return "Piezas / Accesorios";
  for (const [key, val] of Object.entries(NORM_STAGES)) {
    if (low.includes(key)) return val;
  }
  return "Piezas / Accesorios";
}

export async function getMachines() {
  return await prisma.machineCatalog.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      parts: {
        select: { name: true }
      },
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
            { name: "Ensambles", color: "#a855f7", order: 1 },
            { name: "Piezas / Accesorios", color: "#9ca3af", order: 2 },
            { name: "Pedido Externo", color: "#ef4444", order: 3 },
            { name: "Fabricación Taller", color: "#3b82f6", order: 4 },
            { name: "Listo", color: "#22c55e", order: 5 },
          ]
        }
      }
    });

    // 4. Diccionario temporal para mapear IDs originales de CatalogPart a los nuevos IDs de Task
    const partIdToTaskId = new Map<string, string>();
    const projectStartDate = new Date(startAt);

    // Helper para obtener horas totales recursivas de una pieza (operaciones propias + hijas)
    function getRecursiveHours(pId: string): number {
      const part = machine!.parts.find(p => p.id === pId);
      if (!part) return 0;
      
      const directOpsHours = part.operations.reduce((acc, op) => acc + (op.estimatedHours || 0), 0);
      const childrenParts = machine!.parts.filter(p => p.parentId === pId);
      const childrenHours = childrenParts.reduce((acc, child) => acc + getRecursiveHours(child.id), 0);
      
      return directOpsHours + childrenHours;
    }

    // Identificar qué piezas son "Ensambles Reales" (tienen sub-piezas)
    const parentPartIds = new Set(machine.parts.map(p => p.parentId).filter(Boolean));

    // Clonación Recursiva Helper
    async function clonePart(partId: string, parentTaskId?: string) {
      // Definir interfaces locales para Tipado Estricto
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
        deliveryDays?: number | null;
        operations: CatalogOp[];
      }

      const part = machine!.parts.find(p => p.id === partId) as CatalogPartWithOps | undefined;
      if (!part) return;

      // Cálculo de horas para este nodo (Ensambles suman recursivamente, piezas simples usan sus operaciones)
      const isAssembly = parentPartIds.has(part.id);
      const totalHoursForThisPart = isAssembly ? getRecursiveHours(part.id) : part.operations.reduce((acc, op) => acc + (op.estimatedHours || 0), 0);
      
      // Cálculo de Fechas
      const isExternal = part.preferredStage === "Pedido Externo";
      let taskEndDate: Date;
      let finalEstimatedHours = totalHoursForThisPart || 8;

      if (isExternal && (part.deliveryDays || 0) > 0) {
        // Para pedido externo: fecha fin por calendario natural
        taskEndDate = new Date(new Date(projectStartDate).setDate(new Date(projectStartDate).getDate() + (part.deliveryDays || 0)));
        // Pero las horas estimadas deben ser las laborables en ese periodo
        finalEstimatedHours = engine.calculateBusinessHours(projectStartDate, taskEndDate);
      } else {
        // Para fabricación: fecha fin por motor de tiempo (horas laborables)
        taskEndDate = engine.addBusinessHours(projectStartDate, Math.max(1, finalEstimatedHours));
      }

      // Crear la Tarea/Ensamble
      const newTaskPart = await prisma.task.create({
        data: {
          name: part.name + (part.quantity > 1 ? ` (x${part.quantity})` : ""),
          projectId: project.id,
          parentId: parentTaskId,
          isAssembly: isAssembly,
          stage: part.preferredStage || "Pendiente",
          status: "EN_PROCESO", 
          startDate: projectStartDate,
          endDate: taskEndDate,
          estimatedHours: finalEstimatedHours,
          deliveryDays: part.deliveryDays || 0,
        }
      });
      
      partIdToTaskId.set(part.id, newTaskPart.id);

      // Clonar operaciones de esta pieza en cascada
      let opsStartDate = new Date(projectStartDate);
      for (const op of part.operations) {
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
            estimatedHours: op.estimatedHours || 8,
          }
        });
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
    const rows: { nombre: string; cantidad: number; parentName: string; horas: number; etapa: string; plazo: number }[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const item: Record<string, ExcelJS.CellValue> = {};
      row.eachCell((cell, colNumber) => {
        const h = headers[colNumber];
        if (h) item[h] = cell.value;
      });

      const horasValue = item.horas || item["horas-unidad"] || item["horas unidad"];
      let horas = 0;
      if (horasValue && typeof horasValue === "object" && "result" in (horasValue as ExcelJS.CellFormulaValue)) {
        horas = Number((horasValue as ExcelJS.CellFormulaValue).result) || 0;
      } else {
        horas = Number(horasValue) || 0;
      }

      const plazoValue = item["plazo-entrega-dias"] || item["plazo entrega dias"] || item["plazo entrega"];
      const plazo = Number(plazoValue) || 1;

      rows.push({
        nombre: item.nombre?.toString().trim() || "Sin nombre",
        cantidad: Number(item.cantidad) || 1,
        parentName: item["pertenece a ensamble"]?.toString().trim() || "",
        horas: horas,
        etapa: normalizeStageName(item["etapa inicial"]?.toString() || ""),
        plazo: plazo > 0 ? plazo : 1
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
          preferredStage: r.etapa === "Pedido Externo" ? "Pedido Externo" : "Piezas / Accesorios",
          deliveryDays: r.etapa === "Pedido Externo" ? r.plazo : 0,
        }
      });
      // Guardamos la clave en minúsculas para comparaciones robustas
      partNameToId.set(r.nombre.toLowerCase(), part.id);

      // Crear operación por defecto solo si NO es "Pedido Externo"
      if (r.etapa !== "Pedido Externo") {
        await prisma.catalogOperation.create({
          data: {
            name: `Fabricar ${r.nombre}${r.cantidad > 1 ? ` (x${r.cantidad})` : ''}`,
            partId: part.id,
            // Las horas de fabricación se multiplican por la cantidad
            estimatedHours: Math.max(0.5, r.horas * r.cantidad), 
            preferredStage: "Fabricación Taller",
            orderIndex: 0
          }
        });
      }
    }

    // 5. Segunda pasada: Vincular jerarquías (con búsqueda insensible a mayúsculas)
    for (const r of rows) {
      if (r.parentName) {
        const parentKey = r.parentName.toLowerCase();
        if (partNameToId.has(parentKey)) {
          const childId = partNameToId.get(r.nombre.toLowerCase());
          const parentId = partNameToId.get(parentKey);
          
          await prisma.catalogPart.update({
            where: { id: childId },
            data: { parentId: parentId }
          });

          // Si una pieza tiene hijos, la convertimos automáticamente en Ensamble
          await prisma.catalogPart.update({
            where: { id: parentId },
            data: { preferredStage: "Ensambles" }
          });
        }
      }
    }

  revalidatePath("/catalog");
    return { success: true, machine };
  } catch (error) {
    console.error("Excel Import Error:", error);
    return { success: false, error: "Error procesando el archivo Excel." };
  }
}

/**
 * CLONAR MÁQUINA (Clonación profunda de despiece)
 */
export async function cloneMachine(machineId: string) {
  try {
    // 1. Obtener la máquina original con todo su despiece
    const original = await prisma.machineCatalog.findUnique({
      where: { id: machineId },
      include: {
        parts: {
          include: {
            operations: true
          }
        }
      }
    });

    if (!original) return { success: false, error: "Máquina no encontrada." };

    // 2. Crear la nueva máquina (cabecera)
    const newMachine = await prisma.machineCatalog.create({
      data: {
        name: `${original.name} (copia)`,
        description: original.description ? `${original.description} (Copia de ${original.name})` : null
      }
    });

    // 3. Diccionario para mapear IDs antiguos a nuevos para mantener jerarquía
    const oldIdToNewId = new Map<string, string>();

    // 4. Clonación Recursiva de Piezas
    async function clonePartRecursive(oldPartId: string, newParentId: string | null) {
      const part = original!.parts.find(p => p.id === oldPartId);
      if (!part) return;

      // Crear nueva pieza
      const newPart = await prisma.catalogPart.create({
        data: {
          name: part.name,
          quantity: part.quantity,
          preferredStage: part.preferredStage,
          deliveryDays: part.deliveryDays,
          machineId: newMachine.id,
          parentId: newParentId,
        }
      });

      oldIdToNewId.set(part.id, newPart.id);

      // Clonar operaciones de esta pieza
      for (const op of part.operations) {
        await prisma.catalogOperation.create({
          data: {
            name: op.name,
            estimatedHours: op.estimatedHours,
            preferredStage: op.preferredStage,
            orderIndex: op.orderIndex,
            partId: newPart.id,
          }
        });
      }

      // Clonar hijos recursivamente
      const children = original!.parts.filter(p => p.parentId === oldPartId);
      for (const child of children) {
        await clonePartRecursive(child.id, newPart.id);
      }
    }

    // 5. Iniciar clonación desde las piezas raíz
    const rootParts = original.parts.filter(p => !p.parentId);
    for (const rp of rootParts) {
      await clonePartRecursive(rp.id, null);
    }

    revalidatePath("/catalog");
    return { success: true, machine: newMachine };
  } catch (error) {
    console.error("Error cloning machine:", error);
    return { success: false, error: "Error al clonar la máquina." };
  }
}

