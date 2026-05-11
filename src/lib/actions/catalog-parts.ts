"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ----------------- CARGA DEL ÁRBOL COMPLETO -----------------

export async function getMachineWithHierarchy(machineId: string) {
  return await prisma.machineCatalog.findUnique({
    where: { id: machineId },
    include: {
      parts: {
        include: {
          subParts: true,
          operations: { orderBy: { orderIndex: "asc" } },
          materials: {
            include: {
              material: true,
              unitType: true
            }
          }
        },
      },
    },
  });
}

// ----------------- GESTIÓN DE PIEZAS (ENSAMBLES) -----------------

export async function createCatalogPart(data: { name: string; machineId: string; parentId?: string; quantity?: number }) {
  try {
    const part = await prisma.catalogPart.create({
      data: {
        name: data.name,
        machineId: data.machineId,
        parentId: data.parentId || null,
        quantity: data.quantity || 1,
      },
    });
    revalidatePath(`/catalog/${data.machineId}`);
    return { success: true, part };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al crear la pieza." };
  }
}

export async function updateCatalogPart(id: string, machineId: string, data: { 
  name?: string; 
  quantity?: number; 
}) {
  try {
    const part = await prisma.catalogPart.update({
      where: { id },
      data: {
        name: data.name,
        quantity: data.quantity,
      }
    });
    revalidatePath(`/catalog/${machineId}`);
    return { success: true, part };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al actualizar la pieza." };
  }
}

export async function addMaterialToCatalogPart(data: {
  catalogPartId: string;
  materialId: string;
  quantityPerUnit: number;
  unitTypeId: string | null;
  machineId: string;
}) {
  try {
    const link = await prisma.catalogPartMaterial.create({
      data: {
        catalogPartId: data.catalogPartId,
        materialId: data.materialId,
        quantityPerUnit: data.quantityPerUnit,
        unitTypeId: data.unitTypeId
      }
    });
    revalidatePath(`/catalog/${data.machineId}`);
    return { success: true, link };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al añadir material." };
  }
}

export async function removeMaterialFromCatalogPart(linkId: string, machineId: string) {
  try {
    await prisma.catalogPartMaterial.delete({ where: { id: linkId } });
    revalidatePath(`/catalog/${machineId}`);
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al eliminar material." };
  }
}

export async function deleteCatalogPart(id: string, machineId: string) {
  try {
    await prisma.catalogPart.delete({ where: { id } });
    revalidatePath(`/catalog/${machineId}`);
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al eliminar la pieza." };
  }
}

// ----------------- GESTIÓN DE OPERACIONES (MANO DE OBRA) -----------------

export async function createCatalogOperation(data: { name: string; partId: string; estimatedHours?: number; machineId: string }) {
  try {
    // Calcular el próximo orderIndex
    const lastOp = await prisma.catalogOperation.findFirst({
      where: { partId: data.partId },
      orderBy: { orderIndex: "desc" }
    });
    
    const op = await prisma.catalogOperation.create({
      data: {
        name: data.name,
        partId: data.partId,
        estimatedHours: data.estimatedHours || 8,
        orderIndex: (lastOp?.orderIndex ?? -1) + 1
      },
    });
    revalidatePath(`/catalog/${data.machineId}`);
    return { success: true, op };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al crear la operación." };
  }
}

export async function deleteCatalogOperation(id: string, machineId: string) {
  try {
    await prisma.catalogOperation.delete({ where: { id } });
    revalidatePath(`/catalog/${machineId}`);
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al eliminar la operación." };
  }
}

/** Obtiene el resumen de materiales para una pieza del catálogo y sus descendientes */
export async function getMachineMaterialsSummary(machineId: string, partId?: string) {
  // 1. Obtener todas las piezas de la máquina
  const allParts = await prisma.catalogPart.findMany({
    where: { machineId },
    include: {
      materials: {
        include: {
          material: true,
          unitType: true
        }
      }
    }
  });

  // 2. Recursividad para obtener IDs de la rama
  const getBranchIds = (id: string): string[] => {
    const children = allParts.filter(p => p.parentId === id);
    return [id, ...children.flatMap(c => getBranchIds(c.id))];
  };

  let targetParts = allParts;
  if (partId) {
    const ids = getBranchIds(partId);
    targetParts = allParts.filter(p => ids.includes(p.id));
  }

  // 3. Agrupar por material
  const byMaterial: Record<string, { 
    name: string; 
    totalQty: number; 
    unit: string; 
    parts: { name: string; qtyPerUnit: number; pieceQty: number; total: number }[] 
  }> = {};

  targetParts.forEach(p => {
    p.materials.forEach(m => {
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
      const qty = (p.quantity || 1) * (m.quantityPerUnit || 0);
      byMaterial[key].totalQty += qty;
      byMaterial[key].parts.push({
        name: p.name,
        qtyPerUnit: m.quantityPerUnit || 0,
        pieceQty: p.quantity,
        total: qty
      });
    });
  });

  return Object.values(byMaterial);
}
