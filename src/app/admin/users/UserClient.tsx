"use client";

import { useState } from "react";
import { UserWithoutPassword, createUser, updateUserRole, deleteUser } from "@/lib/actions/users";
import { Role } from "@prisma/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ShieldAlert, ShieldCheck, Mail, User, Trash2, Edit2 } from "lucide-react";
import Swal from "sweetalert2";
import { toast } from "sonner";

export function UserClient({ initialUsers, currentUserId }: { initialUsers: UserWithoutPassword[], currentUserId?: string }) {
  const [users, setUsers] = useState(initialUsers);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Create / Edit states
  const [selectedUser, setSelectedUser] = useState<UserWithoutPassword | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("USER");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState(""); // For "Email sent" messages

  const openInviteModal = () => {
    setName("");
    setEmail("");
    setRole("USER");
    setError("");
    setSuccessMsg("");
    setIsInviteModalOpen(true);
  };

  const openEditModal = (u: UserWithoutPassword) => {
    setSelectedUser(u);
    setRole(u.role);
    setError("");
    setSuccessMsg("");
    setIsEditModalOpen(true);
  };

  const handleInvite = async () => {
    if (!name.trim() || !email.trim()) {
      setError("Nombre y correo son obligatorios.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccessMsg("");

    const res = await createUser({ name, email, role });
    if (res.success && res.user) {
      setUsers(prev => [...prev, res.user as UserWithoutPassword]);
      setSuccessMsg("¡Usuario creado! Se ha enviado un email con su contraseña.");
      setTimeout(() => {
        setIsInviteModalOpen(false);
        setSuccessMsg("");
      }, 3000);
    } else {
      setError(res.error || "Error al invitar usuario.");
    }
    setLoading(false);
  };

  const handleEditRole = async () => {
    if (!selectedUser) return;
    setLoading(true);
    setError("");

    const res = await updateUserRole(selectedUser.id, role);
    if (res.success) {
      setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, role } : u));
      setIsEditModalOpen(false);
    } else {
      setError(res.error || "Error al actualizar rol.");
    }
    setLoading(false);
  };

  const handleDelete = async (id: string, userName: string) => {
    const result = await Swal.fire({
      title: '¿Eliminar Usuario?',
      text: `¿Estás seguro de que quieres eliminar a ${userName}? Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonText: 'Cancelar',
      confirmButtonText: 'Sí, eliminar'
    });
    if (!result.isConfirmed) return;

    const res = await deleteUser(id);
    if (res.success) {
      setUsers(prev => prev.filter(u => u.id !== id));
      toast.success("Usuario eliminado correctamente.");
    } else {
      toast.error("Error al eliminar el usuario.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center justify-between">
        <div className="flex gap-4">
          {/* Resumen o filtros rápidos en el futuro */}
          <div className="bg-blue-50 text-blue-800 px-4 py-2 rounded-xl border border-blue-100 flex items-center gap-2">
            <User size={16} className="text-blue-500" />
            <span className="text-sm font-bold">Total: {users.length}</span>
          </div>
          <div className="bg-purple-50 text-purple-800 px-4 py-2 rounded-xl border border-purple-100 flex items-center gap-2">
            <ShieldCheck size={16} className="text-purple-500" />
            <span className="text-sm font-bold">Admins: {users.filter(u => u.role === 'ADMIN').length}</span>
          </div>
        </div>
        <Button onClick={openInviteModal} className="bg-blue-600 hover:bg-blue-700 cursor-pointer text-white rounded-xl ">
          <Plus size={16} className="mr-2" /> Invitar Persona
        </Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
            <tr>
              <th className="px-6 py-4">Usuario</th>
              <th className="px-6 py-4">Email</th>
              <th className="px-6 py-4">Rol</th>
              <th className="px-6 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4 font-bold text-gray-800 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black">
                    {user.name.charAt(0)}
                  </div>
                  {user.name}
                </td>
                <td className="px-6 py-4 text-gray-500">{user.email}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border ${user.role === 'ADMIN'
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                    {user.role === 'ADMIN' ? <ShieldAlert size={10} /> : <User size={10} />}
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline" size="sm" onClick={() => openEditModal(user)}
                      disabled={user.id === currentUserId}
                      className="h-8 rounded-lg text-gray-500 border-gray-200 cursor-pointer hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                    >
                      <Edit2 size={14} />
                    </Button>
                    <Button
                      variant="outline" size="sm" onClick={() => handleDelete(user.id, user.name)}
                      disabled={user.id === currentUserId}
                      className="h-8 rounded-lg text-gray-500 border-gray-20 cursor-pointer hover:text-red-600 hover:bg-red-50 hover:border-red-200 disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-400 font-medium italic">
                  No hay usuarios registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Invitar Usuario */}
      <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-gray-900">Invitar Nuevo Usuario</DialogTitle>
            <DialogDescription className="text-gray-500">
              Se creará la cuenta y se enviará un <strong>correo automático</strong> con una contraseña temporal de acceso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Nombre Completo</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Juan Pérez" className="h-10 border-gray-200 rounded-xl" autoFocus />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Correo Electrónico</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="juan@ejemplo.com" className="h-10 border-gray-200 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Nivel de Acceso</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger className="w-full h-10 border-gray-200 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">Operario (USER)</SelectItem>
                  <SelectItem value="ADMIN">Administrador (ADMIN)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs font-bold rounded-xl">{error}</div>}
            {successMsg && <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-bold rounded-xl flex items-center gap-2"><Mail size={14} /> {successMsg}</div>}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-2">
            <Button variant="outline" onClick={() => setIsInviteModalOpen(false)} disabled={loading} className="rounded-xl border-gray-200 font-bold text-gray-500">
              Cancelar
            </Button>
            <Button onClick={handleInvite} disabled={loading || successMsg !== ""} className="rounded-xl font-black shadow-lg shadow-blue-200">
              {loading ? "Enviando invitación..." : "Invitar y Enviar Email"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Rol */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-gray-900">Editar Usuario</DialogTitle>
            <DialogDescription>Modificar permisos de {selectedUser?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Nivel de Acceso</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger className="w-full h-10 border-gray-200 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">Operario (USER)</SelectItem>
                  <SelectItem value="ADMIN">Administrador (ADMIN)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs font-bold rounded-xl">{error}</div>}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-2">
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)} disabled={loading} className="rounded-xl border-gray-200 font-bold text-gray-500">
              Cancelar
            </Button>
            <Button onClick={handleEditRole} disabled={loading} className="rounded-xl font-black shadow-lg shadow-blue-200">
              {loading ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
