"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createTask, TaskWithRelations } from "@/lib/actions/tasks";
import { calculateEndDateAction, calculateHoursAction, getNextWorkingDayAction } from "@/lib/actions/time";
import { cn } from "@/lib/utils";
import { Clock, Package, Plus, Layers, CheckCircle2, PlayCircle, CheckCheck, GitBranch, UserPlus, Check, X, Loader2, Trash2, Save, Percent, Hash } from "lucide-react";
import Swal from "sweetalert2";
import { TaskStatus } from "@prisma/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Stage = { id: string; name: string; color: string }
type User = { id: string; name: string; email: string; role: string }

type Props = {
  open: boolean
  projectId: string
  stages: Stage[]
  users: User[]
  allTasks: TaskWithRelations[]
  initialStage?: string
  onClose: () => void
  onTaskCreated: (task: TaskWithRelations) => void
  initialParentId?: string | null
  materials: { id: string; name: string }[]
  unitTypes: { id: string; name: string }[]
}

function fromDateTimeInput(str: string): Date {
  return new Date(str)
}

function toDateTimeLocalValue(d: Date | string): string {
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return "";
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  } catch {
    return "";
  }
}

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function getDefaultStartDate(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T08:00`;
}

export function CreateTaskModal({ open, projectId, stages, users, allTasks, initialStage, onClose, onTaskCreated, initialParentId, materials, unitTypes }: Props) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [isAssembly, setIsAssembly] = useState(false);
  const [selectedStage, setSelectedStage] = useState(initialStage ?? stages[0]?.name ?? "Pendiente");
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus>("EN_PROCESO");
  const [progress, setProgress] = useState(0);
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState<number>(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [predecessorIds, setPredecessorIds] = useState<string[]>([]);
  const [parentId, setParentId] = useState<string | null>(initialParentId ?? null);
  const [quantity, setQuantity] = useState(1);
  const [unitHours, setUnitHours] = useState(0);
  const [tempMaterials, setTempMaterials] = useState<{ id: string; name: string; quantityPerUnit: number; unitTypeId: string; unitTypeName: string }[]>([]);
  const [newMaterialId, setNewMaterialId] = useState<string | null>(null);
  const [newMaterialQty, setNewMaterialQty] = useState(0);
  const [newUnitTypeId, setNewUnitTypeId] = useState<string | null>(null);
  const [materialSearch, setMaterialSearch] = useState("");
  const [error, setError] = useState("");
  const isClosingRef = useRef(false);

  const hasChanges = () => {
    return name.trim() !== "" ||
      isAssembly !== false ||
      estimatedHours > 0 ||
      quantity !== 1 ||
      startDate !== getDefaultStartDate() ||
      endDate !== "" ||
      selectedStatus !== "EN_PROCESO" ||
      progress !== 0 ||
      assigneeIds.length > 0 ||
      predecessorIds.length > 0 ||
      parentId !== null ||
      tempMaterials.length > 0;
  };

  const handleCloseAttempt = async () => {
    if (isClosingRef.current) return;

    if (!hasChanges()) {
      onClose();
      return;
    }

    const result = await Swal.fire({
      title: '¿Salir sin guardar?',
      text: "Tienes cambios sin guardar que se perderán.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, salir',
      cancelButtonText: 'Seguir editando',
      confirmButtonColor: '#ef4444',
      heightAuto: false
    });

    if (result.isConfirmed) {
      isClosingRef.current = true;
      onClose();
      setTimeout(() => { isClosingRef.current = false; }, 500);
    }
  };

  const handleAddMaterial = () => {
    if (!newMaterialId) return;
    if (newMaterialQty <= 0) {
      setError("La cantidad de material debe ser mayor a 0");
      return;
    }
    if (!newUnitTypeId) {
      setError("Seleccione una unidad de medida para añadir el material");
      return;
    }
    setError("");
    const mat = materials.find(m => m.id === newMaterialId);
    const ut = unitTypes.find(u => u.id === newUnitTypeId);
    if (!mat) return;
    setTempMaterials([...tempMaterials, {
      id: mat.id,
      name: mat.name,
      quantityPerUnit: newMaterialQty,
      unitTypeId: newUnitTypeId || "",
      unitTypeName: ut?.name || ""
    }]);
    setNewMaterialId(null);
    setNewMaterialQty(0);
    setNewUnitTypeId(null);
  };

  const handleRemoveMaterial = (materialId: string) => {
    setTempMaterials(tempMaterials.filter(m => m.id !== materialId));
  };

  const handlePredecessorChange = async (newIds: string[]) => {
    setPredecessorIds(newIds);
    if (newIds.length === 0) return;

    const selectedDeps = allTasks.filter(t => newIds.includes(t.id));
    if (selectedDeps.length === 0) return;

    const maxEnd = new Date(Math.max(...selectedDeps.map(d => new Date(d.endDate).getTime())));

    setIsCalculating(true);
    try {
      const nextStart = await getNextWorkingDayAction(maxEnd);
      setStartDate(toDateTimeLocalValue(nextStart));
      const newEnd = await calculateEndDateAction(nextStart, estimatedHours);
      setEndDate(toDateTimeLocalValue(newEnd));
    } catch (err) {
      console.error("Error al recalcular fechas por dependencias:", err);
    } finally {
      setIsCalculating(false);
    }
  };

  const [parentSearch, setParentSearch] = useState("");
  const [depSearch, setDepSearch] = useState("");
  const calcHoursTimer = useRef<NodeJS.Timeout | null>(null);
  const calcEndTimer = useRef<NodeJS.Timeout | null>(null);

  const handleCalculateEndDate = useCallback(async (startVal: string, hoursVal: number) => {
    if (!startVal || !hoursVal || hoursVal <= 0) return;
    setIsCalculating(true);
    try {
      const newEnd = await calculateEndDateAction(fromDateTimeInput(startVal), hoursVal);
      setEndDate(toDateTimeLocalValue(newEnd));
      setError("");
    } catch {
      // Silencioso
    } finally {
      setIsCalculating(false);
    }
  }, []);

  const handleCalculateHours = useCallback(async (startVal: string, endVal: string) => {
    if (!startVal || !endVal || startVal.length < 16 || endVal.length < 16) return;
    setIsCalculating(true);
    try {
      const start = fromDateTimeInput(startVal);
      const end = fromDateTimeInput(endVal);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
      const hours = await calculateHoursAction(start, end);
      setEstimatedHours(Number(hours.toFixed(1)));
      setUnitHours(Number((hours / (quantity || 1)).toFixed(1)));
      setError("");
    } catch {
      // Silencioso
    } finally {
      setIsCalculating(false);
    }
  }, [quantity]);

  const onStartDateChange = (val: string) => {
    if (!val || val.length < 16) return;
    const year=Number(val.substring(0, 4));
    const yearMin = new Date().getFullYear() - 5;
    const yearMax = new Date().getFullYear() + 5;
    if (year < yearMin || year > yearMax) {
      setError(`Año fuera de rango (${yearMin}-${yearMax})`);
      return;
    }
    setStartDate(val);
    if (calcEndTimer.current) clearTimeout(calcEndTimer.current);
    calcEndTimer.current = setTimeout(() => handleCalculateEndDate(val, estimatedHours), 500);
  };

  const onEndDateChange = (val: string) => {
    if (!val || val.length < 16) return;
    const year=Number(val.substring(0, 4));
    const yearMin = new Date().getFullYear() - 5;
    const yearMax = new Date().getFullYear() + 5;
    if (year < yearMin || year > yearMax) {
      setError(`Año fuera de rango (${yearMin}-${yearMax})`);
      return;
    }
    setEndDate(val);
    if (calcHoursTimer.current) clearTimeout(calcHoursTimer.current);
    calcHoursTimer.current = setTimeout(() => handleCalculateHours(startDate, val), 500);
  };

  const onHoursChange = (val: number) => {
    setEstimatedHours(val);
    setUnitHours(Number((val / (quantity || 1)).toFixed(1)));
    if (calcEndTimer.current) clearTimeout(calcEndTimer.current);
    calcEndTimer.current = setTimeout(() => handleCalculateEndDate(startDate, val), 500);
  };

  const toggleAssignee = (id: string) => {
    setAssigneeIds((prev: string[]) => prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id]);
  };

  const handleStatusChange = (status: TaskStatus) => {
    setSelectedStatus(status);
    if (status === "HECHO") setProgress(100);
    else if (status === "EN_PROCESO") setProgress(40);
    else if (status === "APROBADO") setProgress(10);
  };

  const handleCreate = () => {
    console.log("MATERIAL")
    if (!name.trim()) { setError("El nombre es obligatorio"); return; }
    if (!startDate) { setError("La fecha de inicio es obligatoria"); return; }
    if (!endDate) { setError("La fecha de fin es obligatoria"); return; }
    if (new Date(endDate) < new Date(startDate)) { setError("La fecha de fin debe ser posterior al inicio"); return; }
    if (estimatedHours <= 0) { setError("Las horas deben ser mayor a 0"); return; }
    if (quantity < 1) { setError("La cantidad debe ser mayor a 0"); return; }
    if (newMaterialId) {
      setError("Material seleccionado no agregado.")
      return
    }
    setError("");

    startTransition(async () => {
      const task = await createTask({
        name: name.trim(),
        projectId,
        isAssembly,
        stage: selectedStage,
        status: selectedStatus,
        progress,
        startDate: fromDateTimeInput(startDate),
        endDate: fromDateTimeInput(endDate),
        estimatedHours,
        assigneeIds,
        predecessorIds,
        parentId: parentId || undefined,
        quantity: quantity,
        unitEstimatedHours: unitHours > 0 ? unitHours : (estimatedHours / (quantity || 1)),
        materialId: tempMaterials[0]?.id || undefined,
        materialQuantityPerUnit: tempMaterials[0]?.quantityPerUnit || 0,
        unitTypeId: tempMaterials[0]?.unitTypeId || undefined
      });

      const newTask: TaskWithRelations = {
        ...task,
        estimatedHours,
        assignees: users.filter((u: User) => assigneeIds.includes(u.id)).map((u: User) => ({ id: u.id, name: u.name })),
        subTasks: [],
        predecessors: predecessorIds.map((id: string) => ({ predecessor: { id, name: allTasks.find((t: TaskWithRelations) => t.id === id)?.name || "" } })),
        successors: [],
        materials: task.materials // Usamos los materiales devueltos por el servidor
      };

      onTaskCreated(newTask);
      setName(""); setIsAssembly(false); setStartDate(getDefaultStartDate()); setEndDate(""); setEstimatedHours(0); setUnitHours(0); setAssigneeIds([]);
      setPredecessorIds([]); setParentId(null); setSelectedStatus("EN_PROCESO"); setProgress(0); setQuantity(1);
      setTempMaterials([]); setNewMaterialId(null); setNewMaterialQty(0); setNewUnitTypeId(null);
      onClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) handleCloseAttempt();
    }}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl kanban-scroll py-6">
        <DialogHeader>
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            {error && !error.includes("material") ? <p className="text-[12px] text-red-500 font-bold px-2 py-2 bg-red-50 rounded-xl  animate-pulse">{error}</p> : null}
            <Button onClick={handleCreate} disabled={isPending || !name.trim()} className="rounded-xl bg-blue-100 hover:bg-blue-300 text-blue-600 font-bold px-8 cursor-pointer h-7 border-none ml-auto mr-4">
              <Save size={14} className="mr-1" />{isPending ? "Creando..." : "Crear"}
            </Button>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-2">
          {/* Columna Izquierda: Datos Básicos */}
          <div className="space-y-4">
            <div className="space-y-1.5 mb-4">
              <Label className="text-[11px] font-black text-gray-800 uppercase tracking-wider flex items-center gap-1 mb-4">
                <Plus size={12} className="text-blue-500" /> Nombre de la tarea / Pieza / Ensamble
              </Label>
              <Input
                autoFocus
                placeholder="Ej: Mecanizado de eje principal..."
                value={name}
                onChange={e => setName(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                className="text-sm h-10 rounded-xl border-gray-200 bg-gray-50/50 focus-visible:ring-gray-300 transition-all font-medium"
              />
            </div>

            {/* Tipo */}
            <div className="flex items-center gap-3 px-1 mb-2">
              <button
                type="button"
                onClick={() => setIsAssembly(false)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold uppercase transition-all border-2 cursor-pointer ${!isAssembly ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm" : "border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200"}`}
              >
                Pieza / Operación
              </button>
              <button
                type="button"
                onClick={() => setIsAssembly(true)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold uppercase transition-all flex items-center justify-center gap-1.5 border-2 cursor-pointer ${isAssembly ? "border-violet-200 bg-violet-50 text-violet-700 shadow-sm" : "border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200"}`}
              >
                <Package size={14} className={isAssembly ? "text-violet-600" : "text-gray-400"} /> Ensamble
              </button>
            </div>

            {/* Progreso */}
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-[11px] font-black tracking-wider uppercase text-gray-800 flex items-center gap-2">
                  <Percent size={12} className="text-blue-500" /> Progreso
                </Label>
                <span className="text-sm font-bold text-blue-600">{progress}%</span>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 bg-blue-600`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="flex justify-between gap-1">
                {[0, 25, 50, 75, 100].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setProgress(val)}
                    className={`flex-1 py-1 rounded-md border text-[10px] font-medium transition-all cursor-pointer ${progress === val ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>

            {/* Estimación, Cantidad y Fechas */}
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase font-black tracking-wider text-gray-800 flex items-center gap-1">
                  <Hash size={12} className="text-blue-500" /> Cantidad
                </Label>
                <Input
                  type="number"
                  min="1"
                  value={quantity || ""}
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    if (isNaN(val)) {
                      setQuantity(0);
                      return;
                    }
                    const q = Math.max(0, val);
                    setQuantity(q);
                    if (unitHours > 0 && q > 0) {
                      const newTotal = Number((q * unitHours).toFixed(1));
                      setEstimatedHours(newTotal);
                      handleCalculateEndDate(startDate, newTotal);
                    }
                  }}
                  className="text-sm h-9 rounded-xl text-gray-500 border-gray-200"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase font-black tracking-wider text-gray-800 flex items-center justify-between">
                  Horas Totales
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={estimatedHours || ""}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    if (isNaN(val)) {
                      onHoursChange(0);
                      return;
                    }
                    onHoursChange(Number(val.toFixed(1)));
                  }}
                  className="text-sm h-9 text-gray-500 rounded-xl border-gray-200"
                />
                <p className="text-[9px] text-gray-500 mt-1">({unitHours.toFixed(1)}h x 1 ud)</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase font-black tracking-wider text-gray-800 flex items-center gap-1"><Clock size={12} className="text-blue-500" /> Inicio</Label>
                <Input type="datetime-local" value={startDate} onChange={e => onStartDateChange(e.target.value)} className="text-sm h-9 text-gray-500 rounded-xl border-gray-200 px-2 w-full" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase font-black tracking-wider text-gray-800 flex items-center justify-between">
                  <span className="flex items-center gap-1"><Clock size={12} className="text-blue-500" /> Fin</span>
                </Label>
                <Input type="datetime-local" value={endDate} onChange={e => onEndDateChange(e.target.value)} className="text-sm h-9 text-gray-500 rounded-xl border-gray-200 px-2 w-full" />
              </div>
            </div>

            {/* Gestión de Materiales */}
            <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100 space-y-4 mx-1 mb-4 sm:h-[370px] h-full">
              <Label className="text-[11px] font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                <Package size={14} className="text-blue-500" /> Lista de Materiales Requeridos
              </Label>

              <div className="space-y-2 max-h-30 overflow-y-auto kanban-scroll pr-2">
                {tempMaterials.map(m => (
                  <div key={m.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-100 shadow-sm transition-all hover:border-blue-200">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-gray-800">{m.name}</span>
                      <span className="text-[10px] text-gray-500 font-medium">{m.quantityPerUnit} {m.unitTypeName || "uds"} x unidad</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveMaterial(m.id)} className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
                {tempMaterials.length === 0 && (
                  <div className="text-center py-6 px-4 bg-white/50 rounded-xl border border-dashed border-gray-200">
                    <Package size={24} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400 italic font-medium">No hay materiales asignados a esta tarea.</p>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-200 grid grid-cols-1 gap-4">
                <div className="space-y-1.5 w-full relative">
                  <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Añadir Material</Label>
                  <Input
                    placeholder="Escribe para buscar ..."
                    value={materialSearch || materials.find(m => m.id === newMaterialId)?.name || ""}
                    onChange={(e) => {
                      setMaterialSearch(e.target.value.toUpperCase());
                      if (!e.target.value) setNewMaterialId(null);
                    }}
                    onFocus={() => setMaterialSearch("")}
                    className="h-9 text-xs bg-white border-gray-200"
                  />
                  {/* limpiar */}
                  {(materialSearch || newMaterialId) && (
                    <button
                      onClick={() => setMaterialSearch("")}
                      className="absolute right-3 top-7 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-md p-0.5 transition-all cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  )}
                  {materialSearch && (
                    <div className="absolute z-20 mt-1 max-w-[300px] max-h-32 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl animate-in fade-in slide-in-from-top-1 kanban-scroll">
                      {materials
                        .filter(m => normalize(m.name).includes(normalize(materialSearch)) && !tempMaterials.some(tm => tm.id === m.id))
                        .map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => { setNewMaterialId(m.id); setMaterialSearch(""); }}
                            className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-gray-100 text-gray-700 transition-colors border-b last:border-0 border-gray-50"
                          >
                            {m.name}
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-center items-center gap-3">
                  <div className="flex-1">
                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cant x Und</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newMaterialQty || ""}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setNewMaterialQty(isNaN(val) ? 0 : Number(val.toFixed(2)));
                      }}
                      className="h-8 border-gray-200 rounded-xl text-xs font-medium"
                    />
                  </div>
                  <div className="w-[160px]">
                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Tipo Unidad</Label>
                    <Select value={unitTypes?.find(u => u.id === newUnitTypeId)?.name || ""} onValueChange={(val) => setNewUnitTypeId(val)}>
                      <SelectTrigger className="h-8 rounded-xl border-gray-200 text-xs font-medium w-full">
                        <SelectValue placeholder="seleccione..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl shadow-xl border-gray-100">
                        {unitTypes.map(u => (
                          <SelectItem key={u.id} value={u.id} className="text-xs">{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAddMaterial} disabled={!newMaterialId || isPending} className="h-8 rounded-xl self-end cursor-pointer bg-blue-100 hover:bg-blue-300 text-blue-600 font-bold px-6 transition-all active:scale-95">
                    {isPending ? <Loader2 size={16} className="animate-spin" /> : "+Agr. Material"}
                  </Button>
                </div>
                {error.includes("material") && <p className="text-[12px] text-red-500 font-bold px-2 py-2 bg-red-50 rounded-xl  animate-pulse">{error}</p>}
              </div>
            </div>

          </div>

          {/* Columna Derecha: Configuración y Relaciones */}
          <div className="space-y-5">
            {/* Estado y Etapa */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-black text-gray-800 uppercase tracking-wider">Estado Inicial</Label>
                <div className="grid grid-cols-1 gap-1">
                  {[
                    { id: 'APROBADO', label: 'Aprobado', icon: CheckCircle2 },
                    { id: 'EN_PROCESO', label: 'En proceso', icon: PlayCircle },
                    { id: 'HECHO', label: 'Hecho', icon: CheckCheck },
                  ].map((status) => (
                    <button
                      key={status.id}
                      type="button"
                      onClick={() => handleStatusChange(status.id as TaskStatus)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${selectedStatus === status.id
                        ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
                        : "bg-white text-gray-400 border-gray-100 hover:border-gray-200"
                        }`}
                    >
                      <status.icon size={12} />
                      {status.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-black text-gray-800 uppercase tracking-wider">Etapa Inicial</Label>
                <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto kanban-scroll">
                  {stages.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedStage(s.name)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${selectedStage === s.name
                        ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
                        : "bg-white text-gray-400 border-gray-100 hover:border-gray-200"
                        }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Pertenece a: */}
            <div className="space-y-1.5 mt-4">
              <Label className="text-[11px] font-black text-gray-800 uppercase tracking-wider flex items-center gap-1">
                <Layers size={12} className="text-blue-500" /> Pertenece a:
              </Label>
              <Input
                placeholder="Buscar pieza padre..."
                value={parentSearch}
                onChange={e => setParentSearch(e.target.value)}
                className="h-8 text-[11px] rounded-lg border-gray-100"
              />
              <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded-xl border border-gray-100 space-y-1 kanban-scroll">
                <button
                  type="button"
                  onClick={() => setParentId(null)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${parentId === null ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-gray-100 text-gray-400"}`}
                >
                  (Ninguno)
                </button>
                {allTasks
                  .filter(t => normalize(t.name).includes(normalize(parentSearch)))
                  .slice(0, 10)
                  .map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (predecessorIds.includes(t.id)) {
                          Swal.fire('Error', 'No puedes pertenecer a una pieza que es tu propia dependencia.', 'error');
                          return;
                        }
                        setParentId(t.id);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${parentId === t.id ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-gray-100 text-gray-500 hover:border-blue-200"}`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {t.isAssembly && <Package size={11} className="text-blue-400 shrink-0" />}
                        <span className="truncate">{t.name}</span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>

            {/* Dependencias */}
            <div className="space-y-1.5 mt-8">
              <Label className="text-[11px] font-black text-gray-800 uppercase tracking-wider flex items-center gap-1">
                <GitBranch size={12} className="text-blue-500" /> Depende de:
              </Label>
              <Input
                placeholder="Buscar dependencia..."
                value={depSearch}
                onChange={e => setDepSearch(e.target.value)}
                className="h-8 text-[11px] rounded-lg border-gray-100"
              />
              <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded-xl border border-gray-100 space-y-1 kanban-scroll">
                {allTasks
                  .filter(t => normalize(t.name).includes(normalize(depSearch)))
                  .map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (parentId === t.id) {
                          Swal.fire('Error', 'No puedes depender de la pieza a la que perteneces.', 'error');
                          return;
                        }
                        handlePredecessorChange(predecessorIds.includes(t.id) ? predecessorIds.filter(x => x !== t.id) : [...predecessorIds, t.id]);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${predecessorIds.includes(t.id) ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white border-gray-100 text-gray-500 hover:border-gray-200"}`}
                    >
                      <span className="truncate">{t.name}</span>
                      {predecessorIds.includes(t.id) && <CheckCircle2 size={11} />}
                    </button>
                  ))}
              </div>
            </div>

            {/* Asignados */}
            <div className="space-y-1.5 px-1 mt-8">
              <Label className="text-[11px] font-black text-gray-800 uppercase tracking-wider">Asignados</Label>
              <div className="flex flex-wrap gap-2 items-center p-2 bg-gray-50 rounded-2xl border border-gray-100 min-h-[50px]">
                <Popover>
                  <PopoverTrigger className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-dashed border-gray-200 text-xs font-bold text-gray-700 hover:text-gray-900 hover:border-gray-400 hover:bg-white transition-all cursor-pointer">
                    <UserPlus size={14} /> Añadir
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-0 rounded-2xl shadow-xl border-gray-100" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar usuario..." className="text-xs h-10" />
                      <CommandList className="kanban-scroll">
                        <CommandEmpty className="py-2 px-4 text-xs text-gray-500">No hay usuarios.</CommandEmpty>
                        <CommandGroup>
                          {users.map(u => (
                            <CommandItem
                              key={u.id}
                              value={u.name}
                              onSelect={() => toggleAssignee(u.id)}
                              className="cursor-pointer text-xs p-2"
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${assigneeIds.includes(u.id) ? "bg-blue-600" : "bg-gray-400"}`}>
                                  {u.name.charAt(0)}
                                </div>
                                <span className="font-bold">{u.name.split(" ")[0]}</span>
                              </div>
                              <Check className={cn("ml-auto h-3 w-3 text-blue-600", assigneeIds.includes(u.id) ? "opacity-100" : "opacity-0")} />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {assigneeIds.map(id => {
                  const u = users.find(x => x.id === id);
                  if (!u) return null;
                  return (
                    <div key={u.id} className="flex items-center gap-2 shrink-0 px-2.5 py-1.5 bg-white text-gray-700 rounded-xl border border-gray-200 text-xs font-bold shadow-sm">
                      <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[9px] font-black">{u.name.charAt(0)}</div>
                      {u.name.split(" ")[0]}
                      <button type="button" onClick={() => toggleAssignee(u.id)} className="ml-1 text-gray-300 hover:text-red-500 transition-colors">✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
