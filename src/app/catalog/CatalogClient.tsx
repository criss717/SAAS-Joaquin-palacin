"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMachine, deleteMachine, launchMachineToProject } from "@/lib/actions/catalog";
import { Plus, Trash2, Settings, ChevronRight, Play } from "lucide-react";
import { toast } from "sonner";
import Swal from "sweetalert2";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

type Machine = {
  id: string;
  name: string;
  description: string | null;
  _count: { parts: number };
};

export function CatalogClient({ initialMachines }: { initialMachines: Machine[] }) {
  const router = useRouter();
  const [machines, setMachines] = useState(initialMachines);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const [selectedMachineToLaunch, setSelectedMachineToLaunch] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleOpenLaunch = (machineId: string) => {
    setSelectedMachineToLaunch(machineId);
    setProjectName("");
    setIsLaunchModalOpen(true);
  };

  const handleLaunch = async () => {
    if (!selectedMachineToLaunch || !projectName.trim()) return;
    setLoading(true);
    const res = await launchMachineToProject(selectedMachineToLaunch, projectName);
    if (res.success) {
      setIsLaunchModalOpen(false);
      toast.success(`Máquina lanzada con éxito`);
      router.push("/");
    } else {
      toast.error(res.error || "Error clonando máquina");
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    const res = await createMachine(name, description);
    if (res.success && res.machine) {
      setMachines([{ ...res.machine, _count: { parts: 0 } }, ...machines]);
      setIsModalOpen(false);
      setName("");
      setDescription("");
      toast.success("Máquina plantilla creada.");
    } else {
      toast.error("Error al crear la máquina");
    }
    setLoading(false);
  };

  const handleDelete = async (id: string, machineName: string) => {
    const result = await Swal.fire({
      title: '¿Eliminar Máquina?',
      text: `Se eliminará por completo "${machineName}" y todo su despiece asociado.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonText: 'Cancelar',
      confirmButtonText: 'Sí, eliminar'
    });
    if (!result.isConfirmed) return;

    const res = await deleteMachine(id);
    if (res.success) {
      setMachines(machines.filter((m) => m.id !== id));
      toast.success("Máquina plantilla eliminada.");
    } else {
      toast.error("Error eliminando máquina");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500">
          Plantillas disponibles: <strong>{machines.length}</strong>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl ">
          <Plus size={16} className="mr-2" /> Nueva Máquina
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {machines.map((machine) => (
          <div key={machine.id} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                <Settings size={24} />
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(machine.id, machine.name)} className="text-gray-400 hover:text-red-600 hover:bg-red-50">
                <Trash2 size={16} />
              </Button>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-1">{machine.name}</h3>
            <p className="text-sm text-gray-500 line-clamp-2 min-h-[40px] mb-4">
              {machine.description || "Sin descripción proporcionada."}
            </p>

            <div className="mt-auto flex items-center justify-between border-t border-gray-50 pt-4">
              <span className="text-xs font-semibold px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg">
                {machine._count.parts} Piezas
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => handleOpenLaunch(machine.id)} className="text-emerald-600 font-bold hover:bg-emerald-50 hover:text-emerald-700 px-3 h-8 cursor-pointer">
                  Lanzar <Play size={14} className="ml-1" />
                </Button>
                <Link href={`/catalog/${machine.id}`}>
                  <Button variant="ghost" className="text-blue-600 font-bold hover:bg-blue-50 hover:text-blue-700 px-3 h-8 cursor-pointer">
                    Despiece <ChevronRight size={14} className="ml-1" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        ))}
        {machines.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-400 italic">No hay máquinas creadas.</div>
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-gray-900">Nueva Máquina / Plantilla</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Nombre de la Máquina</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Decanter P6" className="h-10 border-gray-200 rounded-xl" autoFocus />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Descripción (Opcional)</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Versión estándar con acero 316..." className="h-10 border-gray-200 rounded-xl" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={loading} className="rounded-xl border-gray-200 font-bold text-gray-500">
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={loading || !name} className="rounded-xl cursor-pointer font-black">
              {loading ? "Guardando..." : "Crear Máquina"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isLaunchModalOpen} onOpenChange={setIsLaunchModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-gray-900">Lanzar Máquina a Producción</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Nombre del Proyecto</Label>
              <Input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Ej: Decanter Cliente Amazon" className="h-10 border-gray-200 rounded-xl" autoFocus />
            </div>
            <p className="text-xs text-gray-500">
              Esta acción clonará todas las piezas y operaciones del despiece teórico hacia el tablero Kanban y Gantt real, creando un proyecto nuevo listo para operar.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-2">
            <Button variant="outline" onClick={() => setIsLaunchModalOpen(false)} disabled={loading} className="rounded-xl border-gray-200 font-bold text-gray-500">
              Cancelar
            </Button>
            <Button onClick={handleLaunch} disabled={loading || !projectName} className="rounded-xl font-black bg-emerald-600 hover:bg-emerald-700 text-white ">
              {loading ? "Clonando..." : "Confirmar Lanzamiento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
