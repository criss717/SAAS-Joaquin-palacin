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

    // 4. Send email
    await sendWelcomeEmail({
      to: user.email,
      name: user.name,
      tempPassword,
      role: user.role,
    });

    revalidatePath("/admin/users");
    revalidatePath("/gantt"); // Revalidate where users are shown
    
    return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
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
