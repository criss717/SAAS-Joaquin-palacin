"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMachine, deleteMachine, launchMachineToProject, importMachineFromExcel, updateMachine, cloneMachine, createMaterial, updateMaterial, deleteMaterial, createUnitType, updateUnitType, deleteUnitType } from "@/lib/actions/catalog";
import { Plus, Trash2, Settings, ChevronRight, Play, Copy, ChevronLeft, Search, XCircle, Download, Package, Scale, Edit2 } from "lucide-react";
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
  parts?: { name: string }[];
  _count: { parts: number };
};

export function CatalogClient({
  initialMachines,
  initialMaterials = [],
  initialUnitTypes = []
}: {
  initialMachines: Machine[],
  initialMaterials?: { id: string, name: string }[],
  initialUnitTypes?: { id: string, name: string }[]
}) {
  const router = useRouter();
  const [machines, setMachines] = useState(initialMachines);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const [selectedMachineToLaunch, setSelectedMachineToLaunch] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [launchStartDate, setLaunchStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [projectQuantity, setProjectQuantity] = useState(1);
  const [view, setView] = useState<"machines" | "materials">("machines");
  const [materials, setMaterials] = useState(initialMaterials);
  const [unitTypes, setUnitTypes] = useState(initialUnitTypes);

  // Búsqueda y Paginación
  const [searchTerm, setSearchTerm] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");
  const [unitSearch, setUnitSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  const handleOpenLaunch = (machineId: string) => {
    setSelectedMachineToLaunch(machineId);
    setProjectName("");
    setProjectQuantity(1);
    setIsLaunchModalOpen(true);
  };

  const handleLaunch = async () => {
    if (!selectedMachineToLaunch || !projectName.trim()) return;
    setLoading(true);
    const res = await launchMachineToProject(selectedMachineToLaunch, projectName, new Date(launchStartDate), projectQuantity);
    if (res.success) {
      setIsLaunchModalOpen(false);
      toast.success(`Máquina lanzada con éxito`);
      router.push("/");
    } else {
      toast.error(res.error || "Error clonando máquina");
      setLoading(false);
    }
  };

  const handleExcelFormat = () => {
    const link = document.createElement("a");
    link.href = "/formatos_plantillas/formato_catalogo_maquina.xlsx";
    link.download = "Formato_Catalogo_Maquina.xlsx";
    link.click();
  }

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Validar extensión en el cliente
    if (!file.name.endsWith(".xlsx")) {
      Swal.fire({
        title: "Archivo no válido",
        text: "Por favor, selecciona un archivo Excel (.xlsx)",
        icon: "warning",
        confirmButtonColor: "#3b82f6",
      });
      e.target.value = "";
      return;
    }

    // 2. Pedir nombre de la máquina antes de importar
    const { value: machineName } = await Swal.fire({
      title: "Nombre de la Máquina",
      html: `
        <input type="text" id="swal-machine-name" class="swal2-input w-full" 
          placeholder="Ej: Máquina fresadora CNC" 
          value="${file.name.replace(".xlsx", "")}">
      `,
      preConfirm: () => {
        const name = (document.getElementById("swal-machine-name") as HTMLInputElement)?.value;
        if (!name?.trim()) {
          Swal.showValidationMessage("El nombre es obligatorio");
          return false;
        }
        return name.trim();
      },
      confirmButtonText: "Importar",
      cancelButtonText: "Cancelar",
      showCancelButton: true,
      confirmButtonColor: "#3b82f6",
      heightAuto: false

    });

    if (!machineName) {
      e.target.value = "";
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("machineName", machineName);

const res = await importMachineFromExcel(formData);
    
    if (res.success && res.machine) {
      setMachines([res.machine, ...machines]);
      toast.success(`Catálogo "${res.machine.name}" importado correctamente.`);
    } else {
      // 2. Manejo de errores específicos con SweetAlert2
      if (res.error === "INVALID_FORMAT") {
        const details = "details" in res ? (res.details as string) : "";
        Swal.fire({
          title: "Formato no válido",
          html: `El archivo no cumple con la estructura esperada.<br/><small class="text-gray-500">${details}</small>`,
          icon: "error",
          showCancelButton: true,
          confirmButtonText: "Descargar Formato",
          cancelButtonText: "Cerrar",
          confirmButtonColor: "#10b981", // emerald-500
        }).then((result) => {
          if (result.isConfirmed) {
            handleExcelFormat(); // Disparar descarga del formato
          }
        });
      } else {
        toast.error(res.error || "Error al importar Excel");
      }
    }

    setLoading(false);
    e.target.value = ""; // Reset input
  };

  const handleEdit = async (machine: Machine) => {
    const { value: formValues } = await Swal.fire({
      title: "Editar Máquina",
      html: `
        <div class="space-y-4 text-left">
          <div class="mt-2">
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre</label>
            <input id="swal-edit-name" class="swal2-input m-0! w-full!" value="${machine.name}" placeholder="Nombre...">
          </div>
          <div class="mt-4">
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Descripción</label>
            <input id="swal-edit-desc" class="swal2-input m-0! w-full!" value="${machine.description || ""}" placeholder="Descripción...">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#2563eb",
      heightAuto: false,
      preConfirm: () => {
        const name = (document.getElementById('swal-edit-name') as HTMLInputElement).value;
        const desc = (document.getElementById('swal-edit-desc') as HTMLInputElement).value;
        if (!name || !name.trim()) {
          Swal.showValidationMessage('El nombre es obligatorio');
          return false;
        }
        return { name: name.trim(), description: desc.trim() };
      }
    });

    if (formValues) {
      setLoading(true);
      const res = await updateMachine(machine.id, formValues.name, formValues.description);
      if (res.success) {
        setMachines(machines.map(m => m.id === machine.id ? { ...m, name: formValues.name, description: formValues.description } : m));
        toast.success("Máquina actualizada correctamente.");
      } else {
        toast.error(res.error || "Error al actualizar");
      }
      setLoading(false);
    }
  };

  const handleClone = async (id: string, machineName: string) => {
    const result = await Swal.fire({
      title: '¿Clonar Máquina?',
      text: `Se creará una copia exacta de "${machineName}".`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonText: 'Cancelar',
      confirmButtonText: 'Sí, clonar',
      heightAuto: false
    });
    if (!result.isConfirmed) return;

    setLoading(true);
    const res = await cloneMachine(id);
    if (res.success && res.machine) {
      const originalMachine = machines.find(m => m.id === id);
      setMachines([{
        ...res.machine,
        parts: originalMachine?.parts || [],
        _count: { parts: originalMachine?._count.parts || 0 }
      }, ...machines]);
      toast.success("Máquina clonada correctamente.");
    } else {
      toast.error(res.error || "Error al clonar");
    }
    setLoading(false);
  };


  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    const res = await createMachine(name, description);
    if (res.success && res.machine) {
      setMachines([{ ...res.machine, parts: [], _count: { parts: 0 } }, ...machines]);
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
      confirmButtonText: 'Sí, eliminar',
      heightAuto: false
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

  // Gestión de Materiales
  const handleCreateMaterial = async () => {
    const { value: name } = await Swal.fire({
      title: 'Nuevo Material',
      input: 'text',
      inputPlaceholder: 'Nombre del material...',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      heightAuto: false
    });
    if (name) {
      const res = await createMaterial(name);
      if (res.success) {
        setMaterials([...materials, res.material!]);
        toast.success("Material creado.");
      }
    }
  };

  const handleEditMaterial = async (m: { id: string, name: string }) => {
    const { value: name } = await Swal.fire({
      title: 'Editar Material',
      input: 'text',
      inputValue: m.name,
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      heightAuto: false
    });
    if (name) {
      const res = await updateMaterial(m.id, name);
      if (res.success) {
        setMaterials(materials.map(x => x.id === m.id ? { ...x, name } : x));
        toast.success("Material actualizado.");
      }
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    const result = await Swal.fire({
      title: '¿Eliminar Material?',
      text: "Esta acción podría fallar si el material está en uso.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      heightAuto: false
    });
    if (result.isConfirmed) {
      const res = await deleteMaterial(id);
      if (res.success) {
        setMaterials(materials.filter(x => x.id !== id));
        toast.success("Material eliminado.");
      } else {
        toast.error(res.error);
      }
    }
  };

  // Gestión de Unidades
  const handleCreateUnit = async () => {
    const { value: name } = await Swal.fire({
      title: 'Nueva Unidad',
      input: 'text',
      inputPlaceholder: 'Ej: kg, metros, m2...',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      heightAuto: false
    });
    if (name) {
      const res = await createUnitType(name);
      if (res.success) {
        setUnitTypes([...unitTypes, res.unitType!]);
        toast.success("Unidad creada.");
      }
    }
  };

  const handleEditUnit = async (u: { id: string, name: string }) => {
    const { value: name } = await Swal.fire({
      title: 'Editar Unidad',
      input: 'text',
      inputValue: u.name,
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      heightAuto: false
    });
    if (name) {
      const res = await updateUnitType(u.id, name);
      if (res.success) {
        setUnitTypes(unitTypes.map(x => x.id === u.id ? { ...x, name } : x));
        toast.success("Unidad actualizada.");
      }
    }
  };

  const handleDeleteUnit = async (id: string) => {
    const result = await Swal.fire({
      title: '¿Eliminar Unidad?',
      text: "Esta acción podría fallar si la unidad está en uso.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      heightAuto: false
    });
    if (result.isConfirmed) {
      const res = await deleteUnitType(id);
      if (res.success) {
        setUnitTypes(unitTypes.filter(x => x.id !== id));
        toast.success("Unidad eliminada.");
      } else {
        toast.error(res.error);
      }
    }
  };

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  // Lógica de filtrado y paginación
  const filteredMachines = machines.filter(m =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.parts?.some(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())) ?? false)
  );

  const totalPages = Math.ceil(filteredMachines.length / itemsPerPage);
  const paginatedMachines = filteredMachines.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 p-1.5 rounded-2xl w-fit">
        <button
          onClick={() => setView("machines")}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${view === "machines" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          <Settings size={16} /> Máquinas
        </button>
        <button
          onClick={() => setView("materials")}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${view === "materials" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          <Package size={16} /> Materiales y Unidades
        </button>
      </div>

      {view === "machines" ? (
        <>
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-6 flex-1">
              <div className="text-sm text-gray-500 whitespace-nowrap">
                Resultado: <strong>{filteredMachines.length}</strong> de {machines.length}
              </div>

              <div className="flex-1 max-w-md relative">
                <Input
                  placeholder="Buscar por máquina o pieza..."
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
            </div>

            <div className="flex gap-2 justify-end items-center">
              <div className="flex gap-2 border border-gray-200 rounded-xl p-1">
                <Button
                  title="Descargar formato de Excel para importar máquinas"
                  variant="outline"
                  onClick={handleExcelFormat}
                  disabled={loading}
                  className="border-emerald-600 text-emerald-600 hover:bg-emerald-50 rounded-xl font-bold"
                >
                  <Download size={16} className="mr-2" />
                  Formato
                </Button>
                <input type="file" id="excel-import" className="hidden" accept=".xlsx" onChange={handleExcelImport} />
                <Button title="Importar máquinas desde Excel" variant="outline" onClick={() => document.getElementById('excel-import')?.click()} disabled={loading} className="border-emerald-600 text-emerald-600 hover:bg-emerald-50 rounded-xl font-bold">
                  Importar Excel
                </Button>
              </div>
              <Button title="Crear nueva máquina" onClick={() => setIsModalOpen(true)} className="bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-xl font-bold">
                <Plus size={16} className="mr-2" /> Nueva Máquina
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 min-h-[540px] content-start">
            {paginatedMachines.map((machine) => (
              <div key={machine.id} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div title="Editar máquina" onClick={() => handleEdit(machine)} className="p-3 cursor-pointer bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100">
                    <Settings size={24} />
                  </div>
                  <div className="flex gap-1">
                    <Button title="Clonar máquina" variant="ghost" size="icon" onClick={() => handleClone(machine.id, machine.name)} className="text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                      <Copy size={16} />
                    </Button>
                    <Button title="Eliminar máquina" variant="ghost" size="icon" onClick={() => handleDelete(machine.id, machine.name)} className="text-gray-400 hover:text-red-600 hover:bg-red-50">
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>

                <h3 onClick={() => router.push(`/catalog/${machine.id}`)} className="text-lg hover:underline cursor-pointer font-bold text-gray-900 mb-1">{machine.name}</h3>
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
            {paginatedMachines.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-400 italic">
                {searchTerm ? `No se encontraron máquinas o piezas que coincidan con "${searchTerm}"` : "No hay máquinas creadas."}
              </div>
            )}
          </div>
          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white px-6 py-4 border border-gray-100 rounded-2xl shadow-sm mt-4">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Página {currentPage} de {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="h-9 w-9 p-0 rounded-xl border-gray-200 text-gray-500 disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </Button>

                <div className="flex items-center gap-1 mx-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`w-9 h-9 rounded-xl text-xs font-black transition-all ${currentPage === p ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:bg-gray-100'}`}
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
                  className="h-9 w-9 p-0 rounded-xl border-gray-200 text-gray-500 disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Columna Materiales */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                <Package className="text-orange-500" /> Materiales Registrados
              </h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Input
                    placeholder="Buscar material..."
                    value={materialSearch}
                    onChange={e => setMaterialSearch(e.target.value)}
                    className="h-8 text-xs w-32 border-gray-100 bg-gray-50 rounded-lg pl-7"
                  />
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
                <Button onClick={handleCreateMaterial} size="sm" className="bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-xl font-bold border-0 h-8">
                  <Plus size={14} className="mr-1" /> Nuevo
                </Button>
              </div>
            </div>
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-50 kanban-scroll">
                {materials.filter(m => m.name.toLowerCase().includes(materialSearch.toLowerCase())).length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm italic">Sin resultados</div>
                ) : (
                  materials.filter(m => m.name.toLowerCase().includes(materialSearch.toLowerCase())).map(m => (
                    <div key={m.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors group">
                      <span className="text-sm font-bold text-gray-700">{m.name}</span>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEditMaterial(m)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDeleteMaterial(m.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Columna Unidades */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                <Scale className="text-blue-500" /> Unidades de Medida
              </h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Input
                    placeholder="Buscar unidad..."
                    value={unitSearch}
                    onChange={e => setUnitSearch(e.target.value)}
                    className="h-8 text-xs w-32 border-gray-100 bg-gray-50 rounded-lg pl-7"
                  />
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
                <Button onClick={handleCreateUnit} size="sm" className="bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl font-bold border-0 h-8">
                  <Plus size={14} className="mr-1" /> Nueva
                </Button>
              </div>
            </div>
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-50 kanban-scroll">
                {unitTypes.filter(u => u.name.toLowerCase().includes(unitSearch.toLowerCase())).length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm italic">Sin resultados</div>
                ) : (
                  unitTypes.filter(u => u.name.toLowerCase().includes(unitSearch.toLowerCase())).map(u => (
                    <div key={u.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors group">
                      <span className="text-sm font-bold text-gray-700">{u.name}</span>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEditUnit(u)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDeleteUnit(u.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modales */}
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
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Fecha de Inicio del Trabajo</Label>
              <Input type="date" value={launchStartDate} onChange={e => setLaunchStartDate(e.target.value)} className="h-10 border-gray-200 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Cantidad de Máquinas</Label>
              <Input type="number" min={1} value={projectQuantity} onChange={e => setProjectQuantity(Number(e.target.value))} className="h-10 border-gray-200 rounded-xl" />
            </div>
            <p className="text-xs text-gray-500">
              Esta acción clonará todas las piezas y operaciones del despiece teórico hacia el tablero Kanban y Gantt real, calculando el cronograma completo a partir de la fecha seleccionada y multiplicando tiempos por la cantidad.
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
