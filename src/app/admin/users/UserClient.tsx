"use client";

import { useState } from "react";
import { UserWithoutPassword, createUser, updateUserRole, deleteUser, updateUserPassword, updateUserAccount } from "@/lib/actions/users";
import { Role } from "@prisma/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ShieldAlert, ShieldCheck, Mail, User, Trash2, Edit2, Eye, EyeOff, Lock, Search, ChevronLeft, ChevronRight, XCircle } from "lucide-react";
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
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState(""); // For "Email sent" messages

  // Búsqueda y Paginación
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

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
    setEditName(u.name);
    setEditEmail(u.email);
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
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
      if (res.emailSent) {
        setSuccessMsg("¡Usuario creado! Se ha enviado un email con su contraseña.");
      } else {
        setSuccessMsg("⚠️ ¡Usuario creado! Pero el email no pudo enviarse. Pide la clave al administrador.");
      }
      setTimeout(() => {
        setIsInviteModalOpen(false);
        setSuccessMsg("");
      }, 5000);
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
      toast.success("Rol actualizado.");
      setIsEditModalOpen(false);
    } else {
      setError(res.error || "Error al actualizar rol.");
    }
    setLoading(false);
  };

  const handleUpdateProfile = async () => {
    if (!selectedUser) return;
    if (!editName.trim() || !editEmail.trim()) {
      setError("Nombre y email son obligatorios.");
      return;
    }
    setLoading(true);
    setError("");

    const res = await updateUserAccount(selectedUser.id, { name: editName, email: editEmail });
    if (res.success) {
      setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, name: editName, email: editEmail } : u));
      toast.success("Perfil actualizado correctamente.");
    } else {
      setError(res.error || "Error al actualizar perfil.");
    }
    setLoading(false);
  };

  const handlePasswordReset = async () => {
    if (!selectedUser) return;
    if (!newPassword || newPassword.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    setError("");
    const res = await updateUserPassword(selectedUser.id, newPassword);
    if (res.success) {
      toast.success("Contraseña actualizada correctamente.");
      setNewPassword("");
      setConfirmPassword("");
      // No cerramos el modal por si quiere cambiar el rol también
    } else {
      setError(res.error || "Error al resetear contraseña.");
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
      confirmButtonText: 'Sí, eliminar',
      heightAuto: false
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

  // Lógica de filtrado y paginación
  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1); // Reset a primera página al buscar
  };

  return (
    <div className="space-y-4 ">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center justify-between gap-4">
        <div className="flex gap-4">
          <div className="bg-blue-50 text-blue-800 px-4 py-2 rounded-xl border border-blue-100 flex items-center gap-2">
            <User size={16} className="text-blue-500" />
            <span className="text-sm font-bold">Total: {users.length}</span>
          </div>
        </div>

        <div className="flex-1 max-w-sm relative">
          <Input
            placeholder="Buscar por nombre o email..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className={`h-10 pl-10 border-gray-200 rounded-xl transition-all ${searchTerm ? 'border-blue-500 ring-1 ring-blue-500' : ''}`}
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          {searchTerm && (
            <button onClick={() => handleSearchChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
              <XCircle size={14} />
            </button>
          )}
        </div>

        <Button onClick={openInviteModal} className="bg-blue-100 hover:bg-blue-200 text-blue-600 font-bold rounded-xl ">
          <Plus size={16} className="mr-2" /> Invitar Persona
        </Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[650px]">
        <div className="flex-1 overflow-auto">
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
              {paginatedUsers.map((user) => (
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
                        className="h-8 rounded-lg text-gray-500 border-gray-200 cursor-pointer hover:text-blue-600 hover:bg-blue-50"
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
              {paginatedUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-400 font-medium italic">
                    {searchTerm ? `No se encontraron usuarios que coincidan con "${searchTerm}"` : "No hay usuarios registrados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Mostrando {Math.min(filteredUsers.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(filteredUsers.length, currentPage * itemsPerPage)} de {filteredUsers.length} resultados
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0 rounded-lg border-gray-200 text-gray-500 disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </Button>
              <div className="flex items-center gap-1 mx-2">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${currentPage === p ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:bg-gray-100'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="h-8 w-8 p-0 rounded-lg border-gray-200 text-gray-500 disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
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
            <Button onClick={handleInvite} disabled={loading || successMsg !== ""} className="rounded-xl font-black bg-blue-100 hover:bg-blue-200 text-blue-600">
              {loading ? "Enviando invitación..." : "Invitar y Enviar Email"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Rol y Contraseña */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl overflow-hidden p-0 border-none shadow-2xl">
          <div className="bg-linear-to-r from-gray-800 to-blue-600 px-6 py-6 text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black flex items-center gap-2">
                <Edit2 size={24} /> Editar Usuario
              </DialogTitle>
              <DialogDescription className="text-blue-100 font-medium opacity-90">
                Gestionar accesos y credenciales de {selectedUser?.name}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-8 bg-white max-h-[70vh] overflow-y-auto">
            {/* Sección de DATOS PERSONALES */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-blue-600">
                <User size={18} />
                <h3 className="text-sm font-black uppercase tracking-wider">Datos Personales</h3>
              </div>
              <div className="space-y-4 pl-7">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold text-gray-400 uppercase">Nombre Completo</Label>
                  <Input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Nombre del usuario"
                    className="h-11 border-gray-100 bg-gray-50/50 rounded-xl focus:ring-blue-500 font-bold text-gray-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold text-gray-400 uppercase">Correo Electrónico</Label>
                  <Input
                    type="email"
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                    placeholder="email@ejemplo.com"
                    className="h-11 border-gray-100 bg-gray-50/50 rounded-xl focus:ring-blue-500 font-bold text-gray-700"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleUpdateProfile}
                  disabled={loading || (editName === selectedUser?.name && editEmail === selectedUser?.email)}
                  className="rounded-xl h-10 px-6 bg-blue-100 hover:bg-blue-200 text-blue-600 font-black text-xs"
                >
                  Actualizar Perfil
                </Button>
              </div>
            </div>

            <div className="h-px bg-gray-100 -mx-6"></div>

            {/* Sección de ROL */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-blue-600">
                <ShieldCheck size={18} />
                <h3 className="text-sm font-black uppercase tracking-wider">Permisos de Acceso</h3>
              </div>
              <div className="space-y-2 pl-7">
                <Label className="text-[10px] font-bold text-gray-400 uppercase">Rol del Sistema</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as Role)}
                  disabled={selectedUser?.id === currentUserId}
                >
                  <SelectTrigger className={`w-full h-11 border-gray-100 bg-gray-50/50 rounded-xl font-bold text-gray-700 focus:ring-blue-500 ${selectedUser?.id === currentUserId ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">Operario (USER)</SelectItem>
                    <SelectItem value="ADMIN">Administrador (ADMIN)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-gray-400 italic">Los administradores tienen acceso total al panel de control y catálogos.</p>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={handleEditRole} disabled={loading || role === selectedUser?.role} className="rounded-xl h-10 px-6 text-blue-600 bg-blue-100 hover:bg-blue-200 border border-indigo-100 font-black text-xs">
                  Actualizar Rol
                </Button>
              </div>
            </div>

            <div className="h-px bg-gray-100 -mx-6"></div>

            {/* Sección de CONTRASEÑA */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-amber-500">
                <Lock size={18} />
                <h3 className="text-sm font-black uppercase tracking-wider">Seguridad y Acceso</h3>
              </div>

              <div className="space-y-4 pl-7">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold text-gray-400 uppercase">Nueva Contraseña</Label>
                  <div className="relative">
                    <Input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Min. 6 caracteres"
                      className="h-11 border-gray-100 bg-gray-50/50 rounded-xl pr-10 font-mono"
                    />
                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-bold text-gray-400 uppercase">Confirmar Contraseña</Label>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Repite la contraseña"
                      className="h-11 border-gray-100 bg-gray-50/50 rounded-xl pr-10 font-mono"
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    variant="outline"
                    onClick={handlePasswordReset}
                    disabled={loading || !newPassword || newPassword !== confirmPassword}
                    className="rounded-xl h-10 px-6 border-amber-200 text-amber-600 hover:bg-amber-50 font-black text-xs"
                  >
                    Reiniciar Contraseña
                  </Button>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-[11px] font-bold rounded-xl flex items-center gap-2">
                <ShieldAlert size={14} className="shrink-0" /> {error}
              </div>
            )}
          </div>

          <div className="bg-gray-50 p-4 flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase tracking-widest border-t border-gray-100">
            <span>ID: {selectedUser?.id.slice(0, 8)}...</span>
            <Button variant="ghost" onClick={() => setIsEditModalOpen(false)} className="text-gray-500 hover:text-gray-700 font-black">
              Cerrar Panel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
