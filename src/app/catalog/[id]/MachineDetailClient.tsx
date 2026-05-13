"use client";

import { useState } from "react";
import { createCatalogPart, createCatalogOperation, deleteCatalogPart, deleteCatalogOperation, updateCatalogPart, getMachineMaterialsSummary, addMaterialToCatalogPart, removeMaterialFromCatalogPart } from "@/lib/actions/catalog-parts";
import { Plus, Trash2, Wrench, Layers, ArrowLeft, Package, Scale, Edit, Download, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { toast } from "sonner";
import Swal from "sweetalert2";
import { Search, ChevronLeft, ChevronRight, CheckCircle2, DownloadCloud, Check } from "lucide-react";
import { downloadMaterialReport } from "@/lib/utils/excel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type Operation = { id: string; name: string; estimatedHours: number; orderIndex: number; partId: string };
export interface Part {
  id: string;
  name: string;
  parentId: string | null;
  quantity: number;
  estimatedHours: number;
  deliveryDays: number;
  preferredStage: string | null;
  subParts: Part[];
  operations: Operation[];
  materials: {
    id: string;
    material: { id: string; name: string };
    quantityPerUnit: number;
    unitType: { id: string; name: string } | null;
  }[];
}
export type Machine = { id: string; name: string; description: string | null; parts: Part[] };

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function MachineDetailClient({
  initialMachine,
  materials,
  unitTypes
}: {
  initialMachine: Machine,
  materials: { id: string; name: string }[],
  unitTypes: { id: string; name: string }[]
}) {
  const [machine, setMachine] = useState<Machine>(initialMachine);

  const [isPartModalOpen, setIsPartModalOpen] = useState(false);
  const [isOpModalOpen, setIsOpModalOpen] = useState(false);

  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [qtyOrDays, setQtyOrDays] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [displayQtyOrDays, setDisplayQtyOrDays] = useState("");
  const [loading, setLoading] = useState(false);

  // Estados para Edición de Pieza
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [editName, setEditName] = useState("");
  const [editQty, setEditQty] = useState(1);
  const [editHours, setEditHours] = useState(0);
  const [displayEditHours, setDisplayEditHours] = useState("");
  const [editDeliveryDays, setEditDeliveryDays] = useState(0);
  const [displayEditWeeks, setDisplayEditWeeks] = useState("");
  const [editStage, setEditStage] = useState<string>("Fabricación Taller");
  // Para añadir nuevo material
  const [newMaterialId, setNewMaterialId] = useState<string | null>(null);
  const [newMaterialQty, setNewMaterialQty] = useState(0);
  const [newUnitTypeId, setNewUnitTypeId] = useState<string | null>(null);

  // Estados de Buscador y Paginación
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [stageFilter, setStageFilter] = useState<"all" | "taller" | "externo">("all");
  const pageSize = 15;

  // Top level parts
  const rootParts = machine.parts.filter(p => !p.parentId);

  const [isExternalPart, setIsExternalPart] = useState(false);

  const openAddPart = (parentId: string | null) => {
    setName("");
    setQuantity(1);
    setQtyOrDays(1);
    setDisplayQtyOrDays("1");
    setIsExternalPart(false);
    setSelectedParentId(parentId);
    setIsPartModalOpen(true);
  };

  const openAddOp = (partId: string) => {
    setName("");
    setQtyOrDays(1);
    setDisplayQtyOrDays("1");
    setSelectedPartId(partId);
    setIsOpModalOpen(true);
  };

  const handleCreatePart = async () => {
    if (!name.trim()) return;
    setLoading(true);
    const res = await createCatalogPart({
      name,
      machineId: machine.id,
      parentId: selectedParentId || undefined,
      quantity: quantity,
      estimatedHours: isExternalPart ? 0 : qtyOrDays,
      deliveryDays: isExternalPart ? qtyOrDays * 7 : 0,
      preferredStage: isExternalPart ? "Pedido Externo" : "Fabricación Taller"
    });
    if (res.success && res.part) {
      setMachine(prev => ({
        ...prev,
        parts: [...prev.parts, { ...res.part, subParts: [], operations: [], materials: [] } as Part]
      }));
      setIsPartModalOpen(false);
      toast.success("Pieza añadida al despiece.");
    } else {
      toast.error("Error al crear la pieza");
    }
    setLoading(false);
  };

  const handleCreateOp = async () => {
    if (!name.trim() || !selectedPartId) return;
    setLoading(true);
    const res = await createCatalogOperation({ name, machineId: machine.id, partId: selectedPartId, estimatedHours: qtyOrDays });
    if (res.success && res.op) {
      setMachine(prev => ({
        ...prev,
        parts: prev.parts.map(p => p.id === selectedPartId ? { ...p, operations: [...p.operations, res.op as unknown as Operation] } : p)
      }));
      setIsOpModalOpen(false);
      toast.success("Operación guardada.");
    } else {
      toast.error("Error al crear la operación");
    }
    setLoading(false);
  };

  const handleDownloadMaterials = async (partId?: string, partName?: string) => {
    try {
      const summary = await getMachineMaterialsSummary(machine.id, partId);
      downloadMaterialReport(summary, partName || machine.name);
      toast.success("Reporte descargado.");
    } catch (e) {
      toast.error("Error al descargar materiales.");
    }
  };

  const delPart = async (id: string, partName: string) => {
    const result = await Swal.fire({
      title: '¿Eliminar Pieza?',
      text: `Se eliminará "${partName}" y todo su contenido.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonText: 'Cancelar',
      confirmButtonText: 'Sí, eliminar',
      heightAuto: false
    });
    if (!result.isConfirmed) return;

    const res = await deleteCatalogPart(id, machine.id);
    if (res.success) {
      setMachine(prev => ({ ...prev, parts: prev.parts.filter(p => p.id !== id && p.parentId !== id) }));
      toast.success("Pieza eliminada correctamente.");
    } else {
      toast.error("Error al eliminar la pieza.");
    }
  };

  const delOp = async (id: string, partId: string) => {
    const res = await deleteCatalogOperation(id, machine.id);
    if (res.success) {
      setMachine(prev => ({
        ...prev,
        parts: prev.parts.map(p => p.id === partId ? { ...p, operations: p.operations.filter(o => o.id !== id) } : p)
      }));
      toast.success("Operación eliminada correctamente.");
    } else {
      toast.error("Error al eliminar la operación.");
    }
  };

  const openEditPart = (part: Part) => {
    setEditingPart(part);
    setEditName(part.name);
    setEditQty(part.quantity);
    setEditHours(part.estimatedHours || 0);
    setDisplayEditHours(part.estimatedHours > 0 ? part.estimatedHours.toString() : "");
    setEditDeliveryDays(part.deliveryDays || 0);
    setDisplayEditWeeks(part.deliveryDays > 0 ? (part.deliveryDays / 7).toFixed(1) : "");
    setEditStage(part.preferredStage || "Fabricación Taller");
    setNewMaterialId(null);
    setNewMaterialQty(0);
    setNewUnitTypeId(null);
    setIsEditModalOpen(true);
  };

  const handleAddMaterial = async () => {
    if (!editingPart) return;
    if (!newMaterialId) {
      toast.error("Selecciona un material");
      return;
    }
    if (!newUnitTypeId) {
      toast.error("Selecciona el tipo de unidad");
      return;
    }
    if (!newMaterialQty || newMaterialQty <= 0) {
      toast.error("La cantidad debe ser mayor a 0");
      return;
    }
    setLoading(true);
    const res = await addMaterialToCatalogPart({
      catalogPartId: editingPart.id,
      materialId: newMaterialId,
      quantityPerUnit: newMaterialQty,
      unitTypeId: newUnitTypeId,
      machineId: machine.id
    });
    if (res.success && res.link) {
      const matName = materials.find(m => m.id === newMaterialId)?.name || "";
      const unitName = unitTypes.find(u => u.id === newUnitTypeId)?.name || null;

      const newMat = {
        id: res.link.id,
        material: { id: newMaterialId, name: matName },
        quantityPerUnit: newMaterialQty,
        unitType: unitName ? { id: newUnitTypeId!, name: unitName } : null
      };

      setMachine(prev => ({
        ...prev,
        parts: prev.parts.map(p => p.id === editingPart.id ? { ...p, materials: [...p.materials, newMat] } : p)
      }));
      setEditingPart(prev => prev ? { ...prev, materials: [...prev.materials, newMat] } : null);
      setNewMaterialId(null);
      setNewMaterialQty(0);
      toast.success("Material añadido.");
    }
    setLoading(false);
  };

  const handleRemoveMaterial = async (linkId: string) => {
    setLoading(true);
    const res = await removeMaterialFromCatalogPart(linkId, machine.id);
    if (res.success) {
      setMachine(prev => ({
        ...prev,
        parts: prev.parts.map(p => p.id === editingPart?.id ? { ...p, materials: p.materials.filter(m => m.id !== linkId) } : p)
      }));
      setEditingPart(prev => prev ? { ...prev, materials: prev.materials.filter(m => m.id !== linkId) } : null);
      toast.success("Material eliminado.");
    }
    setLoading(false);
  };

  const handleUpdatePart = async () => {
    if (!editingPart || !editName.trim()) return;
    if (newMaterialId || newUnitTypeId || newMaterialQty > 0) {
      const result = await Swal.fire({
        title: "Material sin agregar",
        text: "Tienes un material pendiente sin añadir. ¿Quieres descartarlo y continuar?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sí, descartar y actualizar",
        cancelButtonText: "No, quiero añadirlo",
        confirmButtonColor: "#3b82f6",
        heightAuto: false
      });
      if (!result.isConfirmed) return;
      setNewMaterialId(null);
      setNewMaterialQty(0);
      setNewUnitTypeId(null);
    }
    setLoading(true);
    const res = await updateCatalogPart(editingPart.id, machine.id, {
      name: editName,
      quantity: editQty,
      estimatedHours: editStage === "Pedido Externo" ? 0 : editHours,
      deliveryDays: editStage === "Pedido Externo" ? editDeliveryDays : 0,
      preferredStage: editStage
    });
    if (res.success && res.part) {
      setMachine(prev => ({
        ...prev,
        parts: prev.parts.map(p => p.id === editingPart.id ? {
          ...p,
          name: editName,
          quantity: editQty,
          estimatedHours: editStage === "Pedido Externo" ? 0 : editHours,
          deliveryDays: editStage === "Pedido Externo" ? editDeliveryDays : 0,
          preferredStage: editStage
        } as Part : p)
      }));
      setIsEditModalOpen(false);
      toast.success("Pieza actualizada.");
    } else {
      toast.error("Error al actualizar la pieza");
    }
    setLoading(false);
  };

  // Lógica de Filtrado Recursivo
  const matchesSearch = (part: Part, term: string): boolean => {
    if (!term) return true;
    const normalizedTerm = normalize(term);
    if (normalize(part.name).includes(normalizedTerm)) return true;
    const children = machine.parts.filter(p => p.parentId === part.id);
    return children.some(c => matchesSearch(c, term));
  };

  const renderPart = (part: Part, depth: number = 0) => {
    if (searchTerm && !matchesSearch(part, searchTerm)) return null;

    const children = machine.parts.filter(p => p.parentId === part.id);
    const isHighlight = searchTerm && normalize(part.name).includes(normalize(searchTerm));

    return (
      <div key={part.id} className="border-l-2 border-gray-100 pl-4 py-2 mt-2 relative">
        <div className="absolute -left-6 top-4 w-6 border-t-2 border-gray-100 hidden sm:block"></div>

        <div className={`bg-white border border-gray-200 shadow-sm rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group transition-all duration-500 ${isHighlight ? 'ring-2 ring-blue-500 bg-blue-50 shadow-blue-100 animate-pulse-subtle' : ''
          }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${depth === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-50 text-blue-600'}`}>
              <Layers size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                <span className="truncate">{part.name}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">x{part.quantity}</span>
                {part.deliveryDays > 0 ? (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">{(part.deliveryDays / 7).toFixed(1)} sem.</span>
                ) : part.estimatedHours > 0 ? (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{part.estimatedHours} h.</span>
                ) : null}
              </div>
              {part.preferredStage === "Pedido Externo" && (
                <span className="text-[9px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded-md font-medium mt-1 inline-block">Pedido Externo</span>
              )}
              {part.materials.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {part.materials.map(m => (
                    <span key={m.id} className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md border border-blue-100 flex items-center gap-1">
                      <Package size={8} /> {m.material.name} ({m.quantityPerUnit} {m.unitType?.name || ""})
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-[10px] text-gray-400 italic">Sin materiales</span>
              )}
              <div className="text-xs text-gray-400">Pieza / Ensamble</div>
            </div>
          </div>

          <div className="flex items-center gap-2 opacity-100 sm:opacity-50 group-hover:opacity-100 transition-opacity">
            <Button size="sm" variant="outline" onClick={() => handleDownloadMaterials(part.id, part.name)} className="h-8 w-8 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50 cursor-pointer" title="Descargar materiales de esta pieza/ensamble">
              <Download size={14} />
            </Button>
            <Button size="sm" variant="outline" onClick={() => openEditPart(part)} className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer" title="Editar pieza">
              <Edit size={14} />
            </Button>
            <Button size="sm" variant="outline" onClick={() => openAddPart(part.id)} className="h-8 text-xs font-semibold text-blue-600 border-blue-200 hover:bg-blue-50 cursor-pointer">
              <Plus size={12} className="mr-1" /> Sub-Pieza
            </Button>
            <Button size="sm" variant="outline" onClick={() => openAddOp(part.id)} className="h-8 text-xs font-semibold text-indigo-600 border-indigo-200 hover:bg-indigo-50 cursor-pointer">
              <Wrench size={12} className="mr-1" /> Operación
            </Button>
            <Button size="sm" variant="ghost" onClick={() => delPart(part.id, part.name)} className="h-8 w-8 p-0 text-red-100 hover:text-red-600 hover:bg-red-50 cursor-pointer">
              <Trash2 size={14} />
            </Button>
          </div>
        </div>

        {part.operations.length > 0 && (
          <div className="ml-6 sm:ml-10 mt-2 space-y-1">
            {part.operations.map(op => (
              <div key={op.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg p-2 group">
                <div className="flex items-center gap-2">
                  <Wrench size={14} className="text-gray-400" />
                  <span className="text-sm font-semibold text-gray-700">{op.name}</span>
                  <span className="text-xs text-gray-500 bg-white border border-gray-200 px-1.5 rounded">{op.estimatedHours} h.</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => delOp(op.id, part.id)} className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 hover:bg-red-50 transition-opacity cursor-pointer">
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
          </div>
        )}

        {children.length > 0 && (
          <div className="ml-2 sm:ml-6 border-l-2 border-gray-100">
            {children.map(c => renderPart(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const filteredRootParts = rootParts.filter(p => {
    if (!matchesSearch(p, searchTerm)) return false;
    if (stageFilter === "taller") return p.preferredStage !== "Pedido Externo";
    if (stageFilter === "externo") return p.preferredStage === "Pedido Externo";
    return true;
  });
  const totalPages = Math.ceil(filteredRootParts.length / pageSize);
  const paginatedRootParts = filteredRootParts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6 pb-20">
      <style jsx global>{`
        @keyframes highlight-pulse-subtle {
          0% { transform: scale(1); }
          50% { transform: scale(1.01); box-shadow: 0 0 15px rgba(37, 99, 235, 0.2); }
          100% { transform: scale(1); }
        }
        .animate-pulse-subtle {
          animation: highlight-pulse-subtle 2s 1s ease-in-out;
        }
      `}</style>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <Link href="/catalog" className="text-sm font-bold text-gray-500 hover:text-gray-900 flex items-center">
            <ArrowLeft size={16} className="mr-2" /> Volver al Catálogo
          </Link>

          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {[
              { id: "all", label: "Todas" },
              { id: "taller", label: "Taller" },
              { id: "externo", label: "Externas" },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => { setStageFilter(f.id as typeof stageFilter); setCurrentPage(1); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${stageFilter === f.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex-1 w-full md:max-w-md relative group">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            <Input
              placeholder="Buscar pieza o ensamble..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 h-11 border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 focus:bg-white bg-gray-50 rounded-xl transition-all font-medium text-gray-700"
            />
            {/* // x  para limpiar */}
            {searchTerm && (
              <Button
                variant="ghost"
                size="sm"
                title="Limpiar búsqueda"
                onClick={() => setSearchTerm("")}
                className="absolute right-21 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all cursor-pointer"
              >
                <X size={12} />
              </Button>
            )}
            {searchTerm && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded-lg">
                {filteredRootParts.length} resultados
              </div>
            )}
          </div>

          <Button onClick={() => handleDownloadMaterials()} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl h-11 font-bold whitespace-nowrap">
            <DownloadCloud size={18} className="mr-2" /> Toda la maquina
          </Button>

          <Button onClick={() => openAddPart(null)} className="bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl h-11 font-bold whitespace-nowrap">
            <Plus size={18} className="mr-2" /> Pieza Principal
          </Button>
        </div>

        <div className="space-y-2 min-h-[300px]">
          {paginatedRootParts.length === 0 ? (
            <div className="text-center py-12 text-gray-400 italic bg-gray-50 rounded-xl border border-dashed border-gray-200">
              {searchTerm ? "No se encontraron coincidencias para tu búsqueda." : "No hay piezas definidas para esta máquina. Comienza añadiendo una pieza raíz."}
            </div>
          ) : (
            paginatedRootParts.map(p => renderPart(p, 0))
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8 pt-6 border-t border-gray-100">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="rounded-xl border-gray-200 h-10 px-4 font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-30"
            >
              <ChevronLeft size={18} className="mr-1" /> Anterior
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-400">Página</span>
              <span className="h-8 w-8 flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg font-black text-sm">{currentPage}</span>
              <span className="text-sm font-bold text-gray-400">de</span>
              <span className="text-sm font-black text-gray-700">{totalPages}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="rounded-xl border-gray-200 h-10 px-4 font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-30"
            >
              Siguiente <ChevronRight size={18} className="ml-1" />
            </Button>
          </div>
        )}
      </div>

      <Dialog open={isPartModalOpen} onOpenChange={setIsPartModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader><DialogTitle className="text-xl font-black text-gray-900">Agregar Pieza o Ensamble</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-600 uppercase">Nombre</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Sinfín Central" className="h-10 border-gray-200 rounded-xl" autoFocus />
            </div>

            {!selectedParentId && (
              <div className="flex gap-2">
                <button
                  onClick={() => setIsExternalPart(false)}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-bold border transition-all cursor-pointer ${!isExternalPart ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-gray-50 border-gray-100 text-gray-400"}`}
                >Fabricación Taller</button>
                <button
                  onClick={() => setIsExternalPart(true)}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-bold border transition-all cursor-pointer ${isExternalPart ? "bg-red-50 border-red-300 text-red-700" : "bg-gray-50 border-gray-100 text-gray-400"}`}
                >Pedido Externo</button>
              </div>
            )}

            {!selectedParentId ? (
              <div className="flex items-end gap-2">
                <div className="space-y-2 flex-1">
                  <Label className="text-xs font-bold text-gray-600 uppercase">Cantidad (uds)</Label>
                  <Input type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 1)} className="h-10 border-gray-200 rounded-xl" />
                </div>
                <div className="space-y-2 flex-1">
                  <Label className="text-xs font-bold text-gray-600 uppercase">
                    {isExternalPart ? "Semanas" : "Horas"}
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={displayQtyOrDays}
                    onChange={e => setDisplayQtyOrDays(e.target.value)}
                    onBlur={e => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v >= 0.1) {
                        setQtyOrDays(Number(v.toFixed(1)));
                        setDisplayQtyOrDays(v.toFixed(1));
                      } else {
                        setDisplayQtyOrDays(qtyOrDays > 0 ? qtyOrDays.toString() : "");
                      }
                    }}
                    className="h-10 border-gray-200 rounded-xl"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-600 uppercase">Cantidad (uds)</Label>
                <Input type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 1)} className="h-10 border-gray-200 rounded-xl" />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-2">
            <Button variant="outline" onClick={() => setIsPartModalOpen(false)} disabled={loading} className="rounded-xl border-gray-200 font-bold text-gray-500">Cancelar</Button>
            <Button onClick={handleCreatePart} disabled={loading || !name} className="rounded-xl font-black bg-blue-600 hover:bg-blue-700 text-white">Guardar Pieza</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader><DialogTitle className="text-[17px] font-black text-gray-900">Editar Pieza / Ensamble</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-600 uppercase">Nombre</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-10 border-gray-200 rounded-xl" />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setEditStage("Fabricación Taller"); setDisplayEditHours(editHours > 0 ? editHours.toString() : ""); }}
                className={`flex-1 py-2 rounded-xl text-[10px] font-bold border transition-all cursor-pointer ${editStage === "Fabricación Taller" ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-gray-50 border-gray-100 text-gray-400"}`}
              >Fabricación Taller</button>
              <button
                onClick={() => { setEditStage("Pedido Externo"); setDisplayEditWeeks(editDeliveryDays > 0 ? (editDeliveryDays / 7).toFixed(1) : "1.0"); }}
                className={`flex-1 py-2 rounded-xl text-[10px] font-bold border transition-all cursor-pointer ${editStage === "Pedido Externo" ? "bg-red-50 border-red-300 text-red-700" : "bg-gray-50 border-gray-100 text-gray-400"}`}
              >Pedido Externo</button>
            </div>

            <div className="flex items-end gap-2">
              <div className="space-y-2 flex-1">
                <Label className="text-xs font-bold text-gray-600 uppercase">Cantidad</Label>
                <Input type="number" min="1" step="1" value={editQty} onChange={e => setEditQty(parseInt(e.target.value) || 1)} className="h-10 border-gray-200 rounded-xl" />
              </div>
              {editStage === "Pedido Externo" ? (
                <div className="space-y-2 flex-1">
                  <Label className="text-xs font-bold text-gray-600 uppercase">Semanas Entrega</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={displayEditWeeks}
                    onChange={e => setDisplayEditWeeks(e.target.value)}
                    onBlur={e => {
                      const weeks = parseFloat(e.target.value);
                      if (!isNaN(weeks) && weeks >= 0.1) {
                        const days = Math.round(weeks * 7);
                        setEditDeliveryDays(days);
                        setDisplayEditWeeks((days / 7).toFixed(1));
                      } else {
                        setDisplayEditWeeks(editDeliveryDays > 0 ? (editDeliveryDays / 7).toFixed(1) : "");
                      }
                    }}
                    className="h-10 border-gray-200 rounded-xl"
                  />
                </div>
              ) : (
                <div className="space-y-2 flex-1">
                  <Label className="text-xs font-bold text-gray-600 uppercase">Horas Estimadas</Label>
                  <Input type="number" step="0.1" min="0" value={displayEditHours} onChange={e => setDisplayEditHours(e.target.value)} onBlur={e => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) {
                      setEditHours(Number(v.toFixed(1)));
                      setDisplayEditHours(v.toFixed(1));
                    } else {
                      setDisplayEditHours(editHours > 0 ? editHours.toString() : "");
                    }
                  }} className="h-10 border-gray-200 rounded-xl" />
                </div>
              )}
            </div>

            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-4">
              <Label className="text-sm font-black text-gray-900 flex items-center gap-2">
                <Package size={16} className="text-blue-500" /> Lista de Materiales
              </Label>

              <div className="space-y-2 max-h-40 overflow-y-auto kanban-scroll pr-2">
                {editingPart?.materials.map(m => (
                  <div key={m.id} className="flex items-center justify-between bg-white p-2 rounded-xl border border-gray-100 shadow-sm animate-in fade-in slide-in-from-left-2">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-gray-700">{m.material.name}</span>
                      <span className="text-[10px] text-gray-500">{m.quantityPerUnit} {m.unitType?.name || "uds"} x unidad</span>
                    </div>
                    <button onClick={() => handleRemoveMaterial(m.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors cursor-pointer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {editingPart?.materials.length === 0 && (
                  <p className="text-xs text-gray-400 italic text-center py-2">No hay materiales asignados.</p>
                )}
              </div>

              <div className="pt-2 border-t border-gray-200 grid grid-cols-1 gap-3">

                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nuevo Material</Label>
                  <Popover>
                    <PopoverTrigger className={cn(buttonVariants({ variant: "outline" }), "w-full justify-between h-9 rounded-xl border-gray-200 font-medium text-xs flex items-center px-3", !newMaterialId && "text-gray-400")}>
                      <span className="truncate">{newMaterialId ? materials.find(m => m.id === newMaterialId)?.name : "Seleccionar..."}</span>
                      <Search className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0 rounded-xl shadow-xl border-gray-100">
                      <Command>
                        <CommandInput placeholder="Buscar material..." className="h-8 text-xs" />
                        <CommandList className="max-h-32 kanban-scroll">
                          <CommandEmpty className="text-[10px] py-2 text-center">No encontrado.</CommandEmpty>
                          <CommandGroup>
                            {materials.map(m => (
                              <CommandItem key={m.id} value={m.name} onSelect={() => setNewMaterialId(m.id)} className="text-xs cursor-pointer">
                                <Check className={cn("mr-2 h-3 w-3", newMaterialId === m.id ? "opacity-100" : "opacity-0")} />
                                {m.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-end gap-2">
                  <div className="space-y-1 w-[120px]">
                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cant x Und</Label>
                    <Input type="number" step="0.1" value={newMaterialQty || ""} onChange={e => setNewMaterialQty(Number(parseFloat(e.target.value).toFixed(2)) || 0)} className="h-9 w-full border-gray-200 rounded-xl text-xs" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center justify-between">
                      Tipo Unidad
                      {(newMaterialId || newUnitTypeId || newMaterialQty > 0) && (
                        <button
                          type="button"
                          onClick={() => { setNewMaterialId(null); setNewMaterialQty(0); setNewUnitTypeId(null); }}
                          className="text-[9px] text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                          title="Limpiar selección"
                        >
                          limpiar
                        </button>
                      )}
                    </Label>
                    <Popover>
                      <PopoverTrigger className={cn(buttonVariants({ variant: "outline" }), "w-full justify-between h-9 rounded-xl border-gray-200 font-medium text-xs flex items-center px-3", !newUnitTypeId && "text-gray-400")}>
                        <span className="truncate">{newUnitTypeId ? unitTypes.find(u => u.id === newUnitTypeId)?.name : ""}</span>
                        <Scale className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                      </PopoverTrigger>
                      <PopoverContent className="w-[150px] p-0 rounded-xl shadow-xl border-gray-100">
                        <Command>
                          <CommandInput placeholder="Buscar unidad..." className="h-8 text-xs" />
                          <CommandList className="max-h-32 kanban-scroll">
                            <CommandEmpty className="text-[10px] py-2 text-center">No encontrado.</CommandEmpty>
                            <CommandGroup>
                              {unitTypes.map(u => (
                                <CommandItem key={u.id} value={u.name} onSelect={() => setNewUnitTypeId(u.id)} className="text-xs cursor-pointer">
                                  <Check className={cn("mr-2 h-3 w-3", newUnitTypeId === u.id ? "opacity-100" : "opacity-0")} />
                                  {u.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Button onClick={handleAddMaterial} disabled={!newMaterialId || loading} className="h-9 rounded-xl bg-green-200 hover:bg-green-700 text-black font-bold px-4 transition-all">
                    Agr. Material
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-2">
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)} disabled={loading} className="rounded-xl border-gray-200 font-bold text-gray-500">Cancelar</Button>
            <Button onClick={handleUpdatePart} disabled={loading || !editName} className="rounded-xl font-black bg-blue-600 hover:bg-blue-700 text-white">Actualizar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Operación */}
      <Dialog open={isOpModalOpen} onOpenChange={setIsOpModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader><DialogTitle className="text-xl font-black text-gray-900">Agregar Operación (Mano de Obra)</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-600 uppercase">Nombre de Tarea</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Torneado Final" className="h-10 border-gray-200 rounded-xl" autoFocus />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-600 uppercase">Horas Estimadas</Label>
              <Input type="number" min={1} value={qtyOrDays} onChange={e => setQtyOrDays(Number(parseFloat(e.target.value).toFixed(1)) || 1)} className="h-10 border-gray-200 rounded-xl" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-2">
            <Button variant="outline" onClick={() => setIsOpModalOpen(false)} disabled={loading} className="rounded-xl border-gray-200 font-bold text-gray-500">Cancelar</Button>
            <Button onClick={handleCreateOp} disabled={loading || !name} className="rounded-xl font-black bg-indigo-600 hover:bg-indigo-700 text-white">Guardar Operación</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
