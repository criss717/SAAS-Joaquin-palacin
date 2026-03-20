"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("No autorizado: se requiere rol de administrador");
  }
  return session;
}

// ----------------- GESTIÓN DE HORARIOS / TEMPORADAS -----------------

export async function getWorkSchedules() {
  return await prisma.workSchedule.findMany({
    orderBy: { validFrom: "asc" },
  });
}

export async function upsertWorkSchedule(data: {
  id?: string;
  name: string;
  validFrom: Date;
  validUntil: Date;
  workingDays: number[];
  shifts: { start: string; end: string }[];
}) {
  try {
    // 1. Validar solapamiento de fechas
    const existing = await prisma.workSchedule.findMany({
      where: {
        id: data.id ? { not: data.id } : undefined,
        OR: [
          {
            validFrom: { lte: data.validUntil },
            validUntil: { gte: data.validFrom }
          }
        ]
      }
    });

    if (existing.length > 0) {
      return { success: false, error: `Error: La fecha solapa con la temporada "${existing[0].name}"` };
    }

    const payload = {
      name: data.name,
      validFrom: data.validFrom,
      validUntil: data.validUntil,
      workingDays: JSON.stringify(data.workingDays),
      shifts: JSON.stringify(data.shifts),
    };

    if (data.id) {
      await prisma.workSchedule.update({
        where: { id: data.id },
        data: payload,
      });
    } else {
      await prisma.workSchedule.create({
        data: payload,
      });
    }
    revalidatePath("/admin/schedule");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al guardar el horario." };
  }
}

export async function deleteWorkSchedule(id: string) {
  try {
    await requireAdmin();
    await prisma.workSchedule.delete({ where: { id } });
    revalidatePath("/admin/schedule");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al eliminar el horario." };
  }
}

// ----------------- GESTIÓN DE FESTIVOS -----------------

export async function getHolidays() {
  return await prisma.holiday.findMany({
    orderBy: { startDate: "asc" },
  });
}

export async function createHoliday(name: string, startDate: Date, endDate?: Date) {
  try {
    await requireAdmin();
    // Normalizar a medianoche local
    const s = new Date(startDate);
    s.setHours(0, 0, 0, 0);
    
    const e = endDate ? new Date(endDate) : new Date(startDate);
    e.setHours(23, 59, 59, 999);

    await prisma.holiday.create({
      data: { 
        name, 
        startDate: s, 
        endDate: e 
      },
    });
    revalidatePath("/admin/schedule");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al crear el festivo." };
  }
}

export async function deleteHoliday(id: string) {
  try {
    await requireAdmin();
    await prisma.holiday.delete({ where: { id } });
    revalidatePath("/admin/schedule");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error al eliminar el festivo." };
  }
}
