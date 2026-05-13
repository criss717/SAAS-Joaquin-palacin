"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { TimeEngine } from "@/lib/time-engine";
import { addExternalDays, addCalendarDays } from "@/lib/external-calendar";

async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("No autorizado: debes iniciar sesión");
  return session;
}

async function requireAdmin() {
  const session = await requireAuth();
  if (session.user.role !== "ADMIN") throw new Error("Se requiere rol de Administrador");
  return session;
}
import type * as ExcelJS from "exceljs";
// ExcelJS se carga dinámicamente en las acciones que lo requieren para evitar pánicos de Turbopack
const NORM_STAGES: Record<string, string> = {
  "planeacion": "Planeación y Diseño",
  "diseño": "Planeación y Diseño",
  "diseno": "Planeación y Diseño",
  "piezas": "Fabricación Taller",
  "accesorios": "Fabricación Taller",
  "pendiente": "Fabricación Taller",
  "pedido": "Pedido Externo",
  "externo": "Pedido Externo",
  "proveedor": "Pedido Externo",
  "taller": "Fabricación Taller",
  "fabricacion": "Fabricación Taller",
  "ensambles": "Ensambles Taller",
  "ensamble": "Ensambles Taller",
  "terminado": "Terminado Taller",
  "entregado": "Entregado Externo",
  "listo": "Terminado Taller"
};

