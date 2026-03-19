import { redirect } from "next/navigation";

export default function AdminPage() {
  // Redirigir por defecto a la gestión de usuarios
  redirect("/admin/users");
}
