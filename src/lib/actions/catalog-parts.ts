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
