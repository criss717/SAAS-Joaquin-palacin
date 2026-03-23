"use server";

import prisma from "@/lib/prisma";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

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
            { name: "Ensambles", color: "#a855f7", order: 1 },
            { name: "Piezas / Accesorios", color: "#9ca3af", order: 2 },
            { name: "Pedido Externo", color: "#ef4444", order: 3 },
            { name: "Fabricación Taller", color: "#3b82f6", order: 4 },
            { name: "Listo", color: "#22c55e", order: 5 },
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
