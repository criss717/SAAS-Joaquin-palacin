"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Swal from "sweetalert2";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { setActiveProjectCookie, createEmptyProject } from "@/lib/actions/projects";

type Project = { id: string; name: string };

export function ProjectSelector({
  projects,
  activeProjectId,
}: {
  projects: Project[];
  activeProjectId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const handleSelect = async (id: string) => {
    setOpen(false);
    if (id !== activeProjectId) {
      setLoading(true);
      await setActiveProjectCookie(id);
      setLoading(false);
    }
  };

  const handleCreateNew = async () => {
    const { value: formValues } = await Swal.fire({
      title: "Nuevo Proyecto",
      html: `
        <div class="space-y-4 text-left">
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre del Proyecto</label>
            <input id="swal-name" class="swal2-input m-0! w-full!" placeholder="Nombre..." autoFocus>
          </div>
          <div class="mt-4">
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha de Inicio del Trabajo</label>
            <input id="swal-date" type="date" class="swal2-input m-0! w-full!" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Crear",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#2563eb",
      preConfirm: () => {
        const name = (document.getElementById('swal-name') as HTMLInputElement).value;
        const date = (document.getElementById('swal-date') as HTMLInputElement).value;
        if (!name || !name.trim()) {
          Swal.showValidationMessage('El nombre es obligatorio');
          return false;
        }
        return { name: name.trim(), startDate: new Date(date) };
      }
    });

    if (!formValues) return;
    
    setOpen(false);
    setLoading(true);
    const res = await createEmptyProject(formValues.name, formValues.startDate);
    if (res.success) {
      toast.success("Proyecto creado y seleccionado con éxito.");
    } else {
      toast.error("Error al crear el proyecto.");
    }
    setLoading(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation(); // Evitar que seleccione el proyecto al clicar la papelera
    const result = await Swal.fire({
      title: "¿Eliminar Proyecto?",
      text: `Se borrarán permanentemente todas las tareas de "${name}".`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#9ca3af",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar"
    });

    if (result.isConfirmed) {
      setLoading(true);
      const { deleteProjectAction } = await import("@/lib/actions/projects");
      const res = await deleteProjectAction(id);
      if (res.success) {
        toast.success("Proyecto eliminado.");
      } else {
        toast.error("Error al eliminar el proyecto.");
      }
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center w-[250px] h-10 justify-between bg-gray-50 border border-gray-200 text-gray-700 font-semibold cursor-pointer shadow-sm hover:bg-gray-100 rounded-md px-4 py-2 text-sm disabled:opacity-50"
        disabled={loading}
      >
        <span className="truncate flex-1 text-left">
          {loading ? "Cambiando..." : activeProject ? activeProject.name : "Seleccionar Proyecto..."}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0 rounded-xl" align="start">
        <Command>
          <CommandInput placeholder="Buscar proyecto..." />
          <CommandList>
            <CommandEmpty className="py-2 px-4 text-xs text-gray-500">
              No se encontraron proyectos.
            </CommandEmpty>
            <CommandGroup heading="Tus Proyectos">
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={project.name}
                  onSelect={() => handleSelect(project.id)}
                  className="cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center flex-1 min-w-0 pr-2">
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 text-blue-600 shrink-0",
                        activeProjectId === project.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="truncate">{project.name}</span>
                  </div>
                  <button 
                    onClick={(e) => handleDelete(e, project.id, project.name)}
                    className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    title="Eliminar Proyecto"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </CommandItem>
              ))}
            </CommandGroup>
            <div className="border-t border-gray-100 p-1">
              <Button
                variant="ghost"
                className="w-full justify-start text-xs font-bold text-blue-600 hover:bg-blue-50 hover:text-blue-700 cursor-pointer h-8"
                onClick={handleCreateNew}
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Crear Nuevo Proyecto Vacío
              </Button>
            </div>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
