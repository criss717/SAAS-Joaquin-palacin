"use server";

import prisma from "@/lib/prisma";
import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { sendWelcomeEmail } from "@/lib/email";

export type UserWithoutPassword = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export async function getUsers(): Promise<UserWithoutPassword[]> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
    orderBy: { name: "asc" },
  });
  return users;
}

export async function createUser(data: { name: string; email: string; role: Role }) {
  try {
    // 1. Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return { success: false, error: "Ya existe un usuario con este correo electrónico." };
    }

    // 2. Generate random temporary password
    const tempPassword = Math.random().toString(36).slice(-8) + "Aa1!";
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // 3. Create user
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        passwordHash,
      },
    });

    // 4. Send email (Intentar enviar, pero no bloquear totalmente si falla la red)
    const emailRes = await sendWelcomeEmail({
      to: user.email,
      name: user.name,
      tempPassword,
      role: user.role,
    });

    if (!emailRes.success) {
      console.error("⚠️ CRÍTICO: El usuario se creó pero el email falló.");
      console.log(`🔑 DATOS DEL NUEVO USUARIO PARA DARLE MANUALMENTE:
         Nombre: ${user.name}
         Email: ${user.email}
         Clave Temporal: ${tempPassword}`);
    }

    revalidatePath("/admin/users");
    revalidatePath("/gantt"); // Revalidate where users are shown
    
    return {
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      emailSent: emailRes.success
    };
  } catch (error: unknown) {
    console.error("Error creating user:", error);
    return { success: false, error: error instanceof Error ? error.message : "Error al crear el usuario." };
  }
}

export async function updateUserRole(id: string, role: Role) {
  try {
    await prisma.user.update({
      where: { id },
      data: { role },
    });
    
    revalidatePath("/admin/users");
    revalidatePath("/gantt");
    return { success: true };
  } catch (error: unknown) {
    console.error("Error updating user role:", error);
    return { success: false, error: "Error al actualizar el rol." };
  }
}

export async function deleteUser(id: string) {
  try {
    await prisma.user.delete({
      where: { id },
    });
    
    revalidatePath("/admin/users");
    revalidatePath("/gantt");
    return { success: true };
  } catch (error: unknown) {
    console.error("Error deleting user:", error);
    return { success: false, error: "Error al eliminar el usuario." };
  }
}

export async function updateUserPassword(userId: string, newPassword: string) {
  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { success: true };
  } catch (error: unknown) {
    console.error("Error updating password:", error);
    return { success: false, error: "Error al actualizar la contraseña." };
  }
}

export async function updateUserAccount(userId: string, data: { name?: string, email?: string }) {
  try {
    if (data.email) {
      const existing = await prisma.user.findFirst({
        where: {
          email: data.email,
          NOT: { id: userId }
        }
      });
      if (existing) {
        return { success: false, error: "Este correo ya está registrado por otro usuario." };
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data
    });

    revalidatePath("/admin/users");
    revalidatePath("/gantt");
    return { success: true };
  } catch (error: unknown) {
    console.error("Error updating user account:", error);
    return { success: false, error: "Error al actualizar los datos del usuario." };
  }
}
