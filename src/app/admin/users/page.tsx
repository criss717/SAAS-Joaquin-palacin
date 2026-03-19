import { getUsers } from "@/lib/actions/users";
import { UserClient } from "./UserClient";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await getUsers();
  const session = await getServerSession(authOptions);
  const currentUserId = session?.user?.id;

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Gestión de Personal</h1>
        <p className="text-sm font-medium text-gray-500 mt-1">
          Administra los accesos, roles e invita a nuevos usuarios a la plataforma.
        </p>
      </div>

      <UserClient initialUsers={users} currentUserId={currentUserId} />
    </div>
  );
}
