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
            { name: "Pendiente", color: "#94a3b8", order: 1 },
            { name: "Pedido Externo", color: "#8b5cf6", order: 2 }, 
            { name: "Fabricación Taller", color: "#3b82f6", order: 3 },
            { name: "Listo", color: "#22c55e", order: 4 },
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
