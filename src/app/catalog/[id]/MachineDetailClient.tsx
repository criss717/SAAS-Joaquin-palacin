"use client";

import { useState } from "react";
import { createCatalogPart, createCatalogOperation, deleteCatalogPart, deleteCatalogOperation } from "@/lib/actions/catalog-parts";
import { Plus, Trash2, Wrench, Layers, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { toast } from "sonner";
import Swal from "sweetalert2";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

export type Operation = { id: string; name: string; estimatedHours: number; orderIndex: number; partId: string };
export interface Part {
  id: string;
  name: string;
  parentId: string | null;
  quantity: number;
  subParts: Part[];
  operations: Operation[];
}
export type Machine = { id: string; name: string; description: string | null; parts: Part[] };

const normalize = (s: string) => 
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function MachineDetailClient({ initialMachine }: { initialMachine: Machine }) {
  const [machine, setMachine] = useState<Machine>(initialMachine);

  const [isPartModalOpen, setIsPartModalOpen] = useState(false);
  const [isOpModalOpen, setIsOpModalOpen] = useState(false);

  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [qtyOrDays, setQtyOrDays] = useState(1);
  const [loading, setLoading] = useState(false);

  // Estados de Buscador y Paginación
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Top level parts
  const rootParts = machine.parts.filter(p => !p.parentId);

  const openAddPart = (parentId: string | null) => {
    setName("");
    setQtyOrDays(1);
    setSelectedParentId(parentId);
    setIsPartModalOpen(true);
  };

  const openAddOp = (partId: string) => {
    setName("");
    setQtyOrDays(1);
    setSelectedPartId(partId);
    setIsOpModalOpen(true);
  };

  const handleCreatePart = async () => {
    if (!name.trim()) return;
    setLoading(true);
    const res = await createCatalogPart({ name, machineId: machine.id, parentId: selectedParentId || undefined, quantity: qtyOrDays });
    if (res.success && res.part) {
      setMachine(prev => ({
        ...prev,
        parts: [...prev.parts, { ...res.part, subParts: [], operations: [] } as Part]
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

  // Lógica de Filtrado Recursivo
  const matchesSearch = (part: Part, term: string): boolean => {
    if (!term) return true;
    const normalizedTerm = normalize(term);
    // ¿Coincide esta pieza?
    if (normalize(part.name).includes(normalizedTerm)) return true;
    // ¿Coincide alguna sub-pieza?
    const children = machine.parts.filter(p => p.parentId === part.id);
    return children.some(c => matchesSearch(c, term));
  };

  const renderPart = (part: Part, depth: number = 0) => {
    // Si estamos buscando y esta pieza no coincide ni tiene hijos que coincidan, no renderizamos
    if (searchTerm && !matchesSearch(part, searchTerm)) return null;

    const children = machine.parts.filter(p => p.parentId === part.id);
    const isHighlight = searchTerm && normalize(part.name).includes(normalize(searchTerm));

    return (
      <div key={part.id} className="border-l-2 border-gray-100 pl-4 py-2 mt-2 relative">
        <div className="absolute -left-6 top-4 w-6 border-t-2 border-gray-100 hidden sm:block"></div>

        {/* Encabezado de la Pieza */}
        <div className={`bg-white border border-gray-200 shadow-sm rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group transition-all duration-500 ${isHighlight ? 'ring-2 ring-blue-500 bg-blue-50 shadow-blue-100 animate-pulse-subtle' : ''
          }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${depth === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-50 text-blue-600'}`}>
              <Layers size={18} />
            </div>
            <div>
              <div className="font-bold text-gray-900 flex items-center gap-2">
                {part.name}
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">x{part.quantity}</span>
              </div>
              <div className="text-xs text-gray-400">Pieza / Ensamble (Se creará como Agrupador)</div>
            </div>
          </div>

          <div className="flex items-center gap-2 opacity-100 sm:opacity-50 group-hover:opacity-100 transition-opacity">
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

        {/* Lista de Operaciones */}
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

        {/* Recursividad para hijos */}
        {children.length > 0 && (
          <div className="ml-2 sm:ml-6 border-l-2 border-gray-100">
            {children.map(c => renderPart(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Filtrado y Paginación de rootParts
  const filteredRootParts = rootParts.filter(p => matchesSearch(p, searchTerm));
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

          <div className="flex-1 w-full md:max-w-md relative group">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            <Input
              placeholder="Buscar pieza o ensamble..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1); // Reset al buscar
              }}
              className="pl-10 h-11 border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 focus:bg-white bg-gray-50 rounded-xl transition-all font-medium text-gray-700"
            />
            {searchTerm && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded-lg">
                {filteredRootParts.length} resultados
              </div>
            )}
          </div>

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

        {/* Controles de Paginación */}
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

      {/* Modal Pieza */}
      <Dialog open={isPartModalOpen} onOpenChange={setIsPartModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader><DialogTitle className="text-xl font-black text-gray-900">Agregar Pieza o Ensamble</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-600 uppercase">Nombre</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Sinfín Central" className="h-10 border-gray-200 rounded-xl" autoFocus />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-600 uppercase">Cantidad</Label>
              <Input type="number" min={1} value={qtyOrDays} onChange={e => setQtyOrDays(parseInt(e.target.value) || 1)} className="h-10 border-gray-200 rounded-xl" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-2">
            <Button variant="outline" onClick={() => setIsPartModalOpen(false)} disabled={loading} className="rounded-xl border-gray-200 font-bold text-gray-500">Cancelar</Button>
            <Button onClick={handleCreatePart} disabled={loading || !name} className="rounded-xl font-black bg-blue-600 hover:bg-blue-700 text-white">Guardar Pieza</Button>
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
              <Input type="number" min={1} value={qtyOrDays} onChange={e => setQtyOrDays(parseInt(e.target.value) || 1)} className="h-10 border-gray-200 rounded-xl" />
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