function normalizeStageName(input: string): string {
  const low = (input || "").toLowerCase().trim();
  if (!low) return "Fabricación Taller";
  for (const [key, val] of Object.entries(NORM_STAGES)) {
    if (low.includes(key)) return val;
  }
  return "Fabricación Taller";
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
// GESTIÓN DE MATERIALES Y UNIDADES
// -----------------------------------------------------

export async function createMaterial(name: string) {
  try {
    await requireAdmin();
    const material = await prisma.material.create({ data: { name } });
    revalidatePath("/catalog");
    return { success: true, material };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al crear material." };
  }
}

export async function updateMaterial(id: string, name: string) {
  try {
    await requireAdmin();
    await prisma.material.update({ where: { id }, data: { name } });
    revalidatePath("/catalog");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al actualizar material." };
  }
}

export async function deleteMaterial(id: string) {
  try {
    await requireAdmin();
    await prisma.material.delete({ where: { id } });
    revalidatePath("/catalog");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al eliminar material (podría estar en uso)." };
  }
}

export async function createUnitType(name: string) {
  try {
    await requireAdmin();
    const unitType = await prisma.unitType.create({ data: { name } });
    revalidatePath("/catalog");
    return { success: true, unitType };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al crear unidad." };
  }
}

export async function updateUnitType(id: string, name: string) {
  try {
    await requireAdmin();
    await prisma.unitType.update({ where: { id }, data: { name } });
    revalidatePath("/catalog");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al actualizar unidad." };
  }
}

export async function deleteUnitType(id: string) {
  try {
    await requireAdmin();
    await prisma.unitType.delete({ where: { id } });
    revalidatePath("/catalog");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al eliminar unidad (podría estar en uso)." };
  }
}

// -----------------------------------------------------
// MOTOR DE LANZAMIENTO A PRODUCCIÓN
// -----------------------------------------------------

export async function launchMachineToProject(machineId: string, projectName: string, startDate: Date, projectQuantity: number = 1) {
  try {
    const startAt = new Date(startDate);
    startAt.setHours(8, 0, 0, 0); // Ajustar inicio a las 08:00 AM del día elegido

    // 1. Cargar toda la máquina con sus piezas y operaciones
    const machine = await prisma.machineCatalog.findUnique({
      where: { id: machineId },
      include: {
        parts: {
          include: {
            operations: { orderBy: { orderIndex: "asc" } },
            materials: {
              include: {
                material: true,
                unitType: true
              }
            }
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
        quantity: projectQuantity,
        stage: "Planeación y Diseño",
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
    });

    // 4. Diccionario temporal para mapear IDs originales de CatalogPart a los nuevos IDs de Task
    const partIdToTaskId = new Map<string, string>();
    const projectStartDate = new Date(startAt);

    // Helper para obtener horas totales recursivas de una pieza (operaciones propias + hijas)
    function getRecursiveHours(pId: string): number {
      const part = machine!.parts.find(p => p.id === pId);
      if (!part) return 0;

      const ownHours = (part as any).estimatedHours || 0;
      const directOpsHours = part.operations.reduce((acc, op) => acc + (op.estimatedHours || 0), 0);
      const childrenParts = machine!.parts.filter(p => p.parentId === pId);
      const childrenHours = childrenParts.reduce((acc, child) => acc + getRecursiveHours(child.id), 0);

      return ownHours + directOpsHours + childrenHours;
    }

    // Identificar qué piezas son "Ensambles Reales" (tienen sub-piezas)
    const parentPartIds = new Set(machine.parts.map(p => p.parentId).filter(Boolean));

    // Clonación Recursiva Helper
    async function clonePart(partId: string, parentTaskId?: string) {
      // Definir interfaces locales para Tipado Estricto
      interface CatalogOp {
        id: string;
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
        materialId?: string | null;
        materialQuantityPerUnit?: number | null;
        unitTypeId?: string | null;
        operations: CatalogOp[];
        materials: any[];
        estimatedHours: number;
      }

      const part = machine!.parts.find(p => p.id === partId) as CatalogPartWithOps | undefined;
      if (!part) return;

      // Cantidad total = cantidad en máquina * cantidad de máquinas en el proyecto
      const totalQuantity = part.quantity * projectQuantity;

      // Cálculo de horas para este nodo (Ensambles suman recursivamente, piezas simples usan sus operaciones)
      const isAssembly = parentPartIds.has(part.id);

      // El tiempo unitario es la suma de (horas propias de la pieza) + (operaciones directas o recursivas)
      const partOpsHours = part.operations.reduce((acc, op) => acc + (op.estimatedHours || 0), 0);
      const unitEstimatedHours = isAssembly
        ? getRecursiveHours(part.id)
        : (part.estimatedHours || 0) + partOpsHours;

      // Las horas estimadas totales se escalan por la cantidad total
      // Para pedidos externos, las horas son 0 (el trabajo lo hace el proveedor)
      const isExternal = part.preferredStage === "Pedido Externo" || part.preferredStage === "Entregado Externo";
      let finalEstimatedHours = (isExternal ? 0 : (unitEstimatedHours || 8)) * totalQuantity;

      // Cálculo de Fechas
      let taskEndDate: Date;

      if (isExternal && (part.deliveryDays || 0) > 0) {
        // Pedido externo: fecha fin = días naturales + normalización a Lunes (sin agosto)
        taskEndDate = addCalendarDays(projectStartDate, part.deliveryDays!);
        // NO recalcular horas con el engine → finalEstimatedHours ya es 0
      } else {
        // Para fabricación: fecha fin por motor de tiempo (horas laborables)
        taskEndDate = engine.addBusinessHours(projectStartDate, Math.max(1, finalEstimatedHours));
      }

      // Crear la Tarea/Ensamble
      const newTaskPart = await prisma.task.create({
        data: {
          name: part.name,
          projectId: project.id,
          parentId: parentTaskId,
          isAssembly: isAssembly,
          stage: part.preferredStage || "Fabricación Taller",
          status: "EN_PROCESO",
          startDate: projectStartDate,
          endDate: taskEndDate,
          estimatedHours: finalEstimatedHours,
          unitEstimatedHours: isExternal ? 0 : (unitEstimatedHours || 8),
          quantity: totalQuantity,
          deliveryDays: part.deliveryDays || 0,
          catalogPartId: part.id,
          materials: {
            create: part.materials.map(m => ({
              materialId: m.materialId,
              quantityPerUnit: m.quantityPerUnit,
              unitTypeId: m.unitTypeId
            }))
          }
        }
      });

      partIdToTaskId.set(part.id, newTaskPart.id);

      // Clonar operaciones de esta pieza en cascada - SOLO si no es Fabricación Taller o es un Ensamble con lógica propia
      if (newTaskPart.stage !== "Fabricación Taller") {
        let opsStartDate = new Date(projectStartDate);
        for (const op of part.operations) {
          const opUnitHours = op.estimatedHours || 8;
          const opTotalHours = opUnitHours * totalQuantity;
          const opsEndDate = engine.addBusinessHours(opsStartDate, opTotalHours);

          await prisma.task.create({
            data: {
              name: op.name,
              projectId: project.id,
              parentId: newTaskPart.id,
              isAssembly: false,
              stage: op.preferredStage || part.preferredStage || "Fabricación Taller",
              status: "EN_PROCESO",
              progress: 0,
              startDate: opsStartDate,
              endDate: opsEndDate,
              estimatedHours: opTotalHours,
              unitEstimatedHours: opUnitHours,
              quantity: totalQuantity,
              catalogPartId: part.id,
              catalogOperationId: op.id,
            }
          });
          opsStartDate = opsEndDate;
        }
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

    // --- NUEVA LÓGICA: VINCULAR DEPENDENCIAS Y RECALCULAR TIEMPOS ---

    // 1. Crear registros de Predecesores basados en la jerarquía
    for (const part of machine.parts) {
      if (part.parentId) {
        const childTaskId = partIdToTaskId.get(part.id);
        const parentTaskId = partIdToTaskId.get(part.parentId);

        if (childTaskId && parentTaskId) {
          await prisma.taskDependency.create({
            data: {
              successorId: parentTaskId,
              predecessorId: childTaskId,
            }
          });
        }
      }
    }

    // 2. Disparar recalibración de fechas en cascada desde las piezas base (hojas)
    // Buscamos tareas que tengan sucesoras pero NO tengan predecesoras propias.
    const leafTasks = await prisma.task.findMany({
      where: {
        projectId: project.id,
        successors: { some: {} },
        predecessors: { none: {} }
      },
      select: { id: true, startDate: true, endDate: true }
    });

    // Importamos dinámicamente para evitar ciclos si fuera necesario, 
    // pero como es una server action podemos importar de tasks.ts
    const { updateTaskDatesAndCascade } = await import("./tasks");

    for (const leaf of leafTasks) {
      // Forzamos un recalculado desde cada hoja para que se propague a los ensambles
      await updateTaskDatesAndCascade(leaf.id, leaf.startDate, leaf.endDate);
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
    const machineNameFromForm = formData.get("machineName") as string | null;
    if (!file) return { success: false, error: "No se proporcionó ningún archivo." };

    const machineName = machineNameFromForm || file.name.replace(".xlsx", "");

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

    // Validar cabeceras mínimas obligatorias
    const required = ["nombre", "cantidad", "etapa inicial"];
    const missing = required.filter(h => !headers.includes(h));

    if (missing.length > 0) {
      return {
        success: false,
        error: "INVALID_FORMAT",
        details: `Faltan las columnas obligatorias: ${missing.join(", ")}`
      };
    }

    // 2. Crear la Máquina Plantilla
    const machine = await prisma.machineCatalog.create({
      data: {
        name: machineName,
        description: `Importado de Excel el ${new Date().toLocaleString()}`
      }
    });

    // 3. Mapeo temporal para jerarquías y filas
    const rows: {
      nombre: string;
      cantidad: number;
      parentName: string;
      horas: number;
      etapa: string;
      plazo: number;
      material: string | null;
      materialQty: number;
      unitType: string | null;
    }[] = [];
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

      const plazoValue = item["plazo-entrega-semanas-laborales"] || item["plazo-entrega-semanas"] || item["plazo entrega semanas"];
      const plazoSemanas = Number(plazoValue) || 1;
      const plazoDias = plazoSemanas * 7; // Convertir semanas laborales a días

      rows.push({
        nombre: item.nombre?.toString().trim() || "Sin nombre",
        cantidad: Number(item.cantidad) || 1,
        parentName: item["pertenece a ensamble"]?.toString().trim() || "",
        horas: horas,
        etapa: normalizeStageName(item["etapa inicial"]?.toString() || ""),
        plazo: plazoDias > 0 ? plazoDias : 7,
        material: item.material?.toString().trim() || null,
        materialQty: Number(item["material x unidad"]) || 0,
        unitType: item["tipo unidad"]?.toString().trim() || null
      });
    });

    // 3.5 Upsert de Materiales y Unidades encontrados en el Excel
    const materialsInExcel = Array.from(new Set(rows.map(r => r.material).filter(Boolean)));
    const unitsInExcel = Array.from(new Set(rows.map(r => r.unitType).filter(Boolean)));

    const materialMap = new Map<string, string>();
    for (const mName of materialsInExcel) {
      const mat = await prisma.material.upsert({
        where: { name: mName! },
        update: {},
        create: { name: mName! }
      });
      materialMap.set(mName!.toLowerCase(), mat.id);
    }

    const unitMap = new Map<string, string>();
    for (const uName of unitsInExcel) {
      const unit = await prisma.unitType.upsert({
        where: { name: uName! },
        update: {},
        create: { name: uName! }
      });
      unitMap.set(uName!.toLowerCase(), unit.id);
    }

    // 4. Primera pasada: Crear CatalogPart y guardar IDs por nombre (Agregando materiales si el nombre se repite)
    const partNameToId = new Map<string, string>();
    const partNameToStage = new Map<string, string>();
    for (const r of rows) {
      const lowerName = r.nombre.toLowerCase();
      let partId = partNameToId.get(lowerName);

      if (!partId) {
        const part = await prisma.catalogPart.create({
          data: {
            name: r.nombre,
            machineId: machine.id,
            quantity: r.cantidad,
            preferredStage: r.etapa,
            deliveryDays: r.etapa === "Pedido Externo" ? r.plazo : 0,
            estimatedHours: r.etapa !== "Pedido Externo" ? Math.max(0, r.horas) : 0,
          }
        });
        partId = part.id;
        partNameToId.set(lowerName, partId);
        partNameToStage.set(lowerName, part.preferredStage || "");
      }

      // Añadir material a la pieza (nueva o existente)
      if (r.material) {
        await prisma.catalogPartMaterial.create({
          data: {
            catalogPartId: partId,
            materialId: materialMap.get(r.material.toLowerCase())!,
            quantityPerUnit: r.materialQty,
            unitTypeId: r.unitType ? unitMap.get(r.unitType.toLowerCase()) : null,
          }
        });
      }
    }

    // 5. Segunda pasada: Vincular jerarquías y marcar ensambles
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
          // pero solo si no era ya Pedido Externo
          const parentStage = partNameToStage.get(parentKey) || "Ensambles Taller";
          if (parentStage !== "Pedido Externo") {
            await prisma.catalogPart.update({
              where: { id: parentId },
              data: { preferredStage: "Ensambles Taller" }
            });
          }
        }
      }
    }

    revalidatePath("/catalog");

    // Obtener la máquina con el conteo de piezas
    const machineWithCount = await prisma.machineCatalog.findUnique({
      where: { id: machine.id },
      include: { _count: { select: { parts: true } } }
    });

    return { success: true, machine: machineWithCount };
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

/** Actualiza el tiempo estándar en el Catálogo basado en el tiempo real de una tarea */
export async function updateCatalogFromTask(taskId: string) {
  await requireAdmin();

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      name: true,
      unitEstimatedHours: true,
      estimatedHours: true,
      quantity: true,
      deliveryDays: true,
      stage: true,
      projectId: true,
      parentId: true,
      catalogPartId: true,
      catalogOperationId: true,
      predecessors: { select: { predecessor: { select: { id: true } } } },
      materials: {
        select: {
          materialId: true,
          quantityPerUnit: true,
          unitTypeId: true
        }
      }
    }
  });

  if (!task) throw new Error("Tarea no encontrada");

  let newPart: { id: string } | undefined;
  const updatedPredTaskIds: string[] = [];

  if (task.catalogOperationId) {
    const realUnitHours = task.unitEstimatedHours ?? ((task.estimatedHours ?? 0) / (task.quantity || 1));
    await prisma.catalogOperation.update({
      where: { id: task.catalogOperationId },
      data: { estimatedHours: realUnitHours }
    });
  } else if (task.catalogPartId) {
    const realUnitHours = task.unitEstimatedHours ?? ((task.estimatedHours ?? 0) / (task.quantity || 1));
    await prisma.catalogPart.update({
      where: { id: task.catalogPartId },
      data: {
        deliveryDays: task.deliveryDays || 0,
        estimatedHours: realUnitHours,
        preferredStage: task.stage === "Pedido Externo" || task.stage === "Entregado Externo" ? "Pedido Externo" : "Fabricación Taller"
      }
    });
    await prisma.catalogPartMaterial.deleteMany({ where: { catalogPartId: task.catalogPartId } });
    for (const tm of task.materials) {
      await prisma.catalogPartMaterial.create({
        data: {
          catalogPartId: task.catalogPartId,
          materialId: tm.materialId,
          quantityPerUnit: tm.quantityPerUnit,
          unitTypeId: tm.unitTypeId
        }
      });
    }
  } else {
    // La tarea no tiene pieza en el catálogo → CREAR una nueva
    
    // Buscar la máquina correcta
    const machineId = await findMachineFromProject(task.projectId);

    // 1. Crear/asegurar el padre (ensamble) si la tarea pertenece a uno
    let parentCatalogPartId: string | null = null;
    if (task.parentId) {
      const parentTask = await prisma.task.findUnique({
        where: { id: task.parentId },
        select: { catalogPartId: true, name: true, quantity: true }
      });
      if (parentTask?.catalogPartId) {
        parentCatalogPartId = parentTask.catalogPartId;
      } else if (parentTask) {
        const parentPart = await prisma.catalogPart.create({
          data: {
            name: parentTask.name,
            machineId,
            quantity: parentTask.quantity || 1,
            preferredStage: "Ensambles Taller",
          }
        });
        parentCatalogPartId = parentPart.id;
        await prisma.task.update({
          where: { id: task.parentId! },
          data: { catalogPartId: parentPart.id }
        });
      }
    }

    // 2. Crear la pieza principal
    const realUnitHours = task.unitEstimatedHours ?? ((task.estimatedHours ?? 0) / (task.quantity || 1));
    newPart = await prisma.catalogPart.create({
      data: {
        name: task.name,
        machineId,
        parentId: parentCatalogPartId,
        quantity: task.quantity,
        estimatedHours: realUnitHours,
        deliveryDays: task.deliveryDays || 0,
        preferredStage: task.stage === "Pedido Externo" || task.stage === "Entregado Externo" ? "Pedido Externo" : "Fabricación Taller"
      }
    });

// 3. Crear sub-piezas para las dependencias (predecesores) como hijos de la pieza principal
    updatedPredTaskIds.length = 0;
    if (task.predecessors?.length) {
      for (const predRel of task.predecessors) {
        const predId = predRel.predecessor.id;
        const predTask = await prisma.task.findUnique({
          where: { id: predId },
          select: { id: true, catalogPartId: true, name: true, quantity: true, estimatedHours: true, deliveryDays: true }
        });
        
        if (predTask) {
          if (!predTask.catalogPartId) {
            const predPart = await prisma.catalogPart.create({
              data: {
                name: predTask.name,
                machineId,
                quantity: predTask.quantity,
                parentId: newPart.id,
                estimatedHours: predTask.estimatedHours || 0,
                deliveryDays: predTask.deliveryDays || 0,
                preferredStage: "Fabricación Taller",
              }
            });
            await prisma.task.update({
              where: { id: predTask.id },
              data: { catalogPartId: predPart.id }
            });
            updatedPredTaskIds.push(predTask.id);
          } else {
            const existing = await prisma.catalogPart.findUnique({
              where: { id: predTask.catalogPartId }
            });
            if (existing) {
              await prisma.catalogPart.update({
                where: { id: predTask.catalogPartId },
                data: { parentId: newPart.id }
              });
            }
          }
        } else {
          const deadPart = await prisma.catalogPart.create({
            data: {
              name: `[Dependencia #${predId.slice(0, 8)}]`,
              machineId,
              quantity: 1,
              parentId: newPart.id,
              preferredStage: "Fabricación Taller",
            }
          });
        }
      }
    }

    // 4. Copiar materiales a la nueva pieza
    for (const tm of task.materials) {
      await prisma.catalogPartMaterial.create({
        data: {
          catalogPartId: newPart.id,
          materialId: tm.materialId,
          quantityPerUnit: tm.quantityPerUnit,
          unitTypeId: tm.unitTypeId
        }
      });
    }

    // 5. Vincular la tarea con la nueva pieza del catálogo
    await prisma.task.update({
      where: { id: taskId },
      data: { catalogPartId: newPart.id }
    });
  }

  revalidatePath("/catalog");
  const partId = task.catalogOperationId ? null : (task.catalogPartId || (newPart?.id ?? null));
  return { success: true, catalogPartId: partId, updatedPredTaskIds };
}

/** Busca la máquina del catálogo asociada al proyecto mirando tareas hermanas con catalogPartId */
async function findMachineFromProject(projectId: string): Promise<string> {
  // Buscar una tarea hermana que SÍ tenga catalogPartId y obtener su máquina
  const siblingTask = await prisma.task.findFirst({
    where: {
      projectId,
      catalogPartId: { not: null }
    },
    select: { catalogPartId: true }
  });

  if (siblingTask?.catalogPartId) {
    const catalogPart = await prisma.catalogPart.findUnique({
      where: { id: siblingTask.catalogPartId },
      select: { machineId: true }
    });
    if (catalogPart?.machineId) return catalogPart.machineId;
  }

  // Si no hay hermanas con catalogPart, buscar en las máquinas existentes
  const existingMachine = await prisma.machineCatalog.findFirst({ orderBy: { createdAt: "desc" } });
  if (existingMachine) return existingMachine.id;

  // Último recurso: crear máquina por defecto
  const machine = await prisma.machineCatalog.create({
    data: {
      name: "Catálogo General",
      description: "Piezas sincronizadas desde proyectos."
    }
  });
  return machine.id;
}

/** Sincroniza la lista de materiales de una tarea con su pieza en el catálogo maestro */
export async function updateCatalogMaterialsFromTask(taskId: string) {
  await requireAdmin();

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      materials: true
    }
  });

  if (!task || !task.catalogPartId) {
    throw new Error("Tarea no encontrada o no vinculada a una pieza del catálogo.");
  }

  // 1. Eliminar materiales actuales de la pieza en el catálogo
  await prisma.catalogPartMaterial.deleteMany({
    where: { catalogPartId: task.catalogPartId }
  });

  // 2. Copiar materiales de la tarea a la pieza del catálogo
  for (const tm of task.materials) {
    await prisma.catalogPartMaterial.create({
      data: {
        catalogPartId: task.catalogPartId,
        materialId: tm.materialId,
        quantityPerUnit: tm.quantityPerUnit,
        unitTypeId: tm.unitTypeId
      }
    });
  }

  revalidatePath("/catalog");
  return { success: true };
}
